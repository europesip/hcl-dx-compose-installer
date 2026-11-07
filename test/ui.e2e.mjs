// UI test: walks the five steps in Spanish, selects every lab and downloads the zip, the Word
// guide and RUNBOOK.md. Also checks the security headers when served by the container.
//   node test/ui.e2e.mjs http://localhost:8080/ /tmp/out
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [url, out = '/tmp/installer-e2e'] = process.argv.slice(2); mkdirSync(out, {recursive: true});
const b = await chromium.launch(); const ctx = await b.newContext({acceptDownloads: true, viewport: {width: 1280, height: 900}});
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
await p.goto(url + '?lang=es'); await p.evaluate(()=>localStorage.clear()); await p.reload();
await p.screenshot({path: out + '/1-platform.png', fullPage: true});
await p.fill('input[placeholder="dx.example.com"]', 'dx-demo.apps.promox.europesip-lab.com');
await p.click('text=Siguiente'); await p.screenshot({path: out + '/2-what.png', fullPage: true});
for (const lbl of ["PostgreSQL 18", "MCP Server de EUROPESIP"]) { await p.click(`label.choice:has(b:has-text("${lbl}"))`); console.log(lbl, await p.$$eval("label.choice input", is => is.map(i => i.checked ? 1 : 0).join(""))); }
for (const lbl of ['Lab 1B', 'Lab 3B', 'Sesiones de IQ en PostgreSQL', 'Memoria de IQ', 'Lab 5']) await p.click(`label.choice:has(b:has-text("${lbl}"))`);
console.log(await p.$$eval('label.choice input', is => is.map(i => i.checked ? 1 : 0).join(''))); await p.click('label.licence'); await p.screenshot({path: out + '/2b-what-selected.png', fullPage: true});
await p.click('text=Siguiente'); await p.screenshot({path: out + '/3-creds.png', fullPage: true});
await p.click('text=Siguiente'); await p.click('text=Siguiente'); await p.screenshot({path: out + '/5-review.png', fullPage: true});
const [d1] = await Promise.all([p.waitForEvent('download'), p.click('button.big')]); await d1.saveAs(out + '/' + d1.suggestedFilename());
const [d2] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Guía en Word")')]); await d2.saveAs(out + '/' + d2.suggestedFilename());
const [d3] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("RUNBOOK.md")')]); await d3.saveAs(out + '/' + d3.suggestedFilename());
await p.click('.lang button:has-text("English")'); await p.screenshot({path: out + '/5-review-en.png', fullPage: false});
const r = await p.request.get(url); const csp = r.headers()['content-security-policy'] || '';
console.log('CSP:', csp ? csp.slice(0, 60) + '…' : '(none: not served by the container)');
if (errs.length) { console.error(errs); process.exitCode = 1; }
console.log('downloads:', d1.suggestedFilename(), d2.suggestedFilename(), d3.suggestedFilename(), 'errors:', errs);
await b.close();
