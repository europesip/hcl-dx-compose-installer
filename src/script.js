// The webinar script as a document model, rendered to Word (word.js) and PDF (pdf.js) with the same content.
// Blocks: {t: "h1"|"h2"|"h3"|"p"|"bullets"|"code"|"table"|"callout"|"break"|"toc"|"slide"}, plus the cover.
// Content: the purpose of the webinar (from its deck), who EUROPESIP is, the live session, security,
// the preparation and each stage of the demo with why, the commands, the files and the slide it goes with.
import {keyChanges, sourceOf, isSecretStep, secretValues, maskText, filesOfStep} from "./bundle.js";
import {STAGES} from "./engine/stages.js";

export const WEBINAR = {date: "2026-11-12", title: "Deploy HCL DX Compose in Minutes", series: "HCL DX Webinar"};

const T = {
  en: {
    docTitle: "Webinar script and lab guide", live: d => `Live webinar · ${d}`, dateFmt: "en-GB",
    masked: "The credentials are hidden in this document (********). The zip of the installation carries them.",
    plain: "This document contains credentials in plain text: keep it private.",
    toc: "Contents", tocNote: "In Word: right-click the table and choose Update field to fill it in.",
    purpose: "The purpose of the webinar",
    purposeP: [
      "“Deploy HCL DX Compose in Minutes” is a session of the HCL DX Webinar series: product-focused, hands-on sessions that highlight features and functionality, with an emphasis on demos and visuals.",
      "Its goal is to take the guesswork out of deploying HCL DX Compose on Kubernetes. Together with HCL's Business Partner EUROPESIP, the complexity is stripped away and a deployment is built live, step by step, iteration by iteration.",
      "A key message for the audience: if you already hold HCL DX licences, you can deploy DX Compose across your non-production environments today, with no extra licensing hurdle.",
    ],
    scenario: "The scenario", scenarioP: "Harry Pappus, a DX administrator at Nex Haven, deploys DX Compose with a practical, incremental approach, building real capabilities one iteration at a time:",
    scenarioL: ["Basic deployment (embedded Derby database)", "LDAP, with its credentials in Kubernetes Secrets", "External database", "AI assistant (HCL DX IQ)", "Search integration"],
    who: "About EUROPESIP",
    whoP: [
      "EUROPESIP is a Spanish technology consultancy with more than 20 years in enterprise environments: its own technical team, a clear methodology and real support in every phase of a project.",
      "It is an HCL Software Business Partner and its Competence Centre in Spain for HCL Domino and HCL Digital Experience, and it also works with IBM WebSphere, Kubernetes and enterprise middleware. Its technology partners include HCL Software, IBM, AWS, Red Hat and SUSE.",
      "Its experience with HCL DX includes large public-sector portals: together with Evolutio, EUROPESIP manages the maintenance, licences and evolution of the HCL DX portals of the Gestión Integral de Servicios Sociales (GISS) in Spain, high-traffic platforms used every day by citizens and professionals.",
      "EUROPESIP also builds open-source assets for HCL DX Compose: the HCL DX Compose labs, the HCL DX Compose Installer (which generated this document) and ÓRBITA, an employee intranet for DX Compose.",
    ],
    session: "The live session",
    sessionP: d => `This material is what will be shown and taught in the live webinar on ${d}. It follows the deck of the session slide by slide: for every stage it says why it is done, which commands run, which files and values to show, and what the audience should see.`,
    agenda: "Agenda", agendaHead: ["Stage", "What we build", "Time", "Slides"],
    agendaNote: "Times measured with the images already in the nodes; on a new cluster the first installation of DX takes 15-25 minutes.",
    security: "Security: prepare late, rotate right after",
    securityP: [
      "The installation uses real credentials: the CLI secret of the HCL registry (hclcr.io), the OpenRouter API key and the passwords of the environment.",
      "For security, prepare the environment only a few days before the webinar (phase 1), and rotate every credential right after it: regenerate the CLI secret at hclcr.io, delete the OpenRouter key, and change the passwords or delete the whole environment.",
      "The zip of the installation contains the credentials in plain text: keep it private and delete it after the webinar.",
    ],
    start: "Starting point", startP: "What must be in place before the preparation (slide 6):",
    startRows: s => [["Kubernetes", `${s.openshift ? "OpenShift" : "Kubernetes 1.26-1.36"}, x86-64 nodes, cluster administrator`], ["Workstation", "kubectl, Helm, openssl, curl and python3, pointing to the cluster"],
      ["HCL registry", "Access to hclcr.io with your CLI secret"], ["DNS", `${s.DX_HOST} resolves to the Ingress controller`],
      ["Ingress", s.openshift ? "The OpenShift router" : `IngressClass ${s.INGRESS_CLASS}`], ["StorageClasses", `${s.SC_RWO} (ReadWriteOnce) and ${s.SC_RWX} (ReadWriteMany, for DAM)`],
      ["Free resources", "Base DX ~5 CPU / 11 GiB; with every stage, a start-up peak of ~8 CPU / 14 GiB"]],
    prep: "Phase 1 · Preparing the environment",
    prepP: "Run it a few days before the webinar, from the dx-install folder. It installs every prerequisite except LiteLLM, and stops. In the session it is shown as already done (slides 6 and 7).",
    prepCmd: "unzip dx-compose-webinar.zip && cd dx-install\n./prepare.sh",
    ready: "Checkpoint: when prepare.sh ends with “Environment ready for the session”, stop. Nothing else is installed until the day of the webinar.",
    demo: "Phase 2 · The live demo",
    demoP: "On the day: demo.sh shows each command and waits for Enter before running it (s = skip, q = quit). While Helm works, explain the next stage. If something fails, fix it and resume with ./demo.sh --from <step>.",
    demoCmd: "cd dx-install\n./demo.sh",
    why: "Why", tell: "What to tell", steps: "Steps", look: "Values to show", from: "From the lab template", file: "The file", used: "Value in this demo", was: "Template value", newv: "(new)",
    secrets: "Secrets created", manual: "Manual step", opt: "optional check", expect: "What the audience sees", slide: n => `Slide ${n}`, time: "Time",
    close: "Closing", closeP: [
      "You can deploy HCL DX Compose, connect it to LDAP, move it to PostgreSQL, and enable search and IQ in no time.",
      "Next steps for the audience: replay the webinar; use the GitHub repositories, with the documentation of every step; and get support from HCL's Customer Support Engineers and EUROPESIP.",
      "Then open the Q&A: questions that are not answered live are answered in the follow-ups.",
    ],
    refs: "References", refsL: ["HCL DX Compose labs: github.com/europesip/hcl-dx-compose-labs", "HCL DX Compose Installer: github.com/europesip/hcl-dx-compose-installer", "EUROPESIP: www.europesip.com · info@europesip.com"],
    after: "After the webinar", afterL: ["Delete the environment: ./uninstall.sh (it asks you to type delete).", "Rotate the credentials: CLI secret of hclcr.io, OpenRouter key, passwords.", "Delete the zip of the installation, which contains the credentials."],
    appA: "Appendix A · Credentials and keys", appAP: "The steps that create Secrets, certificates and keys, in the order they run.",
    litellm: "LiteLLM master key generated for this installation:",
    appB: "Appendix B · Files of the installation", appBP: "The YAML, properties and LDIF files the steps apply, as they are in the zip.",
    footer: "EUROPESIP · Deploy HCL DX Compose in Minutes · ", page: "page",
    slideNote: "Note: slide 7 shows LiteLLM as already installed; following HCL's feedback, it is installed live in stage 0.",
  },
  es: {
    docTitle: "Guion del webinar y guía del laboratorio", live: d => `Webinar en directo · ${d}`, dateFmt: "es-ES",
    masked: "Las credenciales están ocultas en este documento (********). El zip de la instalación las lleva.",
    plain: "Este documento contiene credenciales en texto plano: guárdalo en privado.",
    toc: "Contenido", tocNote: "En Word: haz clic derecho en el índice y elige Actualizar campo para rellenarlo.",
    purpose: "El propósito del webinar",
    purposeP: [
      "«Deploy HCL DX Compose in Minutes» es una sesión de la serie HCL DX Webinar: sesiones prácticas centradas en el producto, que muestran sus funciones con demos y material visual.",
      "Su objetivo es quitar las dudas a la hora de desplegar HCL DX Compose en Kubernetes. Junto al Business Partner de HCL EUROPESIP, se elimina la complejidad y se construye un despliegue en directo, paso a paso, iteración a iteración.",
      "Un mensaje clave para la audiencia: si ya tienes licencias de HCL DX, puedes desplegar DX Compose hoy mismo en tus entornos de no producción, sin trabas de licencias adicionales.",
    ],
    scenario: "El escenario", scenarioP: "Harry Pappus, administrador de DX en Nex Haven, despliega DX Compose con un enfoque práctico e incremental, construyendo capacidades reales iteración a iteración:",
    scenarioL: ["Despliegue básico (base de datos Derby embebida)", "LDAP, con sus credenciales en Secrets de Kubernetes", "Base de datos externa", "Asistente de IA (HCL DX IQ)", "Integración de la búsqueda"],
    who: "Sobre EUROPESIP",
    whoP: [
      "EUROPESIP es una consultora tecnológica española con más de 20 años en entornos enterprise: equipo técnico propio, metodología clara y acompañamiento real en cada fase de un proyecto.",
      "Es Business Partner de HCL Software y su Centro de Competencia en España para HCL Domino y HCL Digital Experience, y trabaja también con IBM WebSphere, Kubernetes y middleware enterprise. Entre sus partners tecnológicos están HCL Software, IBM, AWS, Red Hat y SUSE.",
      "Su experiencia con HCL DX incluye grandes portales del sector público: junto a Evolutio, EUROPESIP gestiona el mantenimiento, las licencias y la evolución de los portales HCL DX de la Gestión Integral de Servicios Sociales (GISS), plataformas de alto tráfico que usan a diario ciudadanos y profesionales.",
      "EUROPESIP crea además material de código abierto para HCL DX Compose: los laboratorios de HCL DX Compose, el Instalador de HCL DX Compose (que ha generado este documento) y ÓRBITA, una intranet para empleados sobre DX Compose.",
    ],
    session: "La sesión en directo",
    sessionP: d => `Este material es el que se mostrará y enseñará en el webinar en directo del ${d}. Sigue la presentación de la sesión diapositiva a diapositiva: para cada etapa explica por qué se hace, qué comandos se ejecutan, qué ficheros y valores enseñar y qué debe ver la audiencia.`,
    agenda: "Agenda", agendaHead: ["Etapa", "Qué construimos", "Tiempo", "Diapositivas"],
    agendaNote: "Tiempos medidos con las imágenes ya en los nodos; en un clúster nuevo la primera instalación de DX tarda 15-25 minutos.",
    security: "Seguridad: preparar tarde, rotar justo después",
    securityP: [
      "La instalación usa credenciales reales: el CLI secret del registro de HCL (hclcr.io), la clave de API de OpenRouter y las contraseñas del entorno.",
      "Por seguridad, prepara el entorno solo unos pocos días antes del webinar (fase 1), y rota todas las credenciales justo después: regenera el CLI secret en hclcr.io, borra la clave de OpenRouter, y cambia las contraseñas o borra el entorno entero.",
      "El zip de la instalación contiene las credenciales en texto plano: guárdalo en privado y bórralo después del webinar.",
    ],
    start: "Punto de partida", startP: "Lo que tiene que estar listo antes de la preparación (diapositiva 6):",
    startRows: s => [["Kubernetes", `${s.openshift ? "OpenShift" : "Kubernetes 1.26-1.36"}, nodos x86-64, administrador del clúster`], ["Puesto de trabajo", "kubectl, Helm, openssl, curl y python3, apuntando al clúster"],
      ["Registro de HCL", "Acceso a hclcr.io con tu CLI secret"], ["DNS", `${s.DX_HOST} resuelve al controlador de Ingress`],
      ["Ingress", s.openshift ? "El router de OpenShift" : `IngressClass ${s.INGRESS_CLASS}`], ["StorageClasses", `${s.SC_RWO} (ReadWriteOnce) y ${s.SC_RWX} (ReadWriteMany, para DAM)`],
      ["Recursos libres", "Base DX ~5 CPU / 11 GiB; con todas las etapas, un pico de arranque de ~8 CPU / 14 GiB"]],
    prep: "Fase 1 · Preparar el entorno",
    prepP: "Ejecútala unos pocos días antes del webinar, desde la carpeta dx-install. Instala todos los pre-requisitos salvo LiteLLM y se detiene. En la sesión se presenta como ya hecho (diapositivas 6 y 7).",
    prepCmd: "unzip dx-compose-webinar.zip && cd dx-install\n./prepare.sh",
    ready: "Punto de control: cuando prepare.sh termina con «Entorno preparado para la sesión», detente. No se instala nada más hasta el día del webinar.",
    demo: "Fase 2 · La demo en directo",
    demoP: "El día del webinar: demo.sh muestra cada comando y espera a Enter antes de ejecutarlo (s = saltar, q = salir). Mientras Helm trabaja, explica la etapa siguiente. Si algo falla, corrígelo y continúa con ./demo.sh --from <paso>.",
    demoCmd: "cd dx-install\n./demo.sh",
    why: "Por qué", tell: "Qué contar", steps: "Pasos", look: "Valores que enseñar", from: "De la plantilla del lab", file: "El fichero", used: "Valor en esta demo", was: "Valor de la plantilla", newv: "(nuevo)",
    secrets: "Secrets que se crean", manual: "Paso manual", opt: "comprobación opcional", expect: "Qué ve la audiencia", slide: n => `Diapositiva ${n}`, time: "Tiempo",
    close: "Cierre", closeP: [
      "Puedes desplegar HCL DX Compose, conectarlo al LDAP, pasarlo a PostgreSQL y activar la búsqueda e IQ en muy poco tiempo.",
      "Próximos pasos para la audiencia: volver a ver el webinar; usar los repositorios de GitHub, con la documentación de cada paso; y contar con el soporte de los Customer Support Engineers de HCL y de EUROPESIP.",
      "Después, el turno de preguntas: las que no se respondan en directo se responden en el seguimiento.",
    ],
    refs: "Referencias", refsL: ["Laboratorios de HCL DX Compose: github.com/europesip/hcl-dx-compose-labs", "Instalador de HCL DX Compose: github.com/europesip/hcl-dx-compose-installer", "EUROPESIP: www.europesip.com · info@europesip.com"],
    after: "Después del webinar", afterL: ["Borra el entorno: ./uninstall.sh (pide escribir delete).", "Rota las credenciales: CLI secret de hclcr.io, clave de OpenRouter, contraseñas.", "Borra el zip de la instalación, que contiene las credenciales."],
    appA: "Anexo A · Credenciales y claves", appAP: "Los pasos que crean Secrets, certificados y claves, en el orden en que se ejecutan.",
    litellm: "Clave maestra de LiteLLM generada para esta instalación:",
    appB: "Anexo B · Ficheros de la instalación", appBP: "Los ficheros YAML, properties y LDIF que aplican los pasos, tal como están en el zip.",
    footer: "EUROPESIP · Deploy HCL DX Compose in Minutes · ", page: "página",
    slideNote: "Nota: la diapositiva 7 presenta LiteLLM como ya instalado; siguiendo las indicaciones de HCL, se instala en directo en la etapa 0.",
  },
};

// Each stage: the slides it goes with, its time, what the audience sees, why it is done and what to tell
const STAGE = {
  en: [
    {slides: "6-7", time: "3 min", show: "The prepared environment, and LiteLLM answering",
     why: "HCL DX IQ needs an LLM proxy as a prerequisite. Everything else was prepared before the session, so the demo starts by checking it and installing the one piece left: LiteLLM.",
     points: ["Prepared before the session: the namespaces, OpenLDAP with the demo users, PostgreSQL 18 (CloudNativePG) and the HCL pull secret. We check them.",
              "LiteLLM is not HCL software: it is the open-source BerriAI proxy, installed with its public chart. It publishes the two logical models IQ asks for, iq-general-purpose and iq-summary, and routes them to Claude through OpenRouter.",
              "Changing the model never touches IQ: only litellm-values.yaml."]},
    {slides: "8-9", time: "~6 min*", show: "The DX pods starting, then the portal at /wps/portal as wpsadmin",
     why: "The base of everything: DX Compose CF239 with its embedded Derby database and the basic user registry, published through an Ingress.",
     points: ["The official charts come from the HCL registry (hclcr.io) with a helm pull; the cluster pulls the images itself with the regcred pull secret.",
              "Three secrets: the pull secret, the wpsadmin credentials and the TLS certificate of the DX HAProxy (self-signed in a PoC).",
              "One helm upgrade --install with custom-values.yaml: walk through the host name, the StorageClasses and the applications enabled.",
              "While it starts, explain the pods: Web Engine, HAProxy, DAM, the Persistence Node, Ring API, image processor and License Manager. Then the Ingress that re-encrypts towards HAProxy."]},
    {slides: "10", time: "~5 min", show: "Signing in as macarena (an LDAP user) and the Administrator role for dxadmins",
     why: "In production DX authenticates against the corporate directory. The chart has a native LDAP block, so nothing is configured by hand in XML, and the bind credentials live in a Kubernetes Secret.",
     points: ["Native LDAP block of the chart (configuration.webEngine.ldap, type other), bind credentials in the dx-ldap-bind secret.",
              "Every upgrade carries all the layers so far: one more -f per stage, never --reuse-values.",
              "The basic registry is kept, so wpsadmin can still sign in. Then give the Administrator role to the dxadmins group."]},
    {slides: "11", time: "~13 min", show: "The transfer in the Web Engine log, and the tables counted in PostgreSQL",
     why: "Derby is fine to start, but a real installation keeps the Web Engine data in an external database. The chart moves it with a single upgrade.",
     points: ["Two secrets with the dbtype and dbdomain properties, and useExternalDatabase: true in the values.",
              "The transfer runs once when the Web Engine starts and is recorded: later upgrades do not repeat it.",
              "PostgreSQL needs the table script from HCL (early release, not validated yet for the Web Engine); otherwise Derby or Oracle.",
              "Result: about 465 tables transferred."]},
    {slides: "12", time: "~8 min", show: "The IQ button in the DX toolbar answering “Which WCM libraries are there?”",
     why: "HCL DX IQ brings an AI assistant to DX. Its LLM goes through LiteLLM and OpenRouter instead of AWS Bedrock, so any provider can be used.",
     points: ["IQ = the Integrator and its MCP Server (chart hcl-dx-iq 1.0.3), next to DX.",
              "The IQ values: the LiteLLM URL and the two models; then one DX upgrade so that HAProxy routes the IQ chat.",
              "Demo: ask IQ about the WCM libraries, in the portal and from the terminal. IQ acts with the permissions of the user who asks."]},
    {slides: "13", time: "~7 min", show: "The Search Center and the search API explorer",
     why: "Search V2 replaces the classic portal search with OpenSearch, secured with mutual TLS.",
     points: ["hcl-dx-search 2.37.0: OpenSearch, the Search Middleware and the File Processor.",
              "Mutual TLS: a lab CA and the admin, node and client certificates, created as secrets.",
              "One more DX upgrade enables Search V2; the crawlers index WCM, JCR, the portal and DAM every 15 minutes."]},
  ],
  es: [
    {slides: "6-7", time: "3 min", show: "El entorno preparado, y LiteLLM respondiendo",
     why: "HCL DX IQ necesita un proxy de LLM como pre-requisito. Todo lo demás se preparó antes de la sesión, así que la demo empieza comprobándolo e instalando la única pieza que falta: LiteLLM.",
     points: ["Preparado antes de la sesión: los namespaces, OpenLDAP con los usuarios de demo, PostgreSQL 18 (CloudNativePG) y el pull secret de HCL. Lo comprobamos.",
              "LiteLLM no es software de HCL: es el proxy open source de BerriAI, instalado con su chart público. Publica los dos modelos lógicos que pide IQ, iq-general-purpose e iq-summary, y los enruta a Claude a través de OpenRouter.",
              "Cambiar el modelo nunca toca IQ: solo litellm-values.yaml."]},
    {slides: "8-9", time: "~6 min*", show: "Los pods de DX arrancando, y después el portal en /wps/portal como wpsadmin",
     why: "La base de todo: DX Compose CF239 con su base de datos Derby embebida y el registro básico de usuarios, publicado con un Ingress.",
     points: ["Los charts oficiales vienen del registro de HCL (hclcr.io) con un helm pull; las imágenes las descarga el propio clúster con el pull secret regcred.",
              "Tres secrets: el pull secret, las credenciales de wpsadmin y el certificado TLS del HAProxy de DX (autofirmado en una PoC).",
              "Un único helm upgrade --install con custom-values.yaml: recorre el nombre de host, las StorageClasses y las aplicaciones activadas.",
              "Mientras arranca, explica los pods: Web Engine, HAProxy, DAM, el Persistence Node, Ring API, image processor y License Manager. Después, el Ingress que re-cifra hacia HAProxy."]},
    {slides: "10", time: "~5 min", show: "Entrar como macarena (usuario del LDAP) y el rol Administrator para dxadmins",
     why: "En producción DX se autentica contra el directorio corporativo. El chart tiene un bloque LDAP nativo, así que no se configura nada a mano en XML, y las credenciales de bind van en un Secret de Kubernetes.",
     points: ["Bloque LDAP nativo del chart (configuration.webEngine.ldap, type other), credenciales de bind en el secret dx-ldap-bind.",
              "Cada upgrade lleva todas las capas hasta el momento: un -f más por etapa, nunca --reuse-values.",
              "Se mantiene el registro básico, así que wpsadmin sigue pudiendo entrar. Después, da el rol Administrator al grupo dxadmins."]},
    {slides: "11", time: "~13 min", show: "La transferencia en el log del Web Engine, y las tablas contadas en PostgreSQL",
     why: "Derby sirve para empezar, pero una instalación real guarda los datos del Web Engine en una base de datos externa. El chart los traslada con un único upgrade.",
     points: ["Dos secrets con las propiedades dbtype y dbdomain, y useExternalDatabase: true en los values.",
              "La transferencia se hace una vez al arrancar el Web Engine y queda registrada: los siguientes upgrades no la repiten.",
              "PostgreSQL necesita el table script de HCL (early release, aún no validado para el Web Engine); si no, Derby u Oracle.",
              "Resultado: unas 465 tablas transferidas."]},
    {slides: "12", time: "~8 min", show: "El botón de IQ en la barra de DX respondiendo «¿Qué bibliotecas de WCM hay?»",
     why: "HCL DX IQ lleva un asistente de IA a DX. Su LLM pasa por LiteLLM y OpenRouter en lugar de AWS Bedrock, así que se puede usar cualquier proveedor.",
     points: ["IQ = el Integrator y su MCP Server (chart hcl-dx-iq 1.0.3), junto a DX.",
              "Los values de IQ: la URL de LiteLLM y los dos modelos; después, un upgrade de DX para que HAProxy enrute el chat de IQ.",
              "Demo: pregunta a IQ por las bibliotecas de WCM, en el portal y desde la terminal. IQ actúa con los permisos del usuario que pregunta."]},
    {slides: "13", time: "~7 min", show: "El Search Center y el explorador de la API de búsqueda",
     why: "Search V2 sustituye la búsqueda clásica del portal por OpenSearch, protegida con TLS mutuo.",
     points: ["hcl-dx-search 2.37.0: OpenSearch, el Search Middleware y el File Processor.",
              "TLS mutuo: una CA del lab y los certificados admin, node y client, creados como secrets.",
              "Un upgrade más de DX activa Search V2; los crawlers indexan WCM, JCR, el portal y DAM cada 15 minutos."]},
  ],
};

const secretNames = cmd => [...new Set([...cmd.matchAll(/create secret (?:generic|tls|docker-registry) ([\w.-]+)/g)].map(m => m[1]))];
// A file without its comment lines, for showing it inline
const compact = text => text.split("\n").filter(l => l.trim() && !/^\s*#/.test(l)).join("\n");

export function buildScript(gen, lang, summaryRows, {mask = true} = {}){
  let t = T[lang] || T.en, st = STAGE[lang] || STAGE.en;
  const names = STAGES[lang] || STAGES.en;
  if (gen.s.LLM_PROVIDER === "bedrock") {   // the texts that name OpenRouter, for an installation with AWS Bedrock
    const R = [["routes them to Claude through OpenRouter", "routes them to Claude on AWS Bedrock"], ["los enruta a Claude a través de OpenRouter", "los enruta a Claude en AWS Bedrock"],
      ["Its LLM goes through LiteLLM and OpenRouter instead of AWS Bedrock, so any provider can be used.", "Its LLM goes through LiteLLM to Claude on AWS Bedrock, the configuration HCL documents."],
      ["Su LLM pasa por LiteLLM y OpenRouter en lugar de AWS Bedrock, así que se puede usar cualquier proveedor.", "Su LLM pasa por LiteLLM hacia Claude en AWS Bedrock, la configuración que documenta HCL."],
      ["the OpenRouter API key", "the Bedrock API key"], ["la clave de API de OpenRouter", "la clave de API de Bedrock"],
      ["delete the OpenRouter key", "delete the Bedrock API key"], ["borra la clave de OpenRouter", "borra la clave de API de Bedrock"],
      ["OpenRouter key", "Bedrock API key"], ["clave de OpenRouter", "clave de API de Bedrock"], ["openrouter.ai", "AWS Bedrock"]];
    const fix = v => typeof v === "string" ? R.reduce((x, [a, b]) => x.split(a).join(b), v) : Array.isArray(v) ? v.map(fix) : typeof v === "function" ? (...x) => fix(v(...x)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)])) : v;
    t = fix(t); st = fix(st);
  }
  const {s, files} = gen, prep = gen.prep || [], demo = gen.demo || gen.steps;
  const values = mask ? secretValues(s) : [];
  const m = x => mask ? maskText(String(x), values) : String(x);
  const md = x => m(String(x).replace(/\*\*|\*|`/g, ""));
  const date = new Date(WEBINAR.date + "T12:00:00Z").toLocaleDateString(t.dateFmt, {day: "numeric", month: "long", year: "numeric"});
  const B = [];
  const shown = new Set();

  const stepBlocks = step => {
    B.push({t: "h3", text: `${step.id} · ${step.title}`, note: step.opt && !/\((optional|opcional)/i.test(step.title) ? t.opt : ""});
    if (step.note) B.push({t: "p", text: md(step.note), tone: "muted"});
    B.push({t: "code", text: m(step.cmd)});
    const sec = secretNames(step.cmd), fl = filesOfStep(step, files);
    if (sec.length || /apply -f \S*secrets\.yaml/.test(step.cmd)) {
      const fromFiles = fl.filter(f => /secret/i.test(f)).flatMap(f => [...files[f].text.matchAll(/^\s*name:\s*([\w.-]+)/gm)].map(x => x[1]));
      B.push({t: "p", text: `${t.secrets}: ${[...new Set([...fromFiles, ...sec])].join(", ")}`, tone: "key"});
    }
    for (const f of fl) {
      if (/secret/i.test(f)) continue;
      const ch = keyChanges(files[f].text);
      if (ch.length) B.push({t: "table", title: `${t.look} · ${f}`, head: [t.used, t.was], rows: ch.slice(0, 20).map(c => [m(c.line), c.was ? m(c.was) : t.newv]), mono: true, widths: [55, 45]});
      if (!shown.has(f) && /\.(ya?ml|properties)$/.test(f)) {
        shown.add(f);
        B.push({t: "code", title: `${t.file} · ${f}`, text: m(compact(files[f].text)).split("\n").slice(0, 60).join("\n"), small: true});
      }
    }
    if (step.manual) B.push({t: "callout", tone: "warn", text: `${t.manual}: ${md(step.manual)}`});
  };

  // Cover
  B.push({t: "cover", title: WEBINAR.title, subtitle: t.docTitle, live: t.live(date), host: `https://${s.DX_HOST}`,
          generated: new Date().toISOString().slice(0, 10), note: mask ? t.masked : t.plain, noteTone: mask ? "ok" : "error"});
  B.push({t: "toc", title: t.toc, note: t.tocNote});

  // Purpose, EUROPESIP, the live session, security
  B.push({t: "h1", text: t.purpose}); t.purposeP.forEach(x => B.push({t: "p", text: x}));
  B.push({t: "h2", text: t.scenario}); B.push({t: "p", text: t.scenarioP}); B.push({t: "bullets", items: t.scenarioL, numbered: true});
  B.push({t: "h1", text: t.who}); t.whoP.forEach(x => B.push({t: "p", text: x}));
  B.push({t: "h1", text: t.session}); B.push({t: "p", text: t.sessionP(date)});
  B.push({t: "h2", text: t.agenda});
  B.push({t: "table", head: t.agendaHead, rows: [0, 1, 2, 3, 4, 5].map(n => [`${n} · ${names[n]}`, st[n].show, st[n].time, st[n].slides]), widths: [30, 46, 10, 14]});
  B.push({t: "p", text: t.agendaNote, tone: "muted"});
  B.push({t: "h1", text: t.security}); t.securityP.forEach((x, i) => B.push(i === 1 ? {t: "callout", tone: "warn", text: x} : {t: "p", text: x}));
  B.push({t: "h1", text: t.start}); B.push({t: "p", text: t.startP});
  B.push({t: "table", head: ["", ""], rows: t.startRows(s), widths: [26, 74], noHead: true});
  B.push({t: "table", head: [lang === "es" ? "Opción" : "Choice", lang === "es" ? "Valor" : "Value"], rows: summaryRows.filter(([, v]) => v).map(([k, v]) => [k, m(v)]), widths: [30, 70]});

  // Phase 1
  B.push({t: "break"}); B.push({t: "h1", text: t.prep}); B.push({t: "p", text: t.prepP});
  B.push({t: "code", text: t.prepCmd});
  prep.forEach(stepBlocks);
  B.push({t: "callout", tone: "ok", text: "✔ " + t.ready});

  // Phase 2
  B.push({t: "break"}); B.push({t: "h1", text: t.demo}); B.push({t: "p", text: t.demoP}); B.push({t: "code", text: t.demoCmd});
  for (let n = 0; n <= 5; n++) {
    const list = demo.filter(x => x.stage === n);
    if (!list.length) continue;
    B.push({t: "break"});
    B.push({t: "h1", text: `${n} · ${names[n]}`});
    B.push({t: "slide", text: `${t.slide(st[n].slides)} · ⏱ ${st[n].time} · ${t.expect}: ${st[n].show}`});
    if (n === 0) B.push({t: "p", text: t.slideNote, tone: "muted"});
    B.push({t: "h2", text: t.why}); B.push({t: "p", text: st[n].why});
    B.push({t: "h2", text: t.tell}); B.push({t: "bullets", items: st[n].points});
    B.push({t: "h2", text: t.steps});
    list.forEach(stepBlocks);
  }

  // Closing and after the webinar
  B.push({t: "break"}); B.push({t: "h1", text: t.close});
  B.push({t: "slide", text: `${t.slide("14-17")}`}); t.closeP.forEach(x => B.push({t: "p", text: x}));
  B.push({t: "h2", text: t.refs}); B.push({t: "bullets", items: t.refsL});
  B.push({t: "h1", text: t.after}); B.push({t: "bullets", items: t.afterL});
  B.push({t: "p", text: `https://${s.DX_HOST}/wps/portal`, tone: "key"});

  // Appendices
  B.push({t: "break"}); B.push({t: "h1", text: t.appA}); B.push({t: "p", text: t.appAP});
  for (const step of [...prep, ...demo].filter(isSecretStep)) { B.push({t: "h3", text: `${step.id} · ${step.title}`}); B.push({t: "code", text: m(step.cmd)}); }
  B.push({t: "p", text: t.litellm}); B.push({t: "code", text: mask ? "********" : gen.litellmKey || ""});
  B.push({t: "break"}); B.push({t: "h1", text: t.appB}); B.push({t: "p", text: t.appBP});
  for (const [path, f] of Object.entries(files)) {
    if (!/\.(ya?ml|properties|ldif|json)$/i.test(path)) continue;
    B.push({t: "h2", text: path});
    const src = sourceOf(f.text); if (src) B.push({t: "p", text: `${t.from}: ${src}`, tone: "muted"});
    B.push({t: "code", text: m(f.text), small: true});
  }
  return {blocks: B, footer: t.footer, page: t.page, title: `${WEBINAR.title} · ${t.docTitle}`, host: s.DX_HOST};
}
