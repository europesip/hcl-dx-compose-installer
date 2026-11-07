import {useEffect, useMemo, useState} from "react";
import {TEXTS} from "./i18n.js";
import {DEFAULTS, NAME_KEYS, SECRET_KEYS, gates, normalise, POC_HOST} from "./state.js";
import {generate, zipBytes, download, ZIP_NAME, WORD_NAME_EN, WORD_NAME_ES, engine} from "./bundle.js";
import {buildWord} from "./word.js";

const STORE = "dx-installer-form";          // per-browser convenience: the choices, never the secrets
const LANG_STORE = "dx-installer-lang";
const load = () => { try { const v = JSON.parse(localStorage.getItem(STORE) || "{}"); for (const k of SECRET_KEYS) delete v[k]; return v; } catch { return {}; } };
const save = f => { try { const v = {...f}; for (const k of SECRET_KEYS) delete v[k]; localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* private mode */ } };
const initialLang = () => {
  try { const q = new URLSearchParams(location.search).get("lang"); if (q === "es" || q === "en") return q;
        const v = localStorage.getItem(LANG_STORE); if (v) return v; } catch { /* ignore */ }
  return (navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
};

export default function App(){
  const [lang, setLang] = useState(initialLang);
  const [form, setForm] = useState(() => normalise({...DEFAULTS, ...load()}));
  const [step, setStep] = useState(0);
  const [maskWord, setMaskWord] = useState(true);
  const [busy, setBusy] = useState("");
  const t = TEXTS[lang];

  useEffect(() => { document.documentElement.lang = lang; document.title = t.appTitle; try { localStorage.setItem(LANG_STORE, lang); } catch { /* ignore */ } }, [lang]);
  useEffect(() => save(form), [form]);

  const set = (k, v) => setForm(f => normalise({...f, [k]: v}));
  const g = gates(form);
  const gen = useMemo(() => generate(form, lang), [form, lang]);
  const {err, warn} = gen.check;
  const pgSql = engine.pgSqlFor(gen.s);

  const summary = useMemo(() => summaryRows(form, gen.s, t), [form, gen, t]);
  const go = n => { setStep(n); window.scrollTo({top: 0, behavior: "smooth"}); };

  async function wordBlob(){ return buildWord(gen, lang, summary, {mask: maskWord}); }
  async function dlZip(){
    setBusy("zip");
    try {
      const word = new Uint8Array(await (await wordBlob()).arrayBuffer());
      const name = lang === "es" ? WORD_NAME_ES : WORD_NAME_EN;
      const files = [...gen.entries, {name: "dx-install/" + name, data: word}];
      download(ZIP_NAME, zipBytes(files), "application/zip");
    } finally { setBusy(""); }
  }
  async function dlWord(){
    setBusy("word");
    try { download(lang === "es" ? WORD_NAME_ES : WORD_NAME_EN, await wordBlob()); } finally { setBusy(""); }
  }
  const dlRunbook = () => download("RUNBOOK.md", gen.runbook, "text/markdown;charset=utf-8");

  return (
    <div className="page">
      <header className="top">
        <div className="brand">
          <Logo/>
          <div><h1>{t.appTitle}</h1><p className="sub">{t.appSub}</p></div>
        </div>
        <div className="lang" role="group" aria-label="Language">
          {["en", "es"].map(l => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l === "en" ? "English" : "Español"}</button>)}
        </div>
      </header>
      <p className="privacy">🔒 {t.privacy}</p>

      <nav className="stepper" aria-label={t.step}>
        {t.steps.map((name, i) => (
          <button key={i} type="button" className={"st" + (i === step ? " on" : "") + (i < step ? " done" : "")} onClick={() => go(i)} aria-current={i === step ? "step" : undefined}>
            <span className="num">{i < step ? "✓" : i + 1}</span><span className="lbl">{name}</span>
          </button>
        ))}
      </nav>

      <main className="card">
        <h2>{t.steps[step]}</h2>
        <p className="help">{t.stepsHelp[step]}</p>

        {step === 0 && <>
          <Group title={t.platform}>
            <div className="choices three">
              {[["kubernetes", t.pfKubernetes, t.pfKubernetesH], ["openshift", t.pfOpenshift, t.pfOpenshiftH], ["poc", t.pfPoc, t.pfPocH]].map(([v, a, b]) =>
                <Radio key={v} name="platform" checked={form.platform === v} onChange={() => set("platform", v)} title={a} hint={b}/>)}
            </div>
            {form.platform === "poc" && <p className="note warn">{t.pocWarn}</p>}
          </Group>
          <div className="grid">
            <Field label={t.dxHost} hint={t.dxHostH} code="DX_HOST">
              <input type="text" value={form.DX_HOST} placeholder={form.platform === "poc" ? POC_HOST : "dx.example.com"} onChange={e => set("DX_HOST", e.target.value)} spellCheck={false}/>
            </Field>
            <Field label={t.helmV} code="HELM">
              <select value={form.helm} onChange={e => set("helm", e.target.value)}><option value="4">Helm 4</option><option value="3">Helm 3</option></select>
            </Field>
          </div>
          {form.platform !== "openshift" && <div className="grid">
            <Field label={t.ingress} hint={form.INGRESS_KIND === "nginx" ? t.nginxH : t.ingressH} code="INGRESS_CLASS">
              <select value={form.INGRESS_KIND} onChange={e => set("INGRESS_KIND", e.target.value)}>
                <option value="traefik">traefik</option>{form.platform !== "poc" && <option value="nginx">nginx</option>}<option value="other">{t.ingressOther}</option>
              </select>
            </Field>
            {form.INGRESS_KIND === "other" && <Field label={t.ingressClass}><input type="text" value={form.INGRESS_CLASS} onChange={e => set("INGRESS_CLASS", e.target.value)} spellCheck={false}/></Field>}
          </div>}
          <div className="grid">
            <Field label={t.scRwo} hint={t.scH} code="SC_RWO"><input type="text" value={form.SC_RWO} onChange={e => set("SC_RWO", e.target.value)} spellCheck={false}/></Field>
            <Field label={t.scRwx} code="SC_RWX"><input type="text" value={form.SC_RWX} onChange={e => set("SC_RWX", e.target.value)} spellCheck={false}/></Field>
          </div>
          <div className="grid">
            <Field label={t.tlsCert} hint={t.tlsH} code="TLS_CERT"><input type="text" value={form.TLS_CERT} placeholder="/path/full-chain.pem" onChange={e => set("TLS_CERT", e.target.value)} spellCheck={false}/></Field>
            <Field label={t.tlsKey} code="TLS_KEY"><input type="text" value={form.TLS_KEY} placeholder="/path/server.key" onChange={e => set("TLS_KEY", e.target.value)} spellCheck={false}/></Field>
          </div>
        </>}

        {step === 1 && <>
          <Group title={t.deps} hint={t.depsH}>
            <div className="choices two">
              <Check checked={form.depLdap} onChange={v => set("depLdap", v)} title={t.depLdap} hint={t.depLdapH}/>
              <Check checked={form.depPg} onChange={v => set("depPg", v)} title={t.depPg} hint={t.depPgH}/>
              <Check checked={form.depLlm} onChange={v => set("depLlm", v)} title={t.depLlm} hint={t.depLlmH}/>
              <Check checked={form.depMcp} onChange={v => set("depMcp", v)} title={t.depMcp} hint={t.depMcpH}/>
            </div>
          </Group>
          <Group title={t.labs}>
            <div className="choices two">
              <Check checked disabled title={t.lab1} hint={t.lab1H}/>
              <Check checked={form.lab1b} onChange={v => set("lab1b", v)} title={t.lab1b} hint={t.lab1bH} tag={t.optional}/>
            </div>
            <div className="grid">
              <Field label={t.dir} code="dir" hint={g.dirOpenldap && t.needLdap}>
                <select value={form.dir} onChange={e => set("dir", e.target.value)}>
                  <option value="none">{t.dirNone}</option><option value="openldap" disabled={!!g.dirOpenldap}>{t.dirLdap}</option><option value="ad">{t.dirAd}</option>
                </select>
              </Field>
              <Field label={t.db} code="db" hint={form.db === "postgres" ? (pgSql ? "✔ " + t.pgSqlYes : t.pgSqlNo) : (g.dbPostgres && t.needPg)}>
                <select value={form.db} onChange={e => set("db", e.target.value)}>
                  <option value="none">{t.dbNone}</option><option value="oracle">{t.dbOracle}</option><option value="postgres" disabled={!!g.dbPostgres}>{t.dbPg}</option>
                </select>
              </Field>
            </div>
            <div className="choices two">
              <Check checked={form.lab3} disabled={!!g.lab3} need={g.lab3 && t[g.lab3]} onChange={v => set("lab3", v)} title={t.lab3} hint={t.lab3H}/>
              <Check checked={form.lab3b} disabled={!!g.lab3b} need={g.lab3b && t[g.lab3b]} onChange={v => set("lab3b", v)} title={t.lab3b} hint={t.lab3bH} tag={t.optional}/>
              <Check checked={form.iqdb} disabled={!!g.iqdb} need={g.iqdb && t[g.iqdb]} onChange={v => set("iqdb", v)} title={t.iqdb} hint={t.iqdbH} tag={t.optional}/>
              <Check checked={form.iqrag} disabled={!!g.iqrag} need={g.iqrag && t[g.iqrag]} onChange={v => set("iqrag", v)} title={t.iqrag} hint={t.iqragH} tag={t.optional}/>
              <Check checked={form.lab4} onChange={v => set("lab4", v)} title={t.lab4} hint={t.lab4H}/>
              <Check checked={form.lab5} disabled={!!g.lab5} need={g.lab5 && t[g.lab5]} onChange={v => set("lab5", v)} title={t.lab5} hint={t.lab5H} tag={t.advanced}/>
            </div>
            {form.depLlm && <Field label={t.llm} code="IQ_LLM">
              <select value={form.IQ_LLM} onChange={e => set("IQ_LLM", e.target.value)}><option value="claude">{t.llmClaude}</option><option value="qwen">{t.llmQwen}</option></select>
            </Field>}
            {(form.lab1b || form.lab5) && <label className="licence"><input type="checkbox" checked={form.dxcLicense} onChange={e => set("dxcLicense", e.target.checked)}/>
              <span><b>{t.dxc}</b><small>{t.dxcH}</small></span></label>}
          </Group>
          <Group title={t.mode}>
            <div className="choices two">
              <Radio name="mode" checked={form.mode === "steps"} onChange={() => set("mode", "steps")} title={t.modeSteps} hint={t.modeStepsH}/>
              <Radio name="mode" checked={form.mode === "fast"} onChange={() => set("mode", "fast")} title={t.modeFast} hint={t.modeFastH}/>
            </div>
          </Group>
        </>}

        {step === 2 && <>
          <div className="grid">
            <Field label={t.harborUser} hint={t.harborH} code="HCL_HARBOR_USER"><input type="email" value={form.HCL_HARBOR_USER} onChange={e => set("HCL_HARBOR_USER", e.target.value)} autoComplete="off" spellCheck={false}/></Field>
            <Field label={t.harborToken} code="HCL_HARBOR_TOKEN"><Secret value={form.HCL_HARBOR_TOKEN} onChange={v => set("HCL_HARBOR_TOKEN", v)} t={t}/></Field>
          </div>
          <div className="grid">
            {form.depLlm && <Field label={t.orKey} hint={t.orKeyH} code="OPENROUTER_API_KEY"><Secret value={form.OPENROUTER_API_KEY} placeholder="sk-or-v1-…" onChange={v => set("OPENROUTER_API_KEY", v)} t={t}/></Field>}
            <Field label={t.labPw} hint={t.labPwH} code="LAB_PASSWORD"><Secret value={form.LAB_PASSWORD} onChange={v => set("LAB_PASSWORD", v)} t={t}/></Field>
          </div>
          {form.dir === "ad" && <Group title={t.ad}>
            <div className="grid">
              <Field label={t.adHost} code="AD_HOST"><input type="text" value={form.AD_HOST} placeholder="dc01.company.local" onChange={e => set("AD_HOST", e.target.value)} spellCheck={false}/></Field>
              <Field label={t.adPort} code="AD_PORT"><select value={form.AD_PORT} onChange={e => set("AD_PORT", e.target.value)}><option>389</option><option>636</option></select></Field>
              <Field label={t.adBase} code="AD_BASE_DN"><input type="text" value={form.AD_BASE_DN} placeholder="DC=company,DC=local" onChange={e => set("AD_BASE_DN", e.target.value)} spellCheck={false}/></Field>
              <Field label={t.adUser} code="AD_BIND_USER"><input type="text" value={form.AD_BIND_USER} placeholder="svc-dx@company.local" onChange={e => set("AD_BIND_USER", e.target.value)} spellCheck={false}/></Field>
              <Field label={t.adPw} code="AD_BIND_PASSWORD"><Secret value={form.AD_BIND_PASSWORD} onChange={v => set("AD_BIND_PASSWORD", v)} t={t}/></Field>
              <Field label={t.adCa} code="AD_CA_FILE"><input type="text" value={form.AD_CA_FILE} placeholder="/path/ad-ca.pem" onChange={e => set("AD_CA_FILE", e.target.value)} spellCheck={false}/></Field>
            </div>
          </Group>}
          {form.db === "oracle" && <Group title={t.ora}>
            <div className="grid">
              <Field label={t.oraUrl} code="ORACLE_JDBC_URL"><input type="text" value={form.ORACLE_JDBC_URL} placeholder="jdbc:oracle:thin:@tcps://oracle.company.local:2484/WPSDB" onChange={e => set("ORACLE_JDBC_URL", e.target.value)} spellCheck={false}/></Field>
              <Field label={t.oraUser} code="ORACLE_DX_USER"><input type="text" value={form.ORACLE_DX_USER} onChange={e => set("ORACLE_DX_USER", e.target.value)} spellCheck={false}/></Field>
              <Field label={t.oraPw} code="ORACLE_DX_PASSWORD"><Secret value={form.ORACLE_DX_PASSWORD} onChange={v => set("ORACLE_DX_PASSWORD", v)} t={t}/></Field>
              <Field label={t.oraCa} code="ORACLE_CA_FILE"><input type="text" value={form.ORACLE_CA_FILE} placeholder="/path/oracle-ca.pem" onChange={e => set("ORACLE_CA_FILE", e.target.value)} spellCheck={false}/></Field>
            </div>
          </Group>}
        </>}

        {step === 3 && <>
          <div className="grid">
            {[["DX_NS", t.dxNs], ["SHARED_NS", t.sharedNs], ["DX_RELEASE", t.dxRel], ["IQ_RELEASE", t.iqRel], ["SEARCH_RELEASE", t.searchRel],
              ["LDAP_RELEASE", t.ldapRel], ["LITELLM_RELEASE", t.llmRel], ["PG_CLUSTER", t.pgCluster]].map(([k, l]) =>
              <Field key={k} label={l} code={k}><input type="text" value={form[k]} onChange={e => set(k, e.target.value)} spellCheck={false}/></Field>)}
          </div>
          <button type="button" className="link" onClick={() => setForm(f => normalise({...f, ...Object.fromEntries(NAME_KEYS.map(k => [k, DEFAULTS[k]]))}))}>{t.reset}</button>
        </>}

        {step === 4 && <>
          {err.length > 0 && <div className="msgs err" role="alert"><b>{t.errors}</b><ul>{err.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          {warn.length > 0 && <div className="msgs warn"><b>{t.warnings}</b><ul>{warn.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          <h3>{t.summary}</h3>
          <table className="sum"><tbody>{summary.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
          <div className="downloads">
            <button type="button" className="primary big" disabled={err.length > 0 || !!busy} onClick={dlZip}>⬇ {busy === "zip" ? t.generating : t.dlZip}</button>
            <p className="hint">{t.dlZipH}</p>
            <div className="row">
              <button type="button" disabled={err.length > 0} onClick={dlRunbook}>📄 {t.dlRunbook}</button>
              <button type="button" disabled={err.length > 0 || !!busy} onClick={dlWord}>📝 {busy === "word" ? t.generating : t.dlWord}</button>
            </div>
            <label className="licence small"><input type="checkbox" checked={maskWord} onChange={e => setMaskWord(e.target.checked)}/><span><b>{t.maskWord}</b><small>{t.maskWordH}</small></span></label>
          </div>
          <h3>{t.howRun}</h3>
          <pre className="cmd">{`unzip ${ZIP_NAME} && cd dx-install\n./install.sh          # --list · --from <step> · --verify`}</pre>
          <h3>{t.stepsList} <span className="count">{gen.steps.length} {t.nSteps} · {Object.keys(gen.files).length + 3} {t.files}</span></h3>
          <StepList steps={gen.steps} t={t}/>
        </>}

        <div className="nav">
          {step > 0 ? <button type="button" onClick={() => go(step - 1)}>← {t.back}</button> : <span/>}
          {step < 4 && <button type="button" className="primary" onClick={() => go(step + 1)}>{t.next} →</button>}
        </div>
      </main>
      <footer className="foot">{t.footer} · <a href="https://github.com/europesip/hcl-dx-compose-installer" target="_blank" rel="noreferrer">{t.source}</a> · <a href="https://github.com/europesip/hcl-dx-compose-labs" target="_blank" rel="noreferrer">{t.labsLink}</a></footer>
    </div>
  );
}

function summaryRows(f, s, t){
  const yes = b => b ? t.yes : t.no;
  const deps = [f.depLdap && t.depLdap, f.depPg && t.depPg, f.depLlm && t.depLlm, f.depMcp && t.depMcp].filter(Boolean).join(", ") || t.none;
  const labs = [t.lab1, f.lab1b && t.lab1b,
    f.dir !== "none" && `${t.dir}: ${f.dir === "ad" ? t.dirAd : t.dirLdap}`,
    f.db !== "none" && `${t.db}: ${f.db === "oracle" ? t.dbOracle : t.dbPg}`,
    f.lab3 && `${t.lab3} (${f.IQ_LLM === "qwen" ? "Qwen" : "Claude"})`, f.lab3b && t.lab3b, f.iqdb && t.iqdb, f.iqrag && t.iqrag,
    f.lab4 && t.lab4, f.lab5 && t.lab5].filter(Boolean).join(" · ");
  const pf = {kubernetes: t.pfKubernetes, openshift: t.pfOpenshift, poc: t.pfPoc}[f.platform];
  return [
    [t.sumPlatform, pf], [t.sumHost, s.DX_HOST || "—"],
    [t.sumIngress, s.openshift ? "Route (passthrough)" : s.INGRESS_CLASS || "—"],
    [t.sumStorage, `${s.SC_RWO} (RWO) · ${s.SC_RWX} (RWX)`],
    [t.sumDeps, deps], [t.sumLabs, labs], [t.sumMode, f.mode === "fast" ? t.modeFast : t.modeSteps],
    [t.names, `${s.DX_NS} / ${s.SHARED_NS}`],
    [t.harborUser, s.HCL_HARBOR_USER || "—"], [t.dxc, (f.lab1b || f.lab5) ? yes(f.dxcLicense) : "—"],
  ];
}

function StepList({steps, t}){
  const labs = [];
  for (const st of steps) { if (!labs.length || labs[labs.length - 1].lab !== st.lab) labs.push({lab: st.lab, items: []}); labs[labs.length - 1].items.push(st); }
  return <div className="steps">{labs.map(l => (
    <details key={l.lab} className="lab">
      <summary><b>{l.lab}</b> <span className="count">{l.items.length}</span></summary>
      {l.items.map(st => <details key={st.id} className="stp">
        <summary><code>{st.id}</code> {st.title} {st.opt && <span className="tag">{t.optStep}</span>}{st.manual && <span className="tag warn">{t.manualStep}</span>}</summary>
        {st.note && <p className="hint">{st.note.replace(/\*\*|`/g, "")}</p>}
        <pre className="cmd">{st.cmd}</pre>
      </details>)}
    </details>))}
  </div>;
}

function Group({title, hint, children}){
  return <section className="group"><h3>{title}</h3>{hint && <p className="hint">{hint}</p>}{children}</section>;
}
function Field({label, hint, code, children}){
  return <label className="field"><span className="lbl">{label}{code && <code>{code}</code>}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function Check({checked, onChange, disabled, title, hint, tag, need}){
  return <label className={"choice" + (disabled ? " off" : "") + (checked ? " sel" : "")}>
    <input type="checkbox" checked={!!checked} disabled={disabled} onChange={e => onChange && onChange(e.target.checked)}/>
    <span><b>{title}{tag && <span className="tag">{tag}</span>}</b><small>{hint}</small>{need && <small className="need">{need}</small>}</span>
  </label>;
}
function Radio({name, checked, onChange, title, hint}){
  return <label className={"choice" + (checked ? " sel" : "")}><input type="radio" name={name} checked={checked} onChange={onChange}/><span><b>{title}</b><small>{hint}</small></span></label>;
}
function Secret({value, onChange, placeholder, t}){
  const [show, setShow] = useState(false);
  return <span className="secret"><input type={show ? "text" : "password"} value={value} placeholder={placeholder} autoComplete="off" spellCheck={false} onChange={e => onChange(e.target.value)}/>
    <button type="button" className="eye" onClick={() => setShow(!show)}>{show ? t.hide : t.show}</button></span>;
}
function Logo(){
  return <svg className="logo" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="var(--accent)"/>
    <path d="M14 16h9a9 9 0 0 1 0 18h-9z" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinejoin="round"/><path d="M29 16l7 9-7 9" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
