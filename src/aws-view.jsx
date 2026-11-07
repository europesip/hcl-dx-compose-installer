// AWS: estimate, credentials, create the environment (the installer server runs server/aws/*.sh and
// streams their output), use it and delete it.
import {useEffect, useRef, useState} from "react";
import {Nav, Card, Title, H2, Choice, Button, Field, Input, Secret, Select, Check, Callout, Code, Badge, cx,
        IconServer, IconCloud, IconLayers, IconDownload, IconTrash, IconWarn, IconCheck, Spinner} from "./ui.jsx";
import {AWS_KINDS, EC2_TYPES, REGIONS, estimate, money, api} from "./aws.js";

const STEPS = {create: {ec2: 7, eks: 8, rosa: 9}, destroy: {ec2: 4, eks: 5, rosa: 4}};
const load = () => { try { return JSON.parse(localStorage.getItem("dxi-aws") || "{}"); } catch { return {}; } };
const save = v => { try { localStorage.setItem("dxi-aws", JSON.stringify(v)); } catch { /* */ } };

export function EnvAws({t, lang, form, set, go, back, info}){
  const saved = load();
  const [kind, setKind] = useState(form.awsKind || "ec2");
  const [creds, setCreds] = useState({accessKeyId: "", secretAccessKey: "", sessionToken: "", rhcsToken: ""});
  const [region, setRegion] = useState(saved.region || "eu-west-1");
  const [who, setWho] = useState(null), [checking, setChecking] = useState(false), [checkErr, setCheckErr] = useState("");
  const [p, setP] = useState(() => ({name: saved.name || "dx-compose-poc", ...AWS_KINDS[kind].defaults, allowedCidr: ""}));
  const [accept, setAccept] = useState(false);
  const [job, setJob] = useState(null);      // {id, action, status, steps, lines, result, error, files}
  const [env, setEnv] = useState(saved.env || null);   // the created environment (result of a create job)
  const [showLog, setShowLog] = useState(false);
  const [manage, setManage] = useState(false), [delName, setDelName] = useState(""), [delKind, setDelKind] = useState("ec2");
  const es = useRef(null);
  const noServer = info === false || (info && info.aws === false);

  useEffect(() => { setP(x => ({...AWS_KINDS[kind].defaults, name: x.name, allowedCidr: x.allowedCidr})); setAccept(false); set({awsKind: kind}); }, [kind]);
  useEffect(() => { if (!noServer) api("/api/myip").then(r => r.ip && setP(x => x.allowedCidr ? x : {...x, allowedCidr: r.ip + "/32"})).catch(() => {}); }, [noServer]);
  useEffect(() => { save({region, name: p.name, env, jobId: job?.id}); }, [region, p.name, env, job?.id]);
  useEffect(() => {   // after a reload, follow a job that is still running
    if (saved.jobId && !noServer) api(`/api/jobs/${saved.jobId}`).then(j => { setJob(j); if (j.status === "running") follow(j.id); }).catch(() => {});
    return () => es.current?.close();
  }, []);

  function follow(id){
    es.current?.close();
    const src = new EventSource(`/api/jobs/${id}/events`);
    es.current = src;
    setJob(j => ({...j, steps: [], lines: []}));
    src.addEventListener("step", e => setJob(j => ({...j, steps: [...(j.steps || []), JSON.parse(e.data)]})));
    src.addEventListener("line", e => setJob(j => ({...j, lines: [...(j.lines || []).slice(-800), JSON.parse(e.data)]})));
    src.addEventListener("end", e => {
      const fin = JSON.parse(e.data); src.close();
      setJob(j => ({...j, ...fin}));
      if (fin.status === "done" && fin.action === "create" && fin.result) applyEnv(fin);
      if (fin.status === "done" && fin.action === "destroy") setEnv(v => v && v.name === fin.name ? null : v);
    });
    src.onerror = () => { /* the browser retries by itself */ };
  }
  function applyEnv(fin){
    const r = fin.result;
    setEnv({...r, jobId: fin.id, files: fin.files});
    set({envSource: "aws", awsKind: r.type, platform: r.platform, DX_HOST: r.dxHost, INGRESS_KIND: r.ingress === "nginx" ? "nginx" : "traefik",
         SC_RWO: r.scRwo, SC_RWX: r.scRwx, envConfirmed: true});
  }

  async function check(){
    setChecking(true); setCheckErr(""); setWho(null);
    try { setWho(await api("/api/aws/check", {method: "POST", body: {creds, region}})); }
    catch (e) { setCheckErr(e.message); } finally { setChecking(false); }
  }
  async function start(action, k = kind, name = p.name){
    const params = action === "create" ? {...p, region} : {name, region};
    try {
      const j = await api("/api/jobs", {method: "POST", body: {kind: k, action, params, creds}});
      setJob(j); setShowLog(false); follow(j.id);
    } catch (e) { setJob({status: "failed", action, error: e.message, steps: [], lines: []}); }
  }
  const cancel = () => job?.id && api(`/api/jobs/${job.id}/cancel`, {method: "POST"}).catch(() => {});
  const askDelete = (k, name) => { const v = window.prompt(t.confirmDelete(name)); if (v === name) start("destroy", k, name); };

  const running = job?.status === "running";
  const est = estimate(kind, p);
  const credsOk = !!who;
  const nameOk = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(p.name);
  const canCreate = credsOk && nameOk && accept && !running && (kind !== "rosa" || creds.rhcsToken.length > 20) && (kind !== "ec2" || who.defaultVpc);
  const kinds = [["ec2", t.kEc2, t.kEc2T, <IconServer key="1" />], ["eks", t.kEks, t.kEksT, <IconCloud key="2" />], ["rosa", t.kRosa, t.kRosaT, <IconLayers key="3" />]];

  const credsCard = (
          <Card className="space-y-4">
            <H2>{t.awsCreds}</H2>
            <p className="text-xs text-slate-500">{t.credsHint}</p>
            <Field label={t.accessKey}><Input mono value={creds.accessKeyId} onChange={e => { setCreds({...creds, accessKeyId: e.target.value.trim()}); setWho(null); }} placeholder="AKIA…" /></Field>
            <Field label={t.secretKey}><Secret value={creds.secretAccessKey} onChange={e => { setCreds({...creds, secretAccessKey: e.target.value.trim()}); setWho(null); }} /></Field>
            <Field label={`${t.sessionToken} (${t.optional})`}><Secret value={creds.sessionToken} onChange={e => setCreds({...creds, sessionToken: e.target.value.trim()})} /></Field>
            <div className="flex items-end gap-3">
              <Field label={t.region} className="flex-1"><Select value={region} onChange={e => { setRegion(e.target.value); setWho(null); }}>{REGIONS.map(r => <option key={r}>{r}</option>)}</Select></Field>
              <Button variant="secondary" onClick={check} disabled={checking || !creds.accessKeyId || !creds.secretAccessKey}>{checking ? <><Spinner />{t.checking}</> : t.check}</Button>
            </div>
            {checkErr && <Callout tone="error">{checkErr}</Callout>}
            {who && <Callout tone="ok"><b>{t.account}:</b> {who.account}<br /><span className="break-all text-xs">{who.arn}</span></Callout>}
            {who && kind === "ec2" && !who.defaultVpc && <Callout tone="warn">{t.noDefaultVpc}</Callout>}
          </Card>
  );

  return (
    <div>
      <Title>{t.awsTitle}</Title>
      <Callout tone="warn" title={<span className="flex items-center gap-2"><IconWarn className="h-4 w-4" />{t.awsWarnT}</span>} className="mb-6">{t.awsWarn}</Callout>

      <div className="grid gap-5 lg:grid-cols-3">
        {kinds.map(([k, title, text, icon]) => {
          const e = estimate(k, k === kind ? p : AWS_KINDS[k].defaults);
          return (
            <Choice key={k} selected={kind === k} onClick={() => !running && setKind(k)} icon={icon} title={title}
              badge={k === "ec2" ? t.recommended : k === "rosa" ? t.experimental : null} tone={k === "rosa" ? "amber" : "blue"}>
              {text}
              <span className="mt-4 block w-full rounded-xl bg-slate-50 p-3 dark:bg-navy-950">
                <span className="flex items-baseline gap-1"><span className="text-2xl font-bold text-slate-900 dark:text-white">{money(e.hour, lang)}</span><span className="text-xs text-slate-500">{t.perHour}</span></span>
                <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500"><span>≈ {money(e.day, lang)}{t.perDay}</span><span>≈ {money(e.month, lang)}{t.perMonth}</span></span>
                <span className="mt-1 block text-xs text-slate-500">{t.created} {AWS_KINDS[k].minutes} {t.minutes}</span>
              </span>
            </Choice>
          );
        })}
      </div>

      {noServer ? (
        <Card className="mt-5">
          <Callout tone="info">{t.noBackend}</Callout>
          <Code {...{copyLabel: t.copy, copiedLabel: t.copied}}>{`git clone https://github.com/europesip/hcl-dx-compose-installer.git && cd hcl-dx-compose-installer/server/aws\nNAME=${p.name} REGION=${region} ./${kind}-create.sh\nNAME=${p.name} REGION=${region} ./${kind}-destroy.sh   # ${lang === "es" ? "al terminar" : "when you finish"}`}</Code>
        </Card>
      ) : env && !running ? (
        <>
          <Ready t={t} lang={lang} env={env} onDelete={() => askDelete(env.type, env.name)} job={job} canDelete={credsOk} />
          {!credsOk && <div className="mt-5 max-w-xl">{credsCard}</div>}
        </>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {credsCard}
          <Card className="space-y-4">
            <H2>{t.params}</H2>
            <Field label={t.envName} hint={t.envNameHint}><Input mono value={p.name} onChange={e => setP({...p, name: e.target.value.toLowerCase()})} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={kind === "ec2" ? t.instanceType : t.nodeType}>
                <Select value={p.instanceType} onChange={e => setP({...p, instanceType: e.target.value})}>
                  {Object.entries(EC2_TYPES).map(([k, [c, m]]) => <option key={k} value={k}>{k} · {c} vCPU · {m} GiB</option>)}
                </Select>
              </Field>
              {kind === "ec2"
                ? <Field label={t.diskGb}><Input mono value={p.diskGb} onChange={e => setP({...p, diskGb: e.target.value.replace(/\D/g, "")})} /></Field>
                : <Field label={t.nodes}><Select value={p.nodes} onChange={e => setP({...p, nodes: Number(e.target.value)})}>{[2, 3, 4].map(n => <option key={n}>{n}</option>)}</Select></Field>}
            </div>
            {kind === "ec2" && <Field label={t.allowedCidr} hint={t.allowedHint}><Input mono value={p.allowedCidr} onChange={e => setP({...p, allowedCidr: e.target.value.trim()})} placeholder="203.0.113.10/32" /></Field>}
            {kind === "rosa" && <Field label={t.rhToken}><Secret value={creds.rhcsToken} onChange={e => setCreds({...creds, rhcsToken: e.target.value.trim()})} /></Field>}
            <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-navy-950">
              {est.lines.map(([l, v]) => <div key={l} className="flex justify-between gap-3 py-0.5 text-slate-600 dark:text-slate-400"><span>{l}</span><span className="font-mono">{money(v, lang)}{t.perHour}</span></div>)}
              <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900 dark:border-navy-800 dark:text-white"><span>≈ {money(est.day, lang)}{t.perDay}</span><span>{money(est.hour, lang)}{t.perHour}</span></div>
            </div>
            <Check checked={accept} onChange={setAccept}>{t.acceptCost}</Check>
            <Button onClick={() => start("create")} disabled={!canCreate} className="w-full">{running && job?.action === "create" ? <><Spinner />{t.creating}</> : t.create}</Button>
          </Card>
        </div>
      )}

      {job && (job.status !== "done" || job.action === "destroy") && (
        <JobPanel t={t} job={job} kind={job.kind || kind} showLog={showLog} setShowLog={setShowLog} cancel={cancel} />
      )}

      {!noServer && !running && (
        <div className="mt-6">
          <button type="button" onClick={() => setManage(!manage)} className="text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">{manage ? "▾" : "▸"} {t.alreadyHave}</button>
          {manage && (
            <Card className="mt-3 rise">
              <p className="mb-3 text-xs text-slate-500">{t.credsHint}</p>
              <div className="grid items-end gap-3 sm:grid-cols-[8rem_1fr_auto]">
                <Field label="Tipo / Type"><Select value={delKind} onChange={e => setDelKind(e.target.value)}><option value="ec2">EC2</option><option value="eks">EKS</option><option value="rosa">ROSA</option></Select></Field>
                <Field label={t.envName}><Input mono value={delName} onChange={e => setDelName(e.target.value.toLowerCase())} placeholder="dx-compose-poc" /></Field>
                <Button variant="danger" disabled={!credsOk || !/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(delName)} onClick={() => askDelete(delKind, delName)}><IconTrash className="h-4 w-4" />{t.deleteExisting}</Button>
              </div>
            </Card>
          )}
        </div>
      )}

      <Nav t={t} back={back} next={() => go("deploy")} nextDisabled={!env || running} />
    </div>
  );
}

function JobPanel({t, job, kind, showLog, setShowLog, cancel}){
  const total = STEPS[job.action]?.[kind] || 8, n = job.steps?.length || 0;
  const pct = job.status === "done" ? 100 : Math.min(95, Math.round((Math.max(n - 1, 0) + 0.5) / total * 100));
  const logRef = useRef(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [job.lines?.length, showLog]);
  const tone = job.status === "failed" || job.status === "cancelled" ? "error" : job.status === "done" ? "ok" : "running";
  return (
    <Card className="mt-5 rise">
      <div className="flex items-center gap-3">
        {tone === "running" ? <Spinner className="h-5 w-5 text-brand-blue" /> : tone === "ok" ? <IconCheck className="h-5 w-5 text-emerald-600" /> : <IconWarn className="h-5 w-5 text-rose-600" />}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900 dark:text-white">{job.action === "destroy" ? (tone === "ok" ? t.deleted : t.deleting) : tone === "error" ? t.jobFailed : t.creating} {job.name && <span className="font-mono text-sm text-slate-500">{job.name}</span>}</div>
          <div className="truncate text-sm text-slate-500">{job.error && tone === "error" ? job.error : job.steps?.[n - 1] || "…"}</div>
        </div>
        {tone === "running" && <Button variant="secondary" onClick={cancel}>{t.cancel}</Button>}
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-navy-800">
        <div className={cx("h-2 rounded-full transition-all duration-700", tone === "error" ? "bg-rose-500" : "brand-gradient", tone === "running" && "animate-pulse")} style={{width: `${tone === "error" ? 100 : pct}%`}} />
      </div>
      <ol className="mt-4 grid gap-1.5 text-sm sm:grid-cols-2">
        {(job.steps || []).map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            {i < n - 1 || job.status === "done" ? <IconCheck className="h-4 w-4 text-emerald-600" /> : tone === "running" ? <Spinner className="h-3.5 w-3.5 text-brand-blue" /> : <IconWarn className="h-4 w-4 text-rose-600" />}
            <span className="truncate">{s}</span>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => setShowLog(!showLog)} className="mt-4 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white">{showLog ? t.hideLog : t.showLog}</button>
      {showLog && <pre ref={logRef} className="mt-2 max-h-80 overflow-auto rounded-xl bg-navy-950 p-3 font-mono text-[11.5px] leading-relaxed text-slate-300">{(job.lines || []).join("\n")}</pre>}
    </Card>
  );
}

function Ready({t, lang, env, onDelete, job, canDelete}){
  const file = f => `/api/jobs/${env.jobId}/files/${f}`;
  const has = f => (env.files || []).includes(f);
  const C = {copyLabel: t.copy, copiedLabel: t.copied};
  const destroy = {ec2: "ec2-destroy.sh", eks: "eks-destroy.sh", rosa: "rosa-destroy.sh"}[env.type];
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-2 rise">
      <Card>
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><IconCheck /></span>
          <div><div className="font-semibold text-slate-900 dark:text-white">{t.envReady}</div><div className="font-mono text-xs text-slate-500">{env.name} · {env.region}</div></div>
        </div>
        <dl className="space-y-2 text-sm">
          {[["DX", `https://${env.dxHost}`], ["Ingress", env.ingress || "OpenShift router"], ["StorageClasses", `${env.scRwo} / ${env.scRwx}`], env.publicIp && ["IP", env.publicIp], env.nodes && [t.nodes, env.nodes]].filter(Boolean).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4"><dt className="text-slate-500">{k}</dt><dd className="break-all text-right font-mono text-xs text-slate-900 dark:text-white">{v}</dd></div>
          ))}
        </dl>
        <H2 className="mt-6">{t.useIt}</H2>
        <div className="flex flex-wrap gap-2">
          {has("kubeconfig") && <a href={file("kubeconfig")} className="inline-flex items-center gap-2 rounded-xl brand-gradient px-4 py-2 text-sm font-semibold text-white"><IconDownload className="h-4 w-4" />{t.dlKubeconfig}</a>}
          {has(`${env.name}.pem`) && <a href={file(`${env.name}.pem`)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-navy-700"><IconDownload className="h-4 w-4" />{t.dlKey}</a>}
          {has("cluster-admin.txt") && <a href={file("cluster-admin.txt")} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-navy-700"><IconDownload className="h-4 w-4" />cluster-admin</a>}
          {has("README.txt") && <a href={file("README.txt")} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-navy-700"><IconDownload className="h-4 w-4" />{t.dlReadme}</a>}
        </div>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">{t.useItT}</p>
        <Code {...C}>{`export KUBECONFIG=$PWD/kubeconfig\nkubectl get nodes`}</Code>
        {env.ssh && <><p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{t.sshT}</p><Code {...C}>{`chmod 600 ${env.name}.pem\n${env.ssh}`}</Code></>}
      </Card>
      <Card className="border-rose-200 dark:border-rose-500/30">
        <H2>{t.deleteIt}</H2>
        <p className="text-sm text-slate-600 dark:text-slate-400">{t.deleteItT}</p>
        <Button variant="danger" onClick={onDelete} className="mt-3" title={canDelete ? "" : t.awsCreds} disabled={job?.status === "running" || !canDelete}><IconTrash className="h-4 w-4" />{t.deleteNow}</Button>
        <p className="mt-6 text-sm text-slate-600 dark:text-slate-400">{t.deleteLocal}</p>
        <a href="/api/aws/scripts.zip" className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-brand-blue hover:underline dark:text-blue-300"><IconDownload className="h-4 w-4" />{t.dlScripts}</a>
        <Code {...C}>{`unzip dx-compose-aws-scripts.zip && cd aws\nNAME=${env.name} REGION=${env.region} ./${destroy}`}</Code>
        <div className="mt-4"><Badge tone="amber">{lang === "es" ? "Coste mientras exista" : "It costs money while it exists"}</Badge></div>
      </Card>
    </div>
  );
}
