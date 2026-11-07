// Small building blocks of the interface (Tailwind)
import {useState} from "react";

export const cx = (...c) => c.filter(Boolean).join(" ");

export function Card({className, children, ...p}){
  return <div className={cx("min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-navy-700 dark:bg-navy-900 sm:p-6", className)} {...p}>{children}</div>;
}

export function Title({children, sub}){
  return (
    <div className="mb-6 rise">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">{children}</h1>
      {sub && <p className="mt-2 max-w-3xl text-slate-600 dark:text-slate-400">{sub}</p>}
    </div>
  );
}

export function H2({children, className}){
  return <h2 className={cx("mb-3 text-lg font-semibold text-slate-900 dark:text-white", className)}>{children}</h2>;
}

// A big selectable card (radio behaviour)
export function Choice({selected, onClick, icon, title, children, badge, tone = "blue", disabled, className}){
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={!!selected}
      className={cx("group relative flex h-full w-full flex-col items-start gap-2 rounded-2xl border-2 bg-white p-5 text-left transition dark:bg-navy-900",
        selected ? "border-brand-blue shadow-lg shadow-brand-blue/10 ring-4 ring-brand-blue/10" : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-navy-700 dark:hover:border-navy-700/80",
        disabled && "cursor-not-allowed opacity-50", className)}>
      {badge && <span className={cx("absolute right-4 top-4 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "amber" ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" : "bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-blue-300")}>{badge}</span>}
      {icon && <span className={cx("mb-1 grid h-11 w-11 place-items-center rounded-xl text-white", selected ? "brand-gradient" : "bg-slate-800 group-hover:brand-gradient dark:bg-navy-700")}>{icon}</span>}
      <span className="pr-20 text-base font-semibold text-slate-900 dark:text-white">{title}</span>
      {children && <span className="text-sm text-slate-600 dark:text-slate-400">{children}</span>}
    </button>
  );
}

export function Button({variant = "primary", className, children, ...p}){
  const v = {
    primary: "brand-gradient text-white shadow-md shadow-brand-blue/20 hover:brightness-110 disabled:opacity-40 disabled:shadow-none",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-200 dark:hover:bg-navy-800 disabled:opacity-40",
    ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800",
    danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40",
  }[variant];
  return <button type="button" className={cx("inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed", v, className)} {...p}>{children}</button>;
}

export function Field({label, hint, children, className}){
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  );
}
const inputCls = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-4 focus:ring-brand-blue/15 dark:border-navy-700 dark:bg-navy-950 dark:text-white";
export function Input({mono, className, ...p}){
  return <input className={cx(inputCls, mono && "font-mono", className)} spellCheck={false} autoComplete="off" {...p} />;
}
export function Secret(p){
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} mono className="pr-12" {...p} />
      <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-2 my-auto h-8 rounded-lg px-2 text-slate-500 hover:text-slate-800 dark:hover:text-white" aria-label="show">
        {show ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
}
export function Select({children, className, ...p}){
  return <select className={cx(inputCls, className)} {...p}>{children}</select>;
}

export function Check({checked, onChange, children, disabled, hint}){
  return (
    <label className={cx("flex cursor-pointer items-start gap-3 rounded-xl p-2 -m-2 hover:bg-slate-50 dark:hover:bg-navy-800/50", disabled && "cursor-not-allowed opacity-50")}>
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#0040ff]" checked={!!checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="text-sm text-slate-700 dark:text-slate-300">{children}{hint && <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}</span>
    </label>
  );
}

export function Toggle({checked, onChange, disabled, label}){
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cx("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition", checked ? "brand-gradient" : "bg-slate-300 dark:bg-navy-700", disabled && "opacity-40")}>
      <span className={cx("inline-block h-5 w-5 rounded-full bg-white shadow transition", checked ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

export function Segmented({value, onChange, options}){
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-navy-700 dark:bg-navy-950">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
          className={cx("rounded-lg px-3.5 py-1.5 text-sm font-medium transition", value === v ? "bg-white text-slate-900 shadow dark:bg-navy-800 dark:text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white")}>{l}</button>
      ))}
    </div>
  );
}

export function Callout({tone = "info", title, children, className}){
  const t = {
    info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100",
    warn: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
    error: "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100",
    ok: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100",
  }[tone];
  return (
    <div className={cx("rounded-xl border p-4 text-sm", t, className)} role={tone === "error" ? "alert" : undefined}>
      {title && <div className="mb-1 font-semibold">{title}</div>}
      {children}
    </div>
  );
}

export function Code({children, lang = "bash", copyLabel = "Copy", copiedLabel = "Copied"}){
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(children); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* not allowed */ }
  };
  return (
    <div className="group relative mt-2 overflow-hidden rounded-xl border border-navy-800 bg-navy-950">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-400">
        <span>{lang}</span>
        <button type="button" onClick={copy} className="rounded-md px-2 py-0.5 font-medium normal-case tracking-normal text-slate-300 hover:bg-white/10 hover:text-white">{ok ? `✓ ${copiedLabel}` : copyLabel}</button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed text-slate-100"><code>{children}</code></pre>
    </div>
  );
}

export function Badge({children, tone = "slate"}){
  const t = {slate: "bg-slate-100 text-slate-700 dark:bg-navy-800 dark:text-slate-300", blue: "bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-blue-300",
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300", amber: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"}[tone];
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", t)}>{children}</span>;
}

// Icons (inline SVG, stroke = currentColor)
const I = ({d, className = "h-5 w-5", children}) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{d ? <path d={d} /> : children}</svg>
);
export const Eye = () => <I><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></I>;
export const EyeOff = () => <I><path d="M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2M9.9 5.1A10.9 10.9 0 0112 5c6.5 0 10 7 10 7a17.6 17.6 0 01-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a10.6 10.6 0 005.4-1.4" /></I>;
export const IconCheck = p => <I {...p} d="M5 12.5l4.5 4.5L19 7.5" />;
export const IconArrow = p => <I {...p} d="M5 12h14M13 6l6 6-6 6" />;
export const IconBack = p => <I {...p} d="M19 12H5M11 6l-6 6 6 6" />;
export const IconServer = p => <I {...p}><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></I>;
export const IconCloud = p => <I {...p} d="M7 18a4.5 4.5 0 01-.7-8.95A6 6 0 0118 8.5a4 4 0 01-.5 9.5H7z" />;
export const IconLaptop = p => <I {...p}><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2 19h20" /></I>;
export const IconLinux = p => <I {...p}><path d="M12 3c-2 0-3 1.8-3 4v3c0 1-2 3-2.5 5S7 19 9 19.5M12 3c2 0 3 1.8 3 4v3c0 1 2 3 2.5 5S17 19 15 19.5M9 19.5c1 .5 5 .5 6 0" /><circle cx="10.5" cy="7.5" r=".6" /><circle cx="13.5" cy="7.5" r=".6" /></I>;
export const IconPlus = p => <I {...p} d="M12 5v14M5 12h14" />;
export const IconLayers = p => <I {...p}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></I>;
export const IconSliders = p => <I {...p} d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" />;
export const IconPresent = p => <I {...p}><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M12 16v4M8 20h8M8 9l3 2 5-4" /></I>;
export const IconDownload = p => <I {...p} d="M12 4v11M7 10l5 5 5-5M5 20h14" />;
export const IconDoc = p => <I {...p}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></I>;
export const IconZip = p => <I {...p}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M11 5h1M11 8h1M11 11h1M10.5 14h2v3h-2z" /></I>;
export const IconTrash = p => <I {...p} d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />;
export const IconSpark = p => <I {...p} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />;
export const IconWarn = p => <I {...p}><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v4M12 17.5h.01" /></I>;
export const Spinner = ({className = "h-4 w-4"}) => <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" /><path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;

// Back / Next bar at the bottom of a view
export function Nav({t, back, next, nextLabel, nextDisabled, hideBack, extra}){
  return (
    <div className="mt-10 flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 dark:border-navy-800 sm:flex-row sm:items-center">
      {!hideBack && <Button variant="ghost" onClick={back}><IconBack className="h-4 w-4" />{t.back}</Button>}
      <div className="flex-1" />
      {extra}
      {next && <Button onClick={next} disabled={nextDisabled} className="sm:min-w-40">{nextLabel || t.next}<IconArrow className="h-4 w-4" /></Button>}
    </div>
  );
}

// A modal dialog (Escape or the backdrop close it as "cancel")
export function Modal({open, title, children, actions, onClose}){
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}
      onClick={e => e.target === e.currentTarget && onClose && onClose()} onKeyDown={e => e.key === "Escape" && onClose && onClose()}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-navy-900 rise">
        <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
        <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">{children}</div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{actions}</div>
      </div>
    </div>
  );
}
