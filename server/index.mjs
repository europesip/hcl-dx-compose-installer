// HCL DX Compose Installer · server: the web page (the build in dist/) and a small API that runs the
// AWS scripts of server/aws (create or delete an environment) and streams their output to the page.
//
// The installation itself (files, steps, RUNBOOK.md, the zip and the Word script) is generated in the
// browser. The AWS credentials typed in the page are used only for the script they start: they go to
// that process's environment and are never written to disk or logged.
import http from "node:http";
import {spawn, execFile} from "node:child_process";
import {randomUUID, timingSafeEqual} from "node:crypto";
import {readFile, writeFile, stat, readdir, mkdir} from "node:fs/promises";
import {createReadStream, existsSync} from "node:fs";
import {join, extname, resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {zipBytes} from "../src/zip.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(process.env.DIST_DIR || join(HERE, "..", "dist"));
const AWS_DIR = join(HERE, "aws");
const WORK = resolve(process.env.WORK_DIR || "/tmp/dx-installer");
const PORT = Number(process.env.PORT || 8080);
const VERSION = process.env.APP_VERSION || JSON.parse(await readFile(join(HERE, "..", "package.json"), "utf8")).version;
const AWS_ENABLED = process.env.AWS_ENABLED !== "false";
const AUTH_USER = process.env.AUTH_USER || "", AUTH_PASSWORD = process.env.AUTH_PASSWORD || "";
await mkdir(WORK, {recursive: true});

// ssh needs the current uid in /etc/passwd. With an arbitrary uid (OpenShift, docker --user) it is not
// there and the root file system is read-only: nss_wrapper gives the AWS scripts a passwd file of their own.
const NSS = {};
try {
  const uid = process.getuid(), gid = process.getgid(), passwd = await readFile("/etc/passwd", "utf8");
  if (!passwd.split("\n").some(l => l.split(":")[2] === String(uid)) && existsSync("/usr/local/lib/libnss_wrapper.so")) {
    await writeFile(join(WORK, "passwd"), passwd.trimEnd() + `\ninstaller:x:${uid}:${gid}:installer:/tmp:/bin/sh\n`);
    Object.assign(NSS, {LD_PRELOAD: "/usr/local/lib/libnss_wrapper.so", NSS_WRAPPER_PASSWD: join(WORK, "passwd"), NSS_WRAPPER_GROUP: "/etc/group"});
  }
} catch { /* not Linux or no /etc/passwd */ }

const MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8"};
const SECURITY = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

// ---------------------------------------------------------------------------------------------
// Jobs: one AWS script run (create or delete), its output and its result
// ---------------------------------------------------------------------------------------------
const jobs = new Map();
const KINDS = {ec2: ["ec2-create.sh", "ec2-destroy.sh"], eks: ["eks-create.sh", "eks-destroy.sh"], rosa: ["rosa-create.sh", "rosa-destroy.sh"]};
const RE = {
  name: /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/, region: /^[a-z]{2}(-[a-z]+)+-\d$/, type: /^[a-z][a-z0-9-]*\.[0-9]*[a-z0-9]+$/,
  cidr: /^((\d{1,3}\.){3}\d{1,3}\/\d{1,2})(,(\d{1,3}\.){3}\d{1,3}\/\d{1,2}){0,4}$/, int: /^\d{1,4}$/, key: /^[A-Z0-9]{16,128}$/, secret: /^[A-Za-z0-9/+=]{16,128}$/,
};
const FILES = ["kubeconfig", "README.txt", "cluster-admin.txt"];   // + <name>.pem

function publicJob(j){
  return {id: j.id, kind: j.kind, action: j.action, name: j.name, region: j.region, status: j.status, steps: j.steps, device: j.device,
    result: j.result, error: j.error, started: j.started, ended: j.ended, files: j.files};
}

function startJob({kind, action, params = {}, creds = {}}){
  if (!AWS_ENABLED) throw new Error("the AWS functions are disabled in this installer");
  const scripts = KINDS[kind]; if (!scripts) throw new Error("unknown kind");
  if (!["create", "destroy"].includes(action)) throw new Error("unknown action");
  const name = String(params.name || ""), region = String(params.region || "");
  if (!RE.name.test(name)) throw new Error("invalid name");
  if (!RE.region.test(region)) throw new Error("invalid region");
  for (const j of jobs.values()) if (j.name === name && j.status === "running") throw new Error(`a job for ${name} is already running`);
  if (!RE.key.test(creds.accessKeyId || "") || !RE.secret.test(creds.secretAccessKey || "")) throw new Error("invalid AWS credentials");
  const env = {
    PATH: process.env.PATH, HOME: join(WORK, "home"), USER: "installer", LANG: "C.UTF-8",
    AWS_ACCESS_KEY_ID: creds.accessKeyId, AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    NAME: name, REGION: region, OUT: join(WORK, "out", name), ...NSS,
  };
  if (creds.sessionToken) env.AWS_SESSION_TOKEN = String(creds.sessionToken);
  if (params.instanceType) { if (!RE.type.test(params.instanceType)) throw new Error("invalid instance type"); env.INSTANCE_TYPE = env.NODE_TYPE = params.instanceType; }
  if (params.nodes) { if (!RE.int.test(String(params.nodes))) throw new Error("invalid nodes"); env.NODES = String(params.nodes); }
  if (params.diskGb) { if (!RE.int.test(String(params.diskGb))) throw new Error("invalid disk"); env.DISK_GB = String(params.diskGb); }
  if (params.allowedCidr) { if (!RE.cidr.test(params.allowedCidr)) throw new Error("invalid CIDR"); env.ALLOWED_CIDR = params.allowedCidr; }
  if (kind === "rosa") {     // Red Hat sign-in: service account, offline token or device code (see server/aws/lib.sh)
    const mode = creds.rhAuth || "token";
    if (mode === "sa") {
      if (!/^[A-Za-z0-9._@-]{8,256}$/.test(creds.rhClientId || "") || !/^[\x21-\x7e]{8,512}$/.test(creds.rhClientSecret || "")) throw new Error("invalid Red Hat service account");
      env.RHCS_CLIENT_ID = creds.rhClientId; env.RHCS_CLIENT_SECRET = creds.rhClientSecret;
    } else if (mode === "device") {
      env.RH_DEVICE_CODE = "1";
    } else {
      if (!/^[A-Za-z0-9._-]{20,4096}$/.test(creds.rhcsToken || "")) throw new Error("invalid Red Hat token");
      env.RHCS_TOKEN = creds.rhcsToken;
    }
  }

  const id = randomUUID(), script = join(AWS_DIR, scripts[action === "create" ? 0 : 1]);
  const j = {id, kind, action, name, region, status: "running", steps: [], lines: [], result: null, error: "", started: Date.now(), ended: 0, files: [], clients: new Set()};
  jobs.set(id, j);
  const secrets = [creds.secretAccessKey, creds.sessionToken, creds.rhcsToken, creds.rhClientSecret].filter(Boolean);
  const emit = (type, data) => { for (const c of j.clients) c.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); };
  const onLine = raw => {
    let line = raw; for (const s of secrets) line = line.split(s).join("********");
    if (line.startsWith("::step:: ")) { const st = line.slice(9); j.steps.push(st); emit("step", st); }
    else if (line.startsWith("::device-url:: ")) { j.device = {...(j.device || {}), url: line.slice(15).trim()}; emit("device", j.device); }
    else if (line.startsWith("::device-code:: ")) { j.device = {...(j.device || {}), code: line.slice(16).trim()}; emit("device", j.device); }
    else if (line.startsWith("::result:: ")) { try { j.result = JSON.parse(line.slice(11)); } catch { /* ignore */ } }
    else { j.lines.push(line); if (j.lines.length > 5000) j.lines.splice(0, 1000); emit("line", line); }
  };
  mkdir(env.HOME, {recursive: true}).then(() => {
    const p = spawn("bash", [script], {env, cwd: WORK, detached: true, stdio: ["ignore", "pipe", "pipe"]});
    j.pid = p.pid;
    for (const s of [p.stdout, p.stderr]) {
      let buf = "";
      s.setEncoding("utf8");
      s.on("data", d => { buf += d; let k; while ((k = buf.indexOf("\n")) >= 0) { onLine(buf.slice(0, k)); buf = buf.slice(k + 1); } });
      s.on("end", () => { if (buf) onLine(buf); });
    }
    p.on("close", async code => {
      j.status = code === 0 ? "done" : (j.status === "cancelled" ? "cancelled" : "failed");
      if (code !== 0 && !j.error) j.error = j.lines.filter(l => /ERROR|error/.test(l)).slice(-1)[0] || `exit code ${code}`;
      j.ended = Date.now();
      try { j.files = (await readdir(env.OUT)).filter(f => FILES.includes(f) || f === `${name}.pem`); } catch { j.files = []; }
      emit("end", publicJob(j));
      for (const c of j.clients) c.end();
      j.clients.clear();
    });
  });
  return j;
}

// ---------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------
function send(res, code, body, headers = {}){
  const isObj = body !== null && typeof body === "object" && !(body instanceof Uint8Array);
  res.writeHead(code, {...SECURITY, "Cache-Control": "no-store", ...(isObj ? {"Content-Type": "application/json"} : {}), ...headers});
  res.end(isObj ? JSON.stringify(body) : body);
}
async function readJson(req){
  let n = 0; const chunks = [];
  for await (const c of req) { n += c.length; if (n > 64 * 1024) throw new Error("body too large"); chunks.push(c); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function authorised(req){
  if (!AUTH_USER) return true;
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  const [u, ...rest] = Buffer.from(h.slice(6), "base64").toString("utf8").split(":");
  const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
  return eq(u, AUTH_USER) & eq(rest.join(":"), AUTH_PASSWORD);
}
const run = (cmd, args, env) => new Promise(ok => execFile(cmd, args, {env, timeout: 30000}, (err, stdout, stderr) => ok({err, stdout, stderr})));
let myIp = "";

async function api(req, res, url){
  const path = url.pathname;
  if (path === "/api/info") return send(res, 200, {version: VERSION, aws: AWS_ENABLED});
  if (path === "/api/myip") {
    // The public IP of the browser (through the Ingress: X-Forwarded-For / X-Real-IP). When the page is
    // used on the same network or machine (a private address), the public IP of this server is the same one.
    const isPublic = ip => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && !/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip);
    const seen = [...String(req.headers["x-forwarded-for"] || "").split(","), req.headers["x-real-ip"], req.socket.remoteAddress]
      .map(x => String(x || "").trim().replace(/^::ffff:/, ""));
    const client = seen.find(isPublic);
    if (!myIp) { const r = await run("curl", ["-s", "--max-time", "8", "https://checkip.amazonaws.com"], process.env); myIp = (r.stdout || "").trim(); }
    return send(res, 200, {ip: client || (/^[\d.]+$/.test(myIp) ? myIp : ""), server: /^[\d.]+$/.test(myIp) ? myIp : ""});
  }
  if (path === "/api/aws/check" && req.method === "POST") {
    if (!AWS_ENABLED) return send(res, 403, {error: "disabled"});
    const b = await readJson(req), c = b.creds || {};
    if (!RE.key.test(c.accessKeyId || "") || !RE.secret.test(c.secretAccessKey || "")) return send(res, 400, {error: "invalid AWS credentials"});
    if (!RE.region.test(b.region || "")) return send(res, 400, {error: "invalid region"});
    const env = {PATH: process.env.PATH, HOME: join(WORK, "home"), AWS_ACCESS_KEY_ID: c.accessKeyId, AWS_SECRET_ACCESS_KEY: c.secretAccessKey,
      ...(c.sessionToken ? {AWS_SESSION_TOKEN: c.sessionToken} : {}), AWS_REGION: b.region, AWS_PAGER: ""};
    const r = await run("aws", ["sts", "get-caller-identity", "--output", "json"], env);
    if (r.err) return send(res, 400, {error: (r.stderr || r.err.message).split("\n").filter(Boolean).slice(-1)[0]});
    const id = JSON.parse(r.stdout);
    const vpc = await run("aws", ["ec2", "describe-vpcs", "--filters", "Name=isDefault,Values=true", "--query", "Vpcs[0].VpcId", "--output", "text"], env);
    return send(res, 200, {account: id.Account, arn: id.Arn, defaultVpc: (vpc.stdout || "").trim().startsWith("vpc-")});
  }
  if (path === "/api/jobs" && req.method === "POST") {
    try { return send(res, 200, publicJob(startJob(await readJson(req)))); }
    catch (e) { return send(res, 400, {error: e.message}); }
  }
  if (path === "/api/jobs" && req.method === "GET") return send(res, 200, [...jobs.values()].map(publicJob));
  const m = path.match(/^\/api\/jobs\/([0-9a-f-]{36})(\/events|\/cancel|\/files\/([A-Za-z0-9._-]+))?$/);
  if (m) {
    const j = jobs.get(m[1]); if (!j) return send(res, 404, {error: "not found"});
    if (!m[2]) return send(res, 200, {...publicJob(j), lines: j.lines.slice(-500)});
    if (m[2] === "/events") {
      res.writeHead(200, {...SECURITY, "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no"});
      for (const s of j.steps) res.write(`event: step\ndata: ${JSON.stringify(s)}\n\n`);
      if (j.device) res.write(`event: device\ndata: ${JSON.stringify(j.device)}\n\n`);
      for (const l of j.lines.slice(-500)) res.write(`event: line\ndata: ${JSON.stringify(l)}\n\n`);
      if (j.status !== "running") { res.write(`event: end\ndata: ${JSON.stringify(publicJob(j))}\n\n`); return res.end(); }
      j.clients.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 20000);
      req.on("close", () => { clearInterval(ping); j.clients.delete(res); });
      return;
    }
    if (m[2] === "/cancel" && req.method === "POST") {
      if (j.status === "running" && j.pid) { j.status = "cancelled"; try { process.kill(-j.pid, "SIGTERM"); } catch { /* gone */ } }
      return send(res, 200, publicJob(j));
    }
    if (m[3]) {
      const f = m[3];
      if (!(FILES.includes(f) || f === `${j.name}.pem`)) return send(res, 404, {error: "not found"});
      const p = join(WORK, "out", j.name, f);
      if (!existsSync(p)) return send(res, 404, {error: "not found"});
      return send(res, 200, await readFile(p), {"Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${f}"`});
    }
  }
  if (path === "/api/aws/scripts.zip") {
    const names = (await readdir(AWS_DIR)).filter(f => f.endsWith(".sh")).sort();
    const files = await Promise.all(names.map(async n => ({name: `aws/${n}`, text: await readFile(join(AWS_DIR, n), "utf8"), mode: n === "lib.sh" || n === "ec2-userdata.sh" ? 0o100644 : 0o100755})));
    return send(res, 200, zipBytes(files), {"Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="dx-compose-aws-scripts.zip"'});
  }
  return send(res, 404, {error: "not found"});
}

async function serveStatic(req, res, url){
  let p = decodeURIComponent(url.pathname);
  if (p.includes("\0")) return send(res, 400, "bad request");
  let file = resolve(DIST, "." + p);
  if (!file.startsWith(DIST)) return send(res, 403, "forbidden");
  let st = await stat(file).catch(() => null);
  if (!st || st.isDirectory()) { file = join(DIST, "index.html"); st = await stat(file).catch(() => null); }
  if (!st) return send(res, 404, "not found");
  const cache = file.includes(`${DIST}/assets/`) ? "public, max-age=31536000, immutable" : "no-cache";
  res.writeHead(200, {...SECURITY, "Content-Type": MIME[extname(file)] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": cache});
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/healthz") return send(res, 200, "ok", {"Content-Type": "text/plain"});
  if (!authorised(req)) return send(res, 401, "authentication required", {"WWW-Authenticate": 'Basic realm="HCL DX Compose Installer"', "Content-Type": "text/plain"});
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "method not allowed");
    return await serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, {error: "internal error"});
  }
});
server.listen(PORT, () => console.log(`HCL DX Compose Installer ${VERSION} on :${PORT} (AWS ${AWS_ENABLED ? "enabled" : "disabled"})`));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => {
  for (const j of jobs.values()) if (j.status === "running" && j.pid) try { process.kill(-j.pid, "SIGTERM"); } catch { /* gone */ }
  server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref();
});
