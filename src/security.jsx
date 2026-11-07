// A small "Is it safe?" note next to every place that asks for credentials (Harbor, OpenRouter, AWS, Red Hat)
import {useState} from "react";
import {cx} from "./ui.jsx";

const DOC = {en: "https://github.com/europesip/hcl-dx-compose-installer/blob/main/docs/security.md",
             es: "https://github.com/europesip/hcl-dx-compose-installer/blob/main/docs/security.es.md"};

export function SecurityNote({t, lang, kind, className}){
  const [open, setOpen] = useState(false);
  const s = t.sec;
  return (
    <div className={cx("text-xs", className)}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="inline-flex items-center gap-1.5 font-semibold text-brand-blue hover:underline dark:text-blue-300">
        <span className="grid h-4 w-4 place-items-center rounded-full border border-current text-[10px] font-bold">i</span>{s.title}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-slate-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-slate-200 rise">
          <p>{s.risk}</p>
          <p>{kind === "aws" || kind === "redhat" ? s.whereServer : s.whereBrowser}</p>
          <p>{s.image}</p>
          <p><b>{s.tipTitle}</b> {s.tips[kind]}</p>
          <a href={DOC[lang] || DOC.en} target="_blank" rel="noreferrer" className="font-semibold text-brand-blue underline dark:text-blue-300">{s.more} ↗</a>
        </div>
      )}
    </div>
  );
}
