// HCL DX Compose Installer: a guided flow in five phases (welcome, environment, deployment, details,
// download), one view at a time, with a progress bar.
import {useEffect, useMemo, useState} from "react";
import {TEXTS, detectLang} from "./i18n.js";
import {DEFAULTS, NO_STORE, normalise} from "./state.js";
import {cx, IconCheck} from "./ui.jsx";
import {Welcome, EnvQuestion, EnvOwn, EnvCreate, EnvLocal, Deploy, DeployCustom, Details, Download} from "./views.jsx";
import {EnvAws} from "./aws-view.jsx";

const PHASE = {welcome: 0, env: 1, "env-own": 1, "env-create": 1, "env-wsl": 1, "env-linux": 1, "env-aws": 1, deploy: 2, "deploy-custom": 2, details: 3, download: 4};
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* no storage */ } },
};

export default function App(){
  const [lang, setLangState] = useState(detectLang);
  const t = TEXTS[lang];
  const [form, setForm] = useState(() => normalise({...DEFAULTS, ...store.get("dxi-form", {})}));
  const [view, setView] = useState(() => store.get("dxi-view", "welcome"));
  const [history, setHistory] = useState(() => store.get("dxi-history", []));
  const [envPick, setEnvPick] = useState(() => store.get("dxi-envpick", ""));
  const [info, setInfo] = useState(null);   // the server (null: not asked yet, false: no server)

  useEffect(() => { document.documentElement.lang = lang; document.title = t.app; try { localStorage.setItem("dxi-lang", lang); } catch { /* */ } }, [lang]);
  useEffect(() => { const keep = {...form}; for (const k of NO_STORE) delete keep[k]; store.set("dxi-form", keep); }, [form]);
  useEffect(() => { store.set("dxi-view", view); store.set("dxi-history", history); store.set("dxi-envpick", envPick); }, [view, history, envPick]);
  useEffect(() => { fetch("/api/info").then(r => r.ok ? r.json() : false).then(setInfo).catch(() => setInfo(false)); }, []);
  useEffect(() => { window.scrollTo({top: 0, behavior: "smooth"}); }, [view]);
  if (!(view in PHASE)) setView("welcome");

  const set = patch => setForm(f => normalise({...f, ...(typeof patch === "function" ? patch(f) : patch)}));
  const go = v => { setHistory(h => [...h, view]); setView(v); };
  const back = () => setHistory(h => { const p = h[h.length - 1]; if (p) setView(p); return h.slice(0, -1); });
  const restart = () => { setHistory([]); setView("welcome"); setEnvPick(""); setForm(normalise({...DEFAULTS})); };

  const ctx = {t, lang, form, set, go, back, info, envPick, setEnvPick, restart};
  const phase = PHASE[view] ?? 0;

  const View = useMemo(() => ({welcome: Welcome, env: EnvQuestion, "env-own": EnvOwn, "env-create": EnvCreate, "env-wsl": EnvLocal, "env-linux": EnvLocal,
    "env-aws": EnvAws, deploy: Deploy, "deploy-custom": DeployCustom, details: Details, download: Download})[view] || Welcome, [view]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur dark:border-navy-800 dark:bg-navy-950/85">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <button type="button" onClick={restart} className="flex shrink-0 items-center gap-3" aria-label={t.restart}>
            <img src="/europesip-logo.svg" alt="EUROPESIP" className="logo-light h-6 sm:h-7" />
            <img src="/europesip-logo-white.svg" alt="EUROPESIP" className="logo-dark h-6 sm:h-7" />
          </button>
          <span className="hidden h-6 w-px bg-slate-200 dark:bg-navy-700 sm:block" />
          <span className="hidden truncate text-sm font-semibold text-slate-700 dark:text-slate-200 sm:block">{t.app}</span>
          <div className="ml-auto flex rounded-lg border border-slate-200 p-0.5 text-xs font-semibold dark:border-navy-700" role="group" aria-label="Language">
            {["en", "es"].map(l => (
              <button key={l} type="button" onClick={() => setLangState(l)} aria-pressed={lang === l}
                className={cx("rounded-md px-2.5 py-1 uppercase", lang === l ? "brand-gradient text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white")}>{l}</button>
            ))}
          </div>
        </div>
        <Progress phases={t.phases} phase={phase} t={t} />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <View key={view} {...ctx} view={view} />
      </main>

      <footer className="border-t border-slate-200 py-6 text-xs text-slate-500 dark:border-navy-800 dark:text-slate-500">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>EUROPESIP · {t.footer} · <a className="underline hover:text-slate-800 dark:hover:text-slate-300" href="https://github.com/europesip/hcl-dx-compose-installer" target="_blank" rel="noreferrer">GitHub</a>{info && info.version ? ` · v${info.version}` : ""}</span>
          <span className="max-w-xl sm:text-right">{t.footerHcl}</span>
        </div>
      </footer>
    </div>
  );
}

function Progress({phases, phase, t}){
  const pct = (phase / (phases.length - 1)) * 100;
  return (
    <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6">
      {/* phone: a compact bar */}
      <div className="sm:hidden">
        <div className="mb-1.5 flex justify-between text-xs font-medium"><span className="text-slate-900 dark:text-white">{phases[phase]}</span><span className="text-slate-500">{t.stepOf(phase + 1, phases.length)}</span></div>
        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-navy-800"><div className="brand-gradient h-1.5 rounded-full transition-all duration-500" style={{width: `${Math.max(pct, 6)}%`}} /></div>
      </div>
      {/* wider: the phases with their marks */}
      <ol className="relative hidden items-center justify-between sm:flex">
        <div className="absolute left-4 right-4 top-4 h-1 rounded-full bg-slate-200 dark:bg-navy-800" aria-hidden="true" />
        <div className="brand-gradient absolute left-4 top-4 h-1 rounded-full transition-all duration-500" style={{width: `calc((100% - 2rem) * ${pct / 100})`}} aria-hidden="true" />
        {phases.map((p, i) => (
          <li key={p} className="relative z-10 flex flex-col items-center gap-1.5" aria-current={i === phase ? "step" : undefined}>
            <span className={cx("grid h-9 w-9 place-items-center rounded-full border-2 text-sm font-bold transition-all",
              i < phase ? "brand-gradient border-transparent text-white" : i === phase ? "border-brand-blue bg-white text-brand-blue ring-4 ring-brand-blue/15 dark:bg-navy-950 dark:text-blue-300" : "border-slate-300 bg-white text-slate-400 dark:border-navy-700 dark:bg-navy-950")}>
              {i < phase ? <IconCheck className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cx("text-xs font-medium", i === phase ? "text-slate-900 dark:text-white" : "text-slate-500")}>{p}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

