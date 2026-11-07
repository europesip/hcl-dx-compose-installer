// The views of the installer, one per screen
import {useMemo, useState} from "react";
import {Nav, Card, Title, H2, Choice, Button, Field, Input, Secret, Select, Check, Toggle, Segmented, Callout, Code, Badge, cx,
        IconServer, IconPlus, IconLaptop, IconLinux, IconCloud, IconLayers, IconSliders, IconPresent, IconDownload, IconDoc, IconZip, IconSpark, IconCheck, Spinner} from "./ui.jsx";
import {applyPreset, gates, NAME_KEYS, depsOf} from "./state.js";
import {ownChecks, wslCmds, linuxCmds, LAB0_GUIDE} from "./guides.js";
import {generate, zipBytes, download, ZIP_NAME, ZIP_NAME_WEBINAR, WORD_NAME_EN, WORD_NAME_ES} from "./bundle.js";
import {stageLabel} from "./engine/stages.js";
import {SecurityNote} from "./security.jsx";

const C = t => ({copyLabel: t.copy, copiedLabel: t.copied});
const Bullet = ({children}) => <li className="flex gap-2.5"><IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" /><span>{children}</span></li>;
function KV({rows}){
  return (
    <dl className="divide-y divide-slate-100 text-sm dark:divide-navy-800">
      {rows.map(([k, v]) => <div key={k} className="grid gap-1 py-2.5 sm:grid-cols-[9rem_1fr]"><dt className="font-medium text-slate-900 dark:text-white">{k}</dt><dd className="text-slate-600 dark:text-slate-400">{v}</dd></div>)}
    </dl>
  );
}

// ---------------------------------------------------------------------------------------------
export function Welcome({t, go}){
  const cards = [[t.w1t, t.w1, <IconLayers key="a" />], [t.w2t, t.w2, <IconServer key="b" />], [t.w3t, t.w3, <IconSpark key="c" />]];
  return (
    <div>
      <section className="relative overflow-hidden rounded-3xl bg-navy-900 px-6 py-12 text-white shadow-xl sm:px-12 sm:py-16 rise">
        <div className="brand-gradient absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl" aria-hidden="true" />
        <div className="brand-gradient absolute -bottom-32 -left-20 h-72 w-72 rounded-full opacity-25 blur-3xl" aria-hidden="true" />
        <div className="relative max-w-3xl">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide ring-1 ring-white/20">HCL DX Compose · CF239</span>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{t.heroTitle}</h1>
          <p className="mt-4 text-base text-slate-300 sm:text-lg">{t.heroSub}</p>
          <Button onClick={() => go("env")} className="mt-8 px-7 py-3 text-base">{t.start}</Button>
        </div>
      </section>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {cards.map(([h, p, icon], i) => (
          <Card key={h} className="rise" style={{animationDelay: `${80 * (i + 1)}ms`}}>
            <span className="brand-gradient mb-4 grid h-11 w-11 place-items-center rounded-xl text-white">{icon}</span>
            <H2>{h}</H2><p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{p}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-5 rise">
        <H2>{t.wWhat}</H2>
        <ul className="grid gap-2 text-sm text-slate-700 dark:text-slate-300 md:grid-cols-3">{t.wNeed.map(x => <Bullet key={x}>{x}</Bullet>)}</ul>
        <p className="mt-4 text-xs text-slate-500">{t.wNote}</p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function EnvQuestion({t, go, back, envPick, setEnvPick}){
  return (
    <div>
      <Title sub={t.envQSub}>{t.envQ}</Title>
      <div className="grid gap-5 md:grid-cols-2">
        <Choice selected={envPick === "own"} onClick={() => setEnvPick("own")} icon={<IconServer />} title={t.envYes}>{t.envYesT}</Choice>
        <Choice selected={envPick === "create"} onClick={() => setEnvPick("create")} icon={<IconPlus />} title={t.envNo}>{t.envNoT}</Choice>
      </div>
      <Nav t={t} back={back} next={() => go(envPick === "own" ? "env-own" : "env-create")} nextDisabled={!envPick} />
    </div>
  );
}

export function EnvOwn({t, form, set, go, back}){
  const checks = ownChecks(form);
  const oc = form.platform === "openshift";
  const ok = form.envConfirmed && form.SC_RWO && form.SC_RWX;
  return (
    <div>
      <Title sub={t.checkSub}>{t.checkTitle}</Title>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card>
            <H2>{t.platform}</H2>
            <Segmented value={oc ? "openshift" : "kubernetes"} onChange={v => set({platform: v, envSource: "own"})} options={[["kubernetes", t.pK8s], ["openshift", t.pOcp]]} />
            <H2 className="mt-6">{t.reqTitle}</H2>
            <KV rows={t.req} />
          </Card>
          <Card className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.scRwo}><Input mono value={form.SC_RWO} onChange={e => set({SC_RWO: e.target.value})} /></Field>
              <Field label={t.scRwx}><Input mono value={form.SC_RWX} onChange={e => set({SC_RWX: e.target.value})} /></Field>
            </div>
            {!oc && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t.ingress}>
                  <Select value={form.INGRESS_KIND} onChange={e => set({INGRESS_KIND: e.target.value})}>
                    <option value="nginx">nginx (ingress-nginx)</option><option value="traefik">Traefik</option><option value="other">{t.ingressOther}</option>
                  </Select>
                </Field>
                {form.INGRESS_KIND === "other" && <Field label={t.ingressClass}><Input mono value={form.INGRESS_CLASS} onChange={e => set({INGRESS_CLASS: e.target.value})} /></Field>}
              </div>
            )}
            <Field label={t.dxHost} hint={t.dxHostHint}><Input mono placeholder="dx-demo.example.com" value={form.DX_HOST} onChange={e => set({DX_HOST: e.target.value})} /></Field>
          </Card>
        </div>
        <Card>
          <H2>{t.cmdTitle}</H2>
          <ol className="space-y-5">
            {checks.map((c, i) => (
              <li key={i}>
                <div className="flex items-baseline gap-2"><span className="brand-text text-sm font-bold">{i + 1}</span><span className="text-sm font-semibold text-slate-900 dark:text-white">{t.cmds[i][0]}</span></div>
                <p className="text-sm text-slate-600 dark:text-slate-400">{t.cmds[i][1]}</p>
                <Code {...C(t)}>{c}</Code>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <Card className="mt-5"><Check checked={form.envConfirmed} onChange={v => set({envConfirmed: v, envSource: "own"})}>{t.confirmOwn}</Check></Card>
      <Nav t={t} back={back} next={() => { set({envSource: "own"}); go("deploy"); }} nextDisabled={!ok} />
    </div>
  );
}

export function EnvCreate({t, form, set, go, back}){
  const pick = form.envSource === "own" ? "" : form.envSource;
  return (
    <div>
      <Title sub={t.createSub}>{t.createTitle}</Title>
      <div className="grid gap-5 md:grid-cols-3">
        <Choice selected={pick === "wsl"} onClick={() => set({envSource: "wsl"})} icon={<IconLaptop />} title={t.cWsl} badge={t.recommended}>{t.cWslT}</Choice>
        <Choice selected={pick === "linux"} onClick={() => set({envSource: "linux"})} icon={<IconLinux />} title={t.cLinux}>{t.cLinuxT}</Choice>
        <Choice selected={pick === "aws"} onClick={() => set({envSource: "aws"})} icon={<IconCloud />} title={t.cAws}>{t.cAwsT}</Choice>
      </div>
      <Nav t={t} back={back} next={() => go("env-" + pick)} nextDisabled={!pick} />
    </div>
  );
}

export function EnvLocal({t, lang, form, set, go, back, view}){
  const wsl = view === "env-wsl";
  const cmds = wsl ? wslCmds : linuxCmds, steps = wsl ? t.wslSteps : t.linuxSteps;
  return (
    <div>
      <Title>{wsl ? t.wslTitle : t.linuxTitle}</Title>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-5">
          <Card><H2>{t.reqTitle}</H2><KV rows={wsl ? t.wslReq : t.linuxReq} /></Card>
          <Callout tone="info">{t.pocNote}</Callout>
          {wsl && <a className="inline-flex items-center gap-2 text-sm font-semibold text-brand-blue hover:underline dark:text-blue-300" href={LAB0_GUIDE[lang]} target="_blank" rel="noreferrer">{t.fullGuide} ↗</a>}
        </div>
        <Card>
          <ol className="space-y-6">
            {steps.map(([h, p], i) => (
              <li key={h} className="relative pl-10">
                <span className="brand-gradient absolute left-0 top-0 grid h-7 w-7 place-items-center rounded-full text-xs font-bold text-white">{i + 1}</span>
                <div className="font-semibold text-slate-900 dark:text-white">{h}</div>
                <p className="text-sm text-slate-600 dark:text-slate-400">{p}</p>
                <Code lang={cmds[i].lang} {...C(t)}>{cmds[i].cmd}</Code>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <Card className="mt-5"><Check checked={form.envConfirmed} onChange={v => set({envConfirmed: v})}>{t.confirmPoc}</Check></Card>
      <Nav t={t} back={back} nextDisabled={!form.envConfirmed}
        next={() => { set({platform: "poc", envSource: wsl ? "wsl" : "linux", INGRESS_KIND: "traefik", SC_RWO: "dx-deploy-rwo", SC_RWX: "dx-deploy-rwx", DX_HOST: ""}); go("deploy"); }} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
const STAGES_OF = {all: [0, 1, 2, 3, 4, 5, 6], webinar: [0, 1, 2, 3, 4, 5]};
export function Deploy({t, form, set, go, back}){
  const opts = [
    ["all", t.dAll, t.dAllT, <IconLayers key="a" />],
    ["custom", t.dCustom, t.dCustomT, <IconSliders key="b" />],
    ["webinar", t.dWeb, t.dWebT, <IconPresent key="c" />],
  ];
  return (
    <div>
      <Title sub={t.deploySub}>{t.deployQ}</Title>
      <div className="grid gap-5 lg:grid-cols-3">
        {opts.map(([k, title, text, icon]) => (
          <Choice key={k} selected={form.preset === k} onClick={() => set(f => applyPreset(f, k))} icon={icon} title={title}>
            {text}
            {STAGES_OF[k] && (
              <span className="mt-4 flex flex-wrap gap-1.5">
                {STAGES_OF[k].map(n => <Badge key={n} tone={form.preset === k ? "blue" : "slate"}>{n} · {t.stage[n]}</Badge>)}
              </span>
            )}
          </Choice>
        ))}
      </div>
      {form.preset === "webinar" && (
        <div className="mt-5 grid gap-5 md:grid-cols-2 rise">
          {[[t.webP1t, t.webP1, "1"], [t.webP2t, t.webP2, "2"]].map(([h, p, n]) => (
            <Card key={n} className="flex gap-4">
              <span className="brand-gradient grid h-10 w-10 shrink-0 place-items-center rounded-xl font-bold text-white">{n}</span>
              <div><div className="font-semibold text-slate-900 dark:text-white">{h}</div><p className="text-sm text-slate-600 dark:text-slate-400">{p}</p></div>
            </Card>
          ))}
        </div>
      )}
      <Nav t={t} back={back} next={() => go(form.preset === "custom" ? "deploy-custom" : "details")} nextDisabled={!form.preset} />
    </div>
  );
}

function StageCard({n, t, on, onToggle, always, children}){
  return (
    <Card className={cx("transition", on === false && "opacity-70")}>
      <div className="flex items-start gap-4">
        <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold", on !== false ? "brand-gradient text-white" : "bg-slate-200 text-slate-500 dark:bg-navy-800")}>{n}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold text-slate-900 dark:text-white">{t.stage[n]}</div>
            {always ? <Badge>{t.always}</Badge> : onToggle && <Toggle checked={on} onChange={onToggle} label={t.stage[n]} />}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t.stageT[n]}</p>
          {children && on !== false && <div className="mt-4 space-y-3">{children}</div>}
        </div>
      </div>
    </Card>
  );
}

export function DeployCustom({t, form, set, go, back}){
  const g = gates(form);
  return (
    <div>
      <Title sub={t.dCustomT}>{t.customTitle}</Title>
      <div className="grid gap-4 lg:grid-cols-2">
        <StageCard n={0} t={t} always />
        <StageCard n={1} t={t} always>
          <Check checked={form.lab1b} onChange={v => set({lab1b: v})}><Badge tone="amber">{t.extras}</Badge> {t.xScriptApp}</Check>
        </StageCard>
        <StageCard n={2} t={t} on={form.dir !== "none"}>
          <Segmented value={form.dir} onChange={v => set({dir: v})} options={[["openldap", t.dirOpenldap], ["ad", t.dirAd], ["none", t.dirNone]]} />
        </StageCard>
        <StageCard n={3} t={t} on={form.db !== "none"}>
          <Segmented value={form.db} onChange={v => set({db: v})} options={[["postgres", t.dbPg], ["oracle", t.dbOra], ["none", t.dbNone]]} />
          {form.db === "postgres" && <p className="text-xs text-amber-700 dark:text-amber-300">{t.pgWarn}</p>}
        </StageCard>
        <StageCard n={4} t={t} on={form.lab3} onToggle={v => set({lab3: v})}>
          <Field label={t.llm}><Segmented value={form.IQ_LLM} onChange={v => set({IQ_LLM: v})} options={[["claude", t.llmClaude], ["qwen", t.llmQwen]]} /></Field>
          <div className="space-y-2 pt-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t.extras}</div>
            <Check checked={form.lab3b} disabled={!!g.lab3b} onChange={v => set({lab3b: v})}>{t.xMcp}</Check>
            <Check checked={form.iqdb} disabled={!!g.iqdb} onChange={v => set({iqdb: v})}>{t.xIqdb}</Check>
            <Check checked={form.iqrag} disabled={!!g.iqrag} onChange={v => set({iqrag: v})} hint={g.iqrag ? t.needIqdb : t.ragWarn}>{t.xRag}</Check>
          </div>
        </StageCard>
        <StageCard n={5} t={t} on={form.lab4} onToggle={v => set({lab4: v})} />
        <StageCard n={6} t={t} on={form.lab5} onToggle={v => set({lab5: v})} />
      </div>
      <Nav t={t} back={back} next={() => go("details")} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function Details({t, lang, form, set, go, back}){
  const [adv, setAdv] = useState(false);
  const needsHost = form.platform !== "poc";
  const F = (k, label, o = {}) => (
    <Field label={label} hint={o.hint} className={o.className}>
      {o.secret ? <Secret value={form[k]} onChange={e => set({[k]: e.target.value})} placeholder={o.placeholder} />
                : <Input mono={o.mono} value={form[k]} onChange={e => set({[k]: e.target.value})} placeholder={o.placeholder} />}
    </Field>
  );
  return (
    <div>
      <Title sub={t.detailsSub}>{t.detailsTitle}</Title>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-4">
          <H2>{t.harbor}</H2>
          {F("HCL_HARBOR_USER", t.harborUser, {placeholder: "name@company.com"})}
          {F("HCL_HARBOR_TOKEN", t.harborToken, {secret: true})}
          <SecurityNote t={t} lang={lang} kind="harbor" />
        </Card>
        <Card className="space-y-4">
          <H2>{t.access}</H2>
          {needsHost && F("DX_HOST", t.dxHost, {mono: true, hint: t.dxHostHint, placeholder: "dx-demo.example.com"})}
          {F("LAB_PASSWORD", t.labPassword, {secret: true})}
        </Card>
        {form.lab3 && (
          <Card className="space-y-4">
            <H2>{t.openrouter}</H2>
            {F("OPENROUTER_API_KEY", t.openrouter, {secret: true, hint: t.openrouterHint, placeholder: "sk-or-v1-…"})}
            <SecurityNote t={t} lang={lang} kind="openrouter" />
          </Card>
        )}
        {form.dir === "ad" && (
          <Card className="space-y-4">
            <H2>{t.ad}</H2>
            <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">{F("AD_HOST", t.adHost, {mono: true})}{F("AD_PORT", t.adPort, {mono: true})}</div>
            {F("AD_BASE_DN", t.adBase, {mono: true, placeholder: "DC=company,DC=com"})}
            {F("AD_BIND_USER", t.adBind, {mono: true})}
            {F("AD_BIND_PASSWORD", t.adBindPw, {secret: true})}
            {F("AD_CA_FILE", t.adCa, {mono: true})}
          </Card>
        )}
        {form.db === "oracle" && (
          <Card className="space-y-4">
            <H2>{t.oracle}</H2>
            {F("ORACLE_JDBC_URL", t.oraUrl, {mono: true, placeholder: "jdbc:oracle:thin:@//host:1521/SERVICE"})}
            <div className="grid gap-4 sm:grid-cols-2">{F("ORACLE_DX_USER", t.oraUser, {mono: true})}{F("ORACLE_DX_PASSWORD", t.oraPw, {secret: true})}</div>
            {F("ORACLE_CA_FILE", t.oraCa, {mono: true})}
          </Card>
        )}
      </div>
      {(form.lab1b || form.lab5) && <Card className="mt-5"><Check checked={form.dxcLicense} onChange={v => set({dxcLicense: v})}>{t.dxcLicense}</Check></Card>}
      <div className="mt-5">
        <button type="button" onClick={() => setAdv(!adv)} className="text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">{adv ? "▾" : "▸"} {t.advanced}</button>
        {adv && (
          <Card className="mt-3 space-y-5 rise">
            <div><H2>{t.names}</H2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{NAME_KEYS.map(k => F(k, k, {mono: true}))}</div></div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.helm}><Segmented value={form.helm} onChange={v => set({helm: v})} options={[["4", "Helm 4"], ["3", "Helm 3"]]} /></Field>
              {F("TLS_CERT", t.tlsCert, {mono: true, hint: t.tlsHint})}
              {F("TLS_KEY", t.tlsKey, {mono: true})}
            </div>
          </Card>
        )}
      </div>
      <Nav t={t} back={back} next={() => go("download")} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function Download({t, lang, form, back, restart}){
  const gen = useMemo(() => generate(form, lang), [form, lang]);
  const [mask, setMask] = useState(true);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState({});
  const {err, warn} = gen.check;
  const webinar = gen.webinar;
  const wordName = lang === "es" ? WORD_NAME_ES : WORD_NAME_EN;
  const summary = summaryRows(t, form, gen, lang);

  const word = async (as, m) => { const {buildWord} = await import("./word.js"); return buildWord(gen, lang, summary, {mask: m, as}); };
  const dlZip = async () => {
    setBusy("zip");
    try {
      const entries = [...gen.entries];
      if (webinar) entries.push({name: "dx-install/" + wordName, data: new Uint8Array(await (await word("blob", false)).arrayBuffer())});
      download(webinar ? ZIP_NAME_WEBINAR : ZIP_NAME, zipBytes(entries), "application/zip");
    } finally { setBusy(""); }
  };
  const dlWord = async () => { setBusy("word"); try { download(wordName, await word("blob", mask)); } finally { setBusy(""); } };
  const groups = webinar ? [[t.webP1t, gen.prep], [t.webP2t, gen.demo]] : [[null, gen.steps]];

  return (
    <div>
      <Title sub={t.dlSub}>{t.dlTitle}</Title>
      {err.length > 0 && <Callout tone="error" title={t.errors} className="mb-5"><ul className="list-disc space-y-1 pl-5">{err.map(e => <li key={e}>{e}</li>)}</ul></Callout>}
      {warn.length > 0 && <Callout tone="warn" title={t.warnings} className="mb-5"><ul className="list-disc space-y-1 pl-5">{warn.map(e => <li key={e}>{e}</li>)}</ul></Callout>}
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <Card>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {summary.slice(0, 4).map(([k, v]) => <div key={k}><dt className="text-xs uppercase tracking-wider text-slate-500">{k}</dt><dd className="mt-0.5 break-all font-medium text-slate-900 dark:text-white">{v}</dd></div>)}
            </dl>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <DownloadCard icon={<IconZip />} title={t.dlZip} text={webinar ? t.dlZipWebT : t.dlZipT} onClick={dlZip} busy={busy === "zip"} disabled={err.length > 0} t={t} primary />
            <DownloadCard icon={<IconDoc />} title={t.dlRunbook} text={t.dlRunbookT} onClick={() => download("RUNBOOK.md", gen.runbook, "text/markdown")} disabled={err.length > 0} t={t} />
            {webinar && (
              <div className="sm:col-span-2">
                <DownloadCard icon={<IconPresent />} title={t.dlWord} text={t.dlWordT} onClick={dlWord} busy={busy === "word"} disabled={err.length > 0} t={t} />
                <div className="mb-1 mt-4 pl-2"><Check checked={mask} onChange={setMask}>{t.maskCreds}</Check></div>
              </div>
            )}
          </div>
          <Card>
            <H2>{t.afterTitle}</H2>
            <p className="text-sm text-slate-600 dark:text-slate-400">{webinar ? t.afterWeb : t.afterAll}</p>
            <Code {...C(t)}>{webinar
              ? `unzip ${ZIP_NAME_WEBINAR} && cd dx-install\n./prepare.sh      # ${lang === "es" ? "fase 1, antes de la sesión" : "phase 1, before the session"}\n./demo.sh         # ${lang === "es" ? "fase 2, el día de la demo" : "phase 2, the day of the demo"}\n./uninstall.sh    # ${lang === "es" ? "al terminar" : "when you finish"}`
              : `unzip ${ZIP_NAME} && cd dx-install\n./install.sh\n./install.sh --list\n./uninstall.sh`}</Code>
          </Card>
        </div>
        <Card>
          <H2>{t.preview}</H2>
          {groups.map(([head, steps], gi) => (
            <div key={gi} className="mb-4">
              {head && <div className="mb-2 mt-2 text-xs font-bold uppercase tracking-wider brand-text">{head}</div>}
              {stagesOf(steps).map(([lab, list]) => (
                <div key={lab} className="border-b border-slate-100 last:border-0 dark:border-navy-800">
                  <button type="button" onClick={() => setOpen(o => ({...o, [gi + lab]: !o[gi + lab]}))} className="flex w-full items-center justify-between gap-3 py-2.5 text-left">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{lab}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">{t.stepsCount(list.length)} <span>{open[gi + lab] ? "▾" : "▸"}</span></span>
                  </button>
                  {open[gi + lab] && (
                    <ol className="mb-3 space-y-1.5 pl-1 text-sm">
                      {list.map(st => <li key={st.id} className="flex gap-2"><span className="w-9 shrink-0 font-mono text-xs leading-5 text-brand-blue dark:text-blue-300">{st.id}</span><span className={cx("text-slate-700 dark:text-slate-300", st.opt && "text-slate-400 dark:text-slate-500")}>{st.title}</span></li>)}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          ))}
        </Card>
      </div>
      <Nav t={t} back={back} extra={<Button variant="secondary" onClick={restart}>{t.restart}</Button>} />
    </div>
  );
}

function stagesOf(steps){
  const m = new Map();
  for (const st of steps) { if (!m.has(st.lab)) m.set(st.lab, []); m.get(st.lab).push(st); }
  return [...m.entries()];
}

function DownloadCard({icon, title, text, onClick, busy, disabled, primary, t}){
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy}
      className={cx("flex h-full w-full items-start gap-4 rounded-2xl border-2 p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
        primary ? "border-transparent brand-gradient text-white shadow-lg shadow-brand-blue/20 hover:brightness-110" : "border-slate-200 bg-white hover:border-brand-blue dark:border-navy-700 dark:bg-navy-900")}>
      <span className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-xl", primary ? "bg-white/20" : "bg-slate-100 text-brand-blue dark:bg-navy-800 dark:text-blue-300")}>{busy ? <Spinner className="h-5 w-5" /> : icon}</span>
      <span>
        <span className="flex items-center gap-2 font-semibold">{title} <IconDownload className="h-4 w-4 opacity-70" /></span>
        <span className={cx("mt-1 block text-sm", primary ? "text-white/85" : "text-slate-600 dark:text-slate-400")}>{busy ? t.building : text}</span>
      </span>
    </button>
  );
}

export function summaryRows(t, form, gen, lang){
  const s = gen.s, d = depsOf(form);
  const stages = [...new Set((gen.webinar ? gen.demo : gen.steps).map(x => x.stage))].map(n => stageLabel(n, lang));
  return [
    [t.sumEnv, (t.envNames[form.envSource] || "—") + (form.envSource === "aws" ? ` (${form.awsKind.toUpperCase()})` : "")],
    [t.sumDeploy, t.deployNames[form.preset] || "—"],
    [t.sumHost, `https://${s.DX_HOST || "—"}`],
    [t.sumPlatform, `${s.platform}${s.openshift ? "" : ` · Ingress ${s.INGRESS_CLASS}`} · ${s.SC_RWO} / ${s.SC_RWX}`],
    ...stages.map((x, i) => [i === 0 ? (lang === "es" ? "Etapas" : "Stages") : "", x]),
    ["Namespaces", `${s.DX_NS} · ${s.SHARED_NS}`],
    [lang === "es" ? "Dependencias" : "Dependencies", Object.entries(d).filter(([, v]) => v).map(([k]) => ({ldap: "OpenLDAP", pg: "PostgreSQL", llm: "LiteLLM", mcp: "EUROPESIP MCP"})[k]).join(", ") || "—"],
    ["HCL registry", s.HCL_HARBOR_USER || "—"],
  ];
}
