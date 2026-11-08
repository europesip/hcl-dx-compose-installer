// "Use another image registry": the HCL images (and charts) come from the company's own registry (Harbor, Quay,
// Artifactory, Nexus...) instead of hclcr.io, the HCL Harbor. Usual in air-gapped environments, where the security
// team controls and scans every image. The registry must already hold a copy of the HCL images with the same names
// (or proxy / mirror hclcr.io); otherwise the image paths in the custom values must be changed before installing.
//
// The engine (core.js, frozen) always writes hclcr.io: this output layer swaps it. The engine gets the HCL account
// e-mail as HCL_HARBOR_USER (it only decides whether the PostgreSQL table script can be included), and here the
// registry user takes its place in the pull secret and the registry login.

export const altRegistryOn = f => !!f.altRegistry && !!(f.REGISTRY || "").trim();
const hostOf = r => r.replace(/^https?:\/\//, "").split("/")[0];

export function registryForm(f){
  if (!altRegistryOn(f)) return f;
  // HCL_HARBOR_USER for the engine = the HCL e-mail (table script rule); the registry user is put back below
  return {...f, HCL_HARBOR_USER: (f.HCL_EMAIL || "").trim() || (f.REGISTRY_USER || "").trim(), HCL_HARBOR_TOKEN: f.REGISTRY_PASSWORD ?? ""};
}

// Applied to every text of the zip (files, install.sh, RUNBOOK.md)
export function applyRegistry(f, entries){
  if (!altRegistryOn(f)) return entries;
  const reg = f.REGISTRY.trim().replace(/^https?:\/\//, "").replace(/\/+$/, ""), host = hostOf(reg);
  const user = (f.REGISTRY_USER || "").trim(), email = (f.HCL_EMAIL || "").trim();
  return entries.map(e => {
    if (typeof e.text !== "string" || /\.sql$/.test(e.name)) return e;
    let t = e.text;
    // the registry user instead of the HCL e-mail where it is a login (pull secret, helm login, OpenBao)
    if (email && user && email !== user && /secrets\.yaml$|install\.sh$|demo\.sh$|prepare\.sh$|openbao-secrets\.sh$|RUNBOOK\.md$/.test(e.name))
      t = t.replace(new RegExp(`(["'])${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1`, "g"), `$1${user}$1`);
    t = t.replace(/"auths":\{"hclcr\.io":/g, `"auths":{"${host}":`)                         // pull secret
         .replace(/helm registry login hclcr\.io/g, `helm registry login ${host}`)
         .replace(/oci:\/\/hclcr\.io\//g, `oci://${reg}/`)                                  // HCL charts
         .replace(/^(\s*repository:\s*)"hclcr\.io"/gm, `$1"${reg}"`)                         // images of DX, IQ, Search
         .replace(/HCL charts from hclcr\.io/g, `HCL charts from ${reg}`).replace(/Charts de HCL desde hclcr\.io/g, `Charts de HCL desde ${reg}`)
         .replace(/pull secret for hclcr\.io/g, `pull secret for ${host}`)
         .replace(/'HCL Harbor CLI secret'/g, `'password or token of ${host}'`).replace(/\(HCL Harbor CLI secret\)/g, `(password or token of ${host})`);
    if (!user) t = t.replace(new RegExp(`helm registry login ${host.replace(/\./g, "\\.")} [^\\n]*`, "g"), `true   # ${host}: anonymous access, no registry login`);
    return t === e.text ? e : {...e, text: t};
  });
}

export const REGISTRY_NOTE = {
  en: "> 🗄️ **Your own image registry:** the HCL images and charts come from `REG` instead of hclcr.io. It must already hold a copy of every image the installation needs, with the same names and paths as in hclcr.io (or proxy / mirror hclcr.io). Otherwise change the `image` paths in the custom values before running `install.sh`, or the pods will not start (ImagePullBackOff). The third-party images (OpenLDAP, PostgreSQL, LiteLLM...) still come from their public registries unless you mirror them too.",
  es: "> 🗄️ **Tu propio repositorio de imágenes:** las imágenes y los charts de HCL vienen de `REG` en lugar de hclcr.io. Debe tener ya una copia de todas las imágenes que necesita la instalación, con los mismos nombres y rutas que en hclcr.io (o hacer de proxy / mirror de hclcr.io). Si no, cambia las rutas `image` de los custom values antes de ejecutar `install.sh`, o los pods no arrancarán (ImagePullBackOff). Las imágenes de terceros (OpenLDAP, PostgreSQL, LiteLLM...) siguen viniendo de sus registros públicos salvo que también las repliques.",
};
