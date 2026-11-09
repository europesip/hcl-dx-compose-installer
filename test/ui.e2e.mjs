// UI test: walks the flow in Spanish twice (your own cluster + Webinar, and a WSL PoC + Everything)
// and downloads the zips, the Word script and RUNBOOK.md. Also checks the API of the server.
//   node test/ui.e2e.mjs http://localhost:8080/ /tmp/out
import {chromium} from "playwright";
import {mkdirSync} from "node:fs";
const [url, out = "/tmp/installer-e2e"] = process.argv.slice(2); mkdirSync(out, {recursive: true});
const b = await chromium.launch();
const ctx = await b.newContext({acceptDownloads: true, viewport: {width: 1280, height: 900}, locale: "es-ES"});
const p = await ctx.newPage(); const errs = [];
p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
const shot = async n => { await p.waitForTimeout(500); await p.screenshot({path: `${out}/${n}.png`, fullPage: true}); };
const next = () => p.click("main button:has-text('Siguiente')");
// The scope disclaimer (#5): shown on every start, Continue disabled until the box is ticked
const disclaimer = async () => {
  await p.waitForSelector("[role=dialog] >> text=Antes de empezar");
  const cont = p.locator("[role=dialog] button:has-text('Continuar')");
  if (await cont.isEnabled()) throw new Error("Continue must be disabled until the disclaimer is accepted");
  await p.check("#dxi-disclaimer-accept"); await cont.click();
};
const save = async selector => { const [d] = await Promise.all([p.waitForEvent("download"), p.click(selector)]); await d.saveAs(out + "/" + d.suggestedFilename()); return d.suggestedFilename(); };

// 1. Own cluster, webinar
await p.goto(url); await p.evaluate(() => localStorage.clear()); await p.reload();
if (!(await p.textContent("h1")).includes("Instala HCL DX Compose")) throw new Error("the browser language (es) was not detected");
await shot("1-welcome");
await p.click("text=Empezar"); await p.click("[role=dialog] button:has-text('Cancelar')");
if (await p.$("[role=dialog]")) throw new Error("Cancel must close the disclaimer");
await p.click("text=Empezar"); await shot("1b-disclaimer"); await disclaimer();
await p.click("text=Sí, tengo un clúster"); await next();
await p.selectOption("select", "nginx");
await p.fill("input[placeholder='dx-demo.example.com']", "dx-demo.apps.example.com");
await p.click("text=He comprobado"); await shot("2-own"); await next();
await p.click("text=Webinar · Showroom"); await shot("3-deploy"); await next();
await p.fill("input[placeholder='name@company.com']", "someone@example.com");
await (await p.$$("input[type=password]"))[0].fill("harbor-token-123");
await p.fill("input[placeholder='sk-or-v1-…']", "sk-or-v1-test");
await shot("4-details"); await next();
// a user outside EUROPESIP/HCL with PostgreSQL in stage 3: the dialog about the table script
await p.waitForSelector("text=PostgreSQL necesita un script de HCL"); await shot("4b-pg-dialog"); await p.click("button:has-text('Entendido')");
await shot("5-download-webinar");
if (!(await p.textContent("main")).includes("table script from HCL")) throw new Error("the download page should remind the PostgreSQL script");
const files = [await save("a:has-text('Instalación (.zip)')"), await save("a:has-text('Guion del webinar (Word)')"), await save("a:has-text('Guion del webinar (PDF)')"), await save("a:has-text('Cada paso con su comando')")];

// 2. WSL PoC, everything
await p.evaluate(() => localStorage.clear()); await p.reload();
await p.click("text=Empezar"); await disclaimer();   // asked again on every start
await p.click("text=No, ayúdame a crear uno"); await next();
await p.click("text=Mi PC con Windows (WSL2)"); await next(); await shot("6-wsl");
await p.click("text=k3s funciona"); await next();
await p.click("text=Todo"); await next();
await p.click("text=He leído y acepto la licencia");
await next(); await p.click("button:has-text('Entendido')"); await shot("7-download-all");
if (await p.$("text=Guion del webinar (Word)")) throw new Error("only the webinar has a Word script");
files.push(await save("a:has-text('Instalación (.zip)')"));

// 2b. Custom: switch LDAP off and on again, and the MCP dialog
await p.evaluate(() => localStorage.setItem("dxi-view", JSON.stringify("deploy"))); await p.reload();
await p.click("text=Personalizado"); await next();
await p.click("button:has-text('Sin directorio')"); await p.click("button:has-text('OpenLDAP con usuarios de demo')");
const mcpBox = "label:has-text('Servidor MCP de EUROPESIP') input";
if (await p.isChecked(mcpBox)) await p.click("text=Servidor MCP de EUROPESIP");   // "Everything" had it on: off first
await p.click("text=Servidor MCP de EUROPESIP"); await p.waitForSelector("text=un ejemplo, no una recomendación"); await shot("7b-mcp-dialog");
await p.click("button:has-text('Incluirlo')");
if (!(await p.isChecked(mcpBox))) throw new Error("the MCP extra should be included after the dialog");

// 3. AWS view and the API
await p.evaluate(() => { localStorage.setItem("dxi-view", JSON.stringify("env-aws")); }); await p.reload(); await shot("8-aws");
const info = await (await p.request.get(url + "api/info")).json();
const check = await p.request.post(url + "api/aws/check", {data: {creds: {accessKeyId: "AKIAAAAAAAAAAAAAAAAA", secretAccessKey: "x".repeat(40)}, region: "eu-west-1"}});
const r = await p.request.get(url); const csp = r.headers()["content-security-policy"] || "";
await p.click("header button:has-text('en')"); await shot("9-aws-en");
console.log("files:", files.join(", "));
console.log("api/info:", JSON.stringify(info), "· aws/check with a fake key:", check.status());
console.log("CSP:", csp ? csp.slice(0, 70) + "…" : "(none)");
if (check.status() !== 400) errs.push("aws/check should reject a fake key");
if (errs.length) { console.error(errs); process.exitCode = 1; }
await b.close();
