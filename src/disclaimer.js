// The scope disclaimer (issue #5): accepted every time the wizard starts, and repeated at the top of RUNBOOK.md and of the
// webinar Word/PDF guide. Same content as slide 2 of the installer deck ("What this tool is, and what it is not").
export const LICENSE_URL = "https://github.com/europesip/hcl-dx-compose-installer/blob/main/LICENSE";

export const DISCLAIMER = {
  en: {
    title: "Before you start: what this installer is, and what it is not",
    items: [
      ["Built for", "Demo environments, tests, proofs of concept, training, and as a solid starting point for your own installation."],
      ["Not a production sizing tool", "A production platform with high load expectations needs many tuning and adjustment values (JVM, pools, replicas, caches, storage, HA, security hardening) that are outside the scope of this tool."],
      ["The most frequent options", "Its goal is not to cover every possible installation, but the most frequent ones, done right and tested."],
      ["For large environments", "We recommend Professional Services to finish tuning the installation (on-site adjustments and custom parametrisation) or to customise the tool for your requirements."],
      ["As is", "The software is provided as is, without warranty of any kind, under its MIT licence."],
    ],
    licence: "Read the licence",
    accept: "I understand the scope of this installer and I use it as is",
    cont: "Continue", cancel: "Cancel",
  },
  es: {
    title: "Antes de empezar: qué es este instalador, y qué no es",
    items: [
      ["Pensado para", "Entornos de demo, pruebas, pruebas de concepto, formación, y como punto de partida sólido para tu propia instalación."],
      ["No dimensiona producción", "Una plataforma en producción con expectativas de carga altas necesita muchos valores de ajuste (JVM, pools, réplicas, cachés, almacenamiento, alta disponibilidad, bastionado de seguridad) que quedan fuera del alcance de esta herramienta."],
      ["Las opciones más frecuentes", "Su objetivo no es cubrir todas las instalaciones posibles, sino las más frecuentes, bien hechas y probadas."],
      ["Para entornos grandes", "Recomendamos Servicios Profesionales para terminar de ajustar la instalación (ajustes in situ y parametrización a medida) o para adaptar la herramienta a tus requisitos."],
      ["Tal cual (as is)", "El software se ofrece tal cual, sin garantía de ningún tipo, bajo su licencia MIT."],
    ],
    licence: "Leer la licencia",
    accept: "Entiendo el alcance de este instalador y lo uso tal cual (as is)",
    cont: "Continuar", cancel: "Cancelar",
  },
};

// The disclaimer as a Markdown block, for RUNBOOK.md
export function disclaimerMd(lang){
  const d = DISCLAIMER[lang] || DISCLAIMER.en;
  return [`> ℹ️ **${d.title}**`, ">", ...d.items.map(([h, p]) => `> - **${h}:** ${p}`), ">", `> ${d.licence}: ${LICENSE_URL}`].join("\n") + "\n";
}

// The disclaimer as blocks of the webinar Word/PDF guide (src/script.js)
export function disclaimerBlocks(lang){
  const d = DISCLAIMER[lang] || DISCLAIMER.en;
  return [{t: "h1", text: d.title}, {t: "bullets", items: d.items.map(([h, p]) => `${h}: ${p}`)},
          {t: "p", text: `${d.licence}: ${LICENSE_URL}`, tone: "muted"}];
}
