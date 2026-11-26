// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
// The directory of DX (#52): the OpenLDAP of the labs with demo users (default), a corporate LDAP that already exists,
// or Microsoft Active Directory. Output layer: the engine (core.js, frozen) still gets dir "ad" for an existing
// directory (its stage 2 slot: one helm upgrade with the directory layer) or "none" in the basic preset, and this module
// rewrites what it produces:
//   - lab-directory/custom-values.directory.yaml: the NATIVE LDAP block of the hcl-dx-deployment chart
//     (configuration.webEngine.ldap, type other, serverType Custom or Microsoft Active Directory), the bind account in
//     a Secret (customLdapSecret: bindUser / bindPassword), LDAPS with the CA of the directory (customTruststoreSecrets)
//     and, only when the directory is not shaped like the chart expects (uid, inetOrgPerson, groupOfUniqueNames), a
//     configuration override that extends the registry the chart generates (same id, "ldap"): filters, object classes,
//     search bases, the login attribute;
//   - the bind password is never written in the folder: install.sh asks for it (or reads DIR_BIND_PASSWORD) and makes
//     the Secret; with the secrets manager it comes from OpenBao (dx/<DX_NS>/ad bindPassword); or the Secret exists
//     already (DIR_BIND_SECRET, e.g. made by an ExternalSecret);
//   - a connection test before DX: ldapsearch from a temporary pod with the same Secret and CA DX will use;
//   - the Administrator role (virtual resource PORTAL) for the admin group of the directory, with XMLAccess;
//   - Keycloak (src/cicd.js) federates the same directory (read-only, vendor "ad" for Active Directory);
//   - ÓRBITA: its demo roles are not given to users of your directory unless you say so (ORBITA_DEMO_PEOPLE).
// No OpenLDAP is installed. The basic preset (src/basic.js, headless) gets the same block inside lab-base (one install).

export const EXT_DIRS = ["ldap", "ad"];
// Every decision is a default that can be changed: the DIR_* keys of the form (src/state.js) override these
export const DIR_DEFAULTS = {
  ldap: {login: "uid", userClass: "inetOrgPerson", groupClass: "groupOfUniqueNames", member: "uniqueMember", serverType: "Custom",
         kcVendor: "other", kcRdn: "uid", kcUuid: "entryUUID"},
  ad:   {login: "sAMAccountName", userClass: "user", groupClass: "group", member: "member", serverType: "Microsoft Active Directory",
         kcVendor: "ad", kcRdn: "cn", kcUuid: "objectGUID"},
};
export const LOGIN_ATTRS = ["uid", "mail", "sAMAccountName", "userPrincipalName"];
export const BIND_SECRET = "dx-ldap-bind", CA_SECRET = "dx-directory-ca", KC_BIND_SECRET = "keycloak-ldap-bind";
export const TEST_IMAGE = "docker.io/jpgouin/openldap:2.6.9-fix";   // the image of the lab OpenLDAP (openldap-stack-ha 4.3.3): it has ldapsearch
export const DIR = "lab-directory";
export const VALUES = `${DIR}/custom-values.directory.yaml`;
// ÓRBITA (hcl-dx-orbita): the roles of its demo story and the lab users that play them by default
const ORBITA_ROLES = ["rrhh", "ventas-responsable", "ventas-1", "ventas-2", "tecnologia-responsable", "tecnologia-1", "tecnologia-2", "tecnologia-3", "administracion"];
const ORBITA_LAB = ["rrhh", "ventas-responsable", "ventas-1", "ventas-2", "tecnologia-responsable", "tecnologia-1", "administracion"];

const tr = v => String(v ?? "").trim();
const isBasic = f => f.preset === "basic";

/** The directory chosen in the form: null (OpenLDAP of the labs, or none) or the settings of an existing directory. */
export function dirConfig(f){
  // Backward compatibility: the basic preset (#35) with BASIC_LDAP_*, the Active Directory of the wizard with AD_*
  const legacy = isBasic(f) && tr(f.BASIC_LDAP_HOST) && !tr(f.DIR_HOST) && f.dir !== "ad" ? "basic" : "";
  const kind = EXT_DIRS.includes(f.dir) ? f.dir : legacy ? "ldap" : null;
  if (!kind) return null;
  const D = DIR_DEFAULTS[kind], ad = kind === "ad";
  const pick = (k, ...old) => tr(f[k]) || old.map(tr).find(Boolean) || "";
  const fromAd = ad && !tr(f.DIR_HOST);
  const host = pick("DIR_HOST", legacy ? f.BASIC_LDAP_HOST : "", fromAd ? f.AD_HOST : "");
  const portIn = pick("DIR_PORT", legacy ? f.BASIC_LDAP_PORT : "", fromAd ? f.AD_PORT : "");
  // LDAPS by default (DIR_SSL); the settings from before #52 had only a port: LDAPS when it is 636
  const ssl = legacy || (fromAd && tr(f.AD_HOST)) ? portIn === "636" : f.DIR_SSL !== false;
  const base = pick("DIR_BASE_DN", legacy ? f.BASIC_LDAP_SUFFIX : "", fromAd ? f.AD_BASE_DN : "");
  const existing = pick("DIR_BIND_SECRET", legacy ? (f.BASIC_LDAP_SECRET || BIND_SECRET) : "");
  const login = pick("DIR_LOGIN_ATTR") || D.login;
  return {kind, ad, legacy, basic: isBasic(f), host, ssl, port: Number(portIn || (ssl ? 636 : 389)), base,
    users: pick("DIR_USER_BASE") || base, groups: pick("DIR_GROUP_BASE") || base,
    bindDn: pick("DIR_BIND_DN", fromAd ? f.AD_BIND_USER : ""), existingSecret: existing, secret: existing || BIND_SECRET,
    login, userClass: pick("DIR_USER_CLASS") || D.userClass, groupClass: pick("DIR_GROUP_CLASS") || D.groupClass,
    member: pick("DIR_MEMBER_ATTR") || D.member, admin: pick("DIR_ADMIN_GROUP"),
    caFile: pick("DIR_CA_FILE", fromAd ? f.AD_CA_FILE : ""), caSecret: pick("DIR_CA_SECRET"),
    image: pick("DIR_TEST_IMAGE") || TEST_IMAGE, orbitaPeople: tr(f.ORBITA_DEMO_PEOPLE),
    serverType: D.serverType, kcVendor: D.kcVendor, kcRdn: D.kcRdn, kcUuid: D.kcUuid};
}
// The Secret with the CA (an existing one, or the one install.sh makes from DIR_CA_FILE); "" = no CA (plain LDAP, or
// LDAPS with a certificate the JVM already trusts)
export const caSecretOf = c => c.ssl ? (c.caSecret || (c.caFile ? CA_SECRET : "")) : "";
// The attribute DX keeps as the short name of the user (uid): the login attribute, except for the e-mail, which is
// added as a second login property on top of the usual one
const primaryOf = c => c.login === "mail" ? DIR_DEFAULTS[c.kind].login : c.login;

const DN = /^[A-Za-z][\w-]*=[^"\\\n]+$/, HOST = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i, ATTR = /^[A-Za-z][\w-]{0,63}$/, K8S = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;
/** What is missing or wrong in the settings of an existing directory (messages for the wizard and headless). */
export function dirErrors(c, lang = "en"){
  if (!c) return [];
  const es = lang === "es", E = (en, sp) => es ? sp : en, err = [];
  if (!HOST.test(c.host)) err.push(E("Directory: enter the host name of your LDAP / Active Directory (DIR_HOST).", "Directorio: indica el nombre del servidor de tu LDAP / Active Directory (DIR_HOST)."));
  if (!(c.port > 0 && c.port < 65536)) err.push(E("Directory: the port must be a number (DIR_PORT).", "Directorio: el puerto debe ser un número (DIR_PORT)."));
  if (!DN.test(c.base)) err.push(E("Directory: enter the base DN (DIR_BASE_DN), e.g. dc=example,dc=com.", "Directorio: indica el DN base (DIR_BASE_DN), p. ej. dc=example,dc=com."));
  for (const [k, v] of [["DIR_USER_BASE", c.users], ["DIR_GROUP_BASE", c.groups]]) if (!DN.test(v)) err.push(E(`Directory: ${k} must be a DN.`, `Directorio: ${k} debe ser un DN.`));
  if (c.admin && !DN.test(c.admin)) err.push(E("Directory: the admin group must be a DN (DIR_ADMIN_GROUP), e.g. cn=dxadmins,ou=groups,dc=example,dc=com.", "Directorio: el grupo de administradores debe ser un DN (DIR_ADMIN_GROUP), p. ej. cn=dxadmins,ou=groups,dc=example,dc=com."));
  if (!c.existingSecret && !(DN.test(c.bindDn) || /^[^\s"\\@]+@[^\s"\\@]+$/.test(c.bindDn)))
    err.push(E("Directory: enter the bind account (DIR_BIND_DN, a DN or user@domain), or the name of a Secret that already has it (DIR_BIND_SECRET).", "Directorio: indica la cuenta de bind (DIR_BIND_DN, un DN o usuario@dominio), o el nombre de un Secret que ya la tenga (DIR_BIND_SECRET)."));
  if (c.existingSecret && !K8S.test(c.existingSecret)) err.push(E("Directory: DIR_BIND_SECRET must be a Secret name.", "Directorio: DIR_BIND_SECRET debe ser el nombre de un Secret."));
  if (c.caSecret && !K8S.test(c.caSecret)) err.push(E("Directory: DIR_CA_SECRET must be a Secret name.", "Directorio: DIR_CA_SECRET debe ser el nombre de un Secret."));
  for (const [k, v] of [["DIR_LOGIN_ATTR", c.login], ["DIR_USER_CLASS", c.userClass], ["DIR_GROUP_CLASS", c.groupClass], ["DIR_MEMBER_ATTR", c.member]])
    if (!ATTR.test(v)) err.push(E(`Directory: ${k} must be an LDAP attribute or object class name.`, `Directorio: ${k} debe ser el nombre de un atributo o clase de objeto LDAP.`));
  if (/['"\\\s]/.test(c.image)) err.push(E("Directory: DIR_TEST_IMAGE must be an image reference.", "Directorio: DIR_TEST_IMAGE debe ser una referencia de imagen."));
  if (c.orbitaPeople) { const e = orbitaPeopleError(c.orbitaPeople); if (e) err.push("ORBITA_DEMO_PEOPLE: " + e); }
  return err;
}
export function dirWarnings(c, lang = "en"){
  if (!c) return [];
  const es = lang === "es", w = [];
  if (c.ssl && !caSecretOf(c)) w.push(es ? "Directorio: LDAPS sin CA (DIR_CA_FILE o DIR_CA_SECRET): el certificado del directorio debe estar firmado por una CA en la que ya confíe Java."
    : "Directory: LDAPS without a CA (DIR_CA_FILE or DIR_CA_SECRET): the certificate of the directory must be signed by a CA Java already trusts.");
  if (!c.ssl && !/\.svc(\.cluster\.local)?$/.test(c.host)) w.push(es ? "Directorio: LDAP sin cifrar (puerto 389) hacia un servidor fuera del clúster: la contraseña de cada usuario viaja en claro. Usa LDAPS (636) con la CA del directorio."
    : "Directory: plain LDAP (port 389) to a server outside the cluster: the password of every user travels in clear. Use LDAPS (636) with the CA of the directory.");
  if (!c.admin) w.push(es ? "Directorio: sin grupo de administradores (DIR_ADMIN_GROUP), nadie del directorio recibe el rol Administrator; wpsadmin sigue entrando."
    : "Directory: without an admin group (DIR_ADMIN_GROUP) nobody of the directory gets the Administrator role; wpsadmin still signs in.");
  return w;
}
function orbitaPeopleError(json){
  let o; try { o = JSON.parse(json); } catch { return "not valid JSON"; }
  if (!o || typeof o !== "object" || Array.isArray(o)) return "must be an object {\"role\": {\"uid\": \"...\"}}";
  for (const [r, v] of Object.entries(o)) {
    if (!ORBITA_ROLES.includes(r)) return `unknown role ${r} (${ORBITA_ROLES.join(", ")})`;
    if (!v || typeof v !== "object" || !/^[A-Za-z0-9._@-]{1,64}$/.test(v.uid || "")) return `role ${r} needs a uid`;
  }
  return "";
}

// ---------------------------------------------------------------------------------------------------------
// The DX layer: configuration.webEngine of the chart
// ---------------------------------------------------------------------------------------------------------
const xa = v => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const PREFERRED = `      preferred-language.xml: |
        <server description="DX Web Engine - preferredLanguage of the users">
          <wplc-add-property>
            <resource propertyName="preferredLanguage" dataType="String" entityTypes="PersonAccount" multiValued="false"/>
          </wplc-add-property>
        </server>
`;
// The configuration override, only for what differs from the registry the chart generates (filters for uid,
// inetOrgPerson and groupOfUniqueNames, searches from the base DN, login by uid)
export function registryOverride(c){
  const p = primaryOf(c), D = DIR_DEFAULTS.ldap;
  const filters = c.ad || p !== "uid" || c.userClass !== D.userClass || c.groupClass !== D.groupClass || c.member !== D.member;
  const bases = c.users !== c.base || c.groups !== c.base;
  const logins = c.login === "mail" ? ["uid", "mail"] : p !== "uid" ? ["uid"] : [];
  if (!filters && !bases && !logins.length) return "";
  const person = c.ad ? `(objectcategory=person)(objectclass=${c.userClass})` : `(objectclass=${c.userClass})`;
  const f = {userFilter: `(&(${p}=%v)${person})`, groupFilter: `(&(cn=%v)(objectclass=${c.groupClass}))`, userIdMap: `*:${p}`, groupIdMap: "*:cn",
    groupMemberIdMap: c.ad ? `memberOf:${c.member}` : `${c.groupClass}:${c.member}`};
  const fl = el => [`    <${el}`, ...Object.entries(f).map(([k, v], i, a) => `        ${k}="${xa(v)}"${i === a.length - 1 ? "/>" : ""}`)];
  const X = [`<server description="DX Web Engine - your ${c.ad ? "Active Directory" : "directory"}: ${[filters && "filters and object classes", bases && "search bases", logins.length && "login attribute"].filter(Boolean).join(", ")}">`,
    "  <!-- Extends the LDAP registry the chart generates (same id, \"ldap\"): Liberty merges both definitions -->",
    `  <ldapRegistry id="ldap"${c.ad ? ' referral="ignore"' : ""}>`];
  if (filters) {
    X.push(...fl("customFilters"));
    if (c.ad) X.push("    <!-- the same filters for the Active Directory type of Liberty -->", ...fl("activedFilters"));
  }
  if (p !== "uid") X.push("    <!-- the same two attributes as the chart, then the login attribute as the short name (uid) of DX -->",
    "    <attributeConfiguration>",
    '      <attribute name="mail" propertyName="ibm-primaryEmail" entityType="PersonAccount"/>',
    '      <attribute name="title" propertyName="ibm-jobTitle" entityType="PersonAccount"/>',
    `      <attribute name="${xa(p)}" propertyName="uid" entityType="PersonAccount"/>`,
    "    </attributeConfiguration>");
  if (filters || bases) X.push(
    `    <ldapEntityType name="PersonAccount">`, `      <objectClass>${xa(c.userClass)}</objectClass>`, `      <searchBase>${xa(c.users)}</searchBase>`, "    </ldapEntityType>",
    `    <ldapEntityType name="Group">`, `      <objectClass>${xa(c.groupClass)}</objectClass>`, `      <searchBase>${xa(c.groups)}</searchBase>`, "    </ldapEntityType>");
  if (filters) X.push("    <groupProperties>", `      <memberAttribute name="${xa(c.member)}" scope="direct" objectClass="${xa(c.groupClass)}"/>`,
    ...(c.ad ? ['      <membershipAttribute name="memberOf" scope="direct"/>'] : []), "    </groupProperties>");
  for (const l of logins) X.push(`    <loginProperty name="${l}"/>`);
  X.push("  </ldapRegistry>", "</server>");
  return X.join("\n");
}

/** configuration.webEngine for an existing directory (two spaces of indentation: it goes under "configuration:"). */
export function ldapValues(c, {head = ""} = {}){
  const ca = caSecretOf(c), ov = registryOverride(c);
  const secretNote = c.existingSecret ? "bindUser / bindPassword, already in the namespace" : "bindUser / bindPassword, made by install.sh (the password is never in this folder)";
  return `${head}  webEngine:
    ldap:
      type: "other"
      host: "${c.host}"
      port: ${c.port}
      sslEnabled: ${c.ssl}
      suffix: "${c.base}"
      serverType: "${c.serverType}"
      id: "dx_ldap"
      customLdapSecret: "${c.secret}"   # ${secretNote}
${ca ? `    # LDAPS: Liberty trusts the CA of the directory (otherwise "PKIX path building failed" and nobody signs in)
    customTruststoreSecrets:
      directory-ca: "${ca}"
` : ""}    configOverrideFiles:
${ov ? `      directory-registry.xml: |\n${ov.split("\n").map(l => "        " + l).join("\n")}\n` : ""}${PREFERRED}`;
}

function valuesFile(c){
  const what = c.ad ? "Microsoft Active Directory" : "your LDAP directory";
  return `# ${DIR} · DX layer: authentication against ${what} (${c.host}:${c.port}${c.ssl ? ", LDAPS" : ""}), with the NATIVE LDAP
# block of the hcl-dx-deployment chart (type other, serverType ${c.serverType}). wpsadmin (basic registry) still works.
# Generated by the DX Installer Wizard (#52). Every value comes from the DIR_* settings of the wizard:
#   login attribute ${c.login} · users ${c.userClass} under ${c.users} · groups ${c.groupClass} (${c.member}) under ${c.groups}
# The chart generates its LDAP registry for OpenLDAP (uid, inetOrgPerson, groupOfUniqueNames): directory-registry.xml,
# when present, extends it (same id "ldap") with the filters, object classes and search bases of your directory.
# preferredLanguage: the language of each user (DX Compose > Adding custom attributes, wplc-add-property).

configuration:
${ldapValues(c)}`;
}

function adminRoleXml(c){
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${DIR} · gives the Administrator role on the virtual resource PORTAL to the admin group of your directory -->
<request xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="PortalConfig_8.5.0.xsd" type="update">
  <portal action="locate">
    <virtual-resource action="update" name="PORTAL">
      <access-control externalized="false" owner="undefined" private="false">
        <role actionset="Administrator" update="set">
          <mapping subjectid="${xa(c.admin)}" subjecttype="user_group" update="set"/>
        </role>
      </access-control>
    </virtual-resource>
  </portal>
</request>
`;
}

// The connection test: a pod with ldapsearch, the same bind Secret and CA as DX. It binds, reads the base DN, counts
// a few users with the login attribute and reads the admin group. It never writes anything.
function testPod(c, s){
  const ca = caSecretOf(c), url = `${c.ssl ? "ldaps" : "ldap"}://${c.host}:${c.port}`, q = v => `"${String(v).replace(/["\\]/g, "\\$&")}"`;
  const env = [["LDAP_URL", url], ["BASE_DN", c.base], ["USER_BASE", c.users], ["USER_FILTER", `(objectClass=${c.userClass})`], ["LOGIN_ATTR", primaryOf(c)],
    ["ADMIN_GROUP", c.admin], ...(ca ? [["LDAPTLS_CACERT", "/ca/ca-bundle.crt"]] : [])];
  return `# ${DIR} · connection test of your directory, before DX (install.sh, stage 0). Run once and deleted.
# ldapsearch (image ${c.image}, the one of the lab OpenLDAP; DIR_TEST_IMAGE to use another one) binds with the same
# Secret (${c.secret}) and CA as DX, reads the base DN, a few users with the login attribute, and the admin group.
# Read-only: nothing is written in the directory.
apiVersion: v1
kind: Pod
metadata:
  name: dx-ldap-test
  namespace: ${s.DX_NS}
  labels:
    app.kubernetes.io/name: dx-ldap-test
    app.kubernetes.io/part-of: dx-installer
spec:
  restartPolicy: Never
  automountServiceAccountToken: false
  securityContext:
    runAsNonRoot: true
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: ldapsearch
      image: ${c.image}
      command: ["/bin/bash", "-c"]
      args:
        - |
          set -u
${ca ? "          cat /ca-in/* > /ca/ca-bundle.crt   # every certificate of the CA Secret\n" : ""}          s() { ldapsearch -x -LLL -o nettimeout=15 -H "$LDAP_URL" -D "$BIND_USER" -y /bind/bindPassword "$@"; }
          echo "1 · bind as $BIND_USER and read $BASE_DN ($LDAP_URL)"
          s -b "$BASE_DN" -s base dn || { echo "FAIL: bind or base DN (host, port, LDAPS/CA, bind DN, password)"; exit 1; }
          echo "2 · up to 3 users $USER_FILTER under $USER_BASE, with $LOGIN_ATTR"
          s -b "$USER_BASE" -z 3 "$USER_FILTER" "$LOGIN_ATTR"; rc=$?
          [ $rc = 0 ] || [ $rc = 4 ] || { echo "FAIL: user search (rc $rc)"; exit 1; }   # 4 = size limit: more than 3 users
          if [ -n "$ADMIN_GROUP" ]; then
            echo "3 · the admin group $ADMIN_GROUP"
            s -b "$ADMIN_GROUP" -s base dn || { echo "FAIL: admin group not found"; exit 1; }
          fi
          echo "OK: DX can use this directory"
      env:
        - name: BIND_USER
          valueFrom: { secretKeyRef: { name: ${c.secret}, key: bindUser } }
${env.map(([k, v]) => `        - { name: ${k}, value: ${q(v)} }`).join("\n")}
      volumeMounts:
        - { name: bind, mountPath: /bind, readOnly: true }
${ca ? "        - { name: ca-in, mountPath: /ca-in, readOnly: true }\n        - { name: ca, mountPath: /ca }\n" : ""}      securityContext:
        allowPrivilegeEscalation: false
        capabilities: { drop: [ALL] }
      resources:
        requests: { cpu: 10m, memory: 32Mi }
        limits: { memory: 128Mi }
  volumes:
    - name: bind
      secret: { secretName: ${c.secret}, items: [{ key: bindPassword, path: bindPassword }] }
${ca ? `    - name: ca-in\n      secret: { secretName: ${ca} }\n    - name: ca\n      emptyDir: {}\n` : ""}`;
}

// ---------------------------------------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------------------------------------
const KAPPLY = "--dry-run=client -o yaml | kubectl apply -f -";
const sq = v => "'" + String(v).replace(/'/g, "'\\''") + "'";
function secretStep(c, s, lang, {vault, keycloak}){
  const es = lang === "es", t = (en, sp) => es ? sp : en, ns = s.DX_NS, sh = s.SHARED_NS, ca = caSecretOf(c);
  const L = [];
  if (c.existingSecret) L.push(`kubectl -n ${ns} get secret ${c.secret} >/dev/null || { echo "The Secret ${c.secret} (bindUser, bindPassword) must already exist in ${ns} (DIR_BIND_SECRET)" >&2; exit 1; }`);
  else if (vault) L.push(`kubectl apply -f ${DIR}/secrets.yaml`);
  else L.push(`# The password of the bind account is never written in this folder: DIR_BIND_PASSWORD, or asked here (hidden input).
# An existing Secret is kept (resume, reinstall) unless DIR_BIND_PASSWORD is set.
if [ -n "\${DIR_BIND_PASSWORD:-}" ] || ! kubectl -n ${ns} get secret ${c.secret} >/dev/null 2>&1; then
  if [ -z "\${DIR_BIND_PASSWORD:-}" ]; then
    { : </dev/tty; } 2>/dev/null || { echo "No terminal to ask for it: export DIR_BIND_PASSWORD (password of ${c.bindDn.replace(/["`$\\]/g, "")})" >&2; exit 1; }
    read -r -s -p "  Password of the bind account ${c.bindDn.replace(/["`$\\]/g, "")}: " DIR_BIND_PASSWORD </dev/tty; echo
  fi
  printf '%s' "$DIR_BIND_PASSWORD" | kubectl -n ${ns} create secret generic ${c.secret} --from-literal=bindUser=${sq(c.bindDn)} \\
    --from-file=bindPassword=/dev/stdin ${KAPPLY}
fi`);
  if (ca && c.caSecret) for (const n of keycloak ? [ns, sh] : [ns])
    L.push(`kubectl -n ${n} get secret ${c.caSecret} >/dev/null || { echo "The Secret ${c.caSecret} with the CA of the directory must already exist in ${n} (DIR_CA_SECRET)" >&2; exit 1; }`);
  else if (ca) for (const n of keycloak ? [ns, sh] : [ns])
    L.push(`kubectl -n ${n} create secret generic ${CA_SECRET} --from-file=directory-ca.crt=${sq(c.caFile)} ${KAPPLY}`);
  if (keycloak) L.push(`# Keycloak (namespace ${sh}) federates the same directory: a copy of the bind account for its realm import
B_U=$(kubectl -n ${ns} get secret ${c.secret} -o jsonpath='{.data.bindUser}'); B_P=$(kubectl -n ${ns} get secret ${c.secret} -o jsonpath='{.data.bindPassword}')
printf 'apiVersion: v1\\nkind: Secret\\nmetadata:\\n  name: ${KC_BIND_SECRET}\\n  namespace: ${sh}\\ntype: Opaque\\ndata:\\n  bindUser: %s\\n  bindPassword: %s\\n' "$B_U" "$B_P" | kubectl apply -f -
unset B_U B_P`);
  return {lab: "", id: "DIR-1", stageAs: 0, opt: false, manual: "",
    title: t(`Your directory: the bind account${ca ? " and the CA" : ""} (${c.host})`, `Tu directorio: la cuenta de bind${ca ? " y la CA" : ""} (${c.host})`),
    note: c.existingSecret ? t(`The Secret ${c.secret} already exists in ${ns} (bindUser, bindPassword).`, `El Secret ${c.secret} ya existe en ${ns} (bindUser, bindPassword).`)
      : vault ? t("The bind password comes from OpenBao (dx/" + ns + "/ad bindPassword): External Secrets Operator creates the Secret.", "La contraseña de bind viene de OpenBao (dx/" + ns + "/ad bindPassword): External Secrets Operator crea el Secret.")
      : t("The Secret with the bind account of DX. The password is asked here (or DIR_BIND_PASSWORD): it is never written in this folder.", "El Secret con la cuenta de bind de DX. La contraseña se pide aquí (o DIR_BIND_PASSWORD): nunca se escribe en esta carpeta."),
    cmd: L.join("\n")};
}
function testStep(c, s, lang){
  const es = lang === "es", t = (en, sp) => es ? sp : en, ns = s.DX_NS;
  return {lab: "", id: "DIR-2", stageAs: 0, opt: false, manual: "",
    title: t("Check the connection to your directory (ldapsearch from a temporary pod)", "Comprobar la conexión con tu directorio (ldapsearch desde un pod temporal)"),
    note: t("Before DX: the same Secret and CA DX will use. If it fails, fix the host, port, LDAPS/CA, bind DN or password and resume from this step.",
            "Antes de DX: el mismo Secret y la misma CA que usará DX. Si falla, corrige el servidor, el puerto, LDAPS/CA, el DN de bind o la contraseña y continúa desde este paso."),
    cmd: `kubectl -n ${ns} delete pod dx-ldap-test --ignore-not-found --wait=true >/dev/null
kubectl apply -f ${DIR}/ldap-test-pod.yaml
P=; for i in $(seq 1 60); do P=$(kubectl -n ${ns} get pod dx-ldap-test -o jsonpath='{.status.phase}' 2>/dev/null || true); case "$P" in Succeeded|Failed) break ;; esac; sleep 3; done
kubectl -n ${ns} logs dx-ldap-test 2>/dev/null || kubectl -n ${ns} describe pod dx-ldap-test | tail -15
kubectl -n ${ns} delete pod dx-ldap-test --ignore-not-found >/dev/null
[ "$P" = Succeeded ] || { echo "The directory test failed (pod phase: \${P:-not started}): see above" >&2; exit 1; }`};
}
function adminStep(c, s, lang, stageAs){
  const es = lang === "es", t = (en, sp) => es ? sp : en;
  return {lab: "", id: "DIR-3", stageAs, opt: false, manual: "",
    title: t("Administrator role for the admin group of your directory (XMLAccess)", "Rol Administrator para el grupo de administradores de tu directorio (XMLAccess)"),
    note: t(`XMLAccess gives the Administrator role, on the virtual resource PORTAL, to ${c.admin}. The same can be done in the Resource Permissions page.`,
            `XMLAccess da el rol Administrator, sobre el recurso virtual PORTAL, a ${c.admin}. Lo mismo se puede hacer en la página Resource Permissions.`),
    cmd: `WPS_PW=$(kubectl -n ${s.DX_NS} get secret web-engine-secret -o jsonpath='{.data.password}' | base64 -d)
curl -sk -u "wpsadmin:$WPS_PW" -H 'Content-Type: text/xml' --data-binary @${DIR}/admin-role.xml \\
  https://${s.DX_HOST}/wps/config | grep -o '<status[^>]*>'`};
}
const adminManual = (c, lang) => c.admin ? "" : lang === "es"
  ? "Da el rol **Administrator** al grupo de administradores de tu directorio: portal como wpsadmin → *Administration → Access → Resource Permissions → Virtual Resources → PORTAL* (o indica DIR_ADMIN_GROUP en el asistente)."
  : "Give the **Administrator** role to the admin group of your directory: portal as wpsadmin → *Administration → Access → Resource Permissions → Virtual Resources → PORTAL* (or set DIR_ADMIN_GROUP in the wizard).";

// ÓRBITA: its demo story is written by roles played by DX users (demo.people). With your own directory the lab
// users (andres, macarena...) must not be mapped to real people with the same uid: every role keeps the fictitious
// user of ÓRBITA, HR is wpsadmin, unless ORBITA_DEMO_PEOPLE says who plays each role.
function orbitaArgs(c){
  const given = c.orbitaPeople ? JSON.parse(c.orbitaPeople) : {};
  const nulls = ORBITA_LAB.filter(r => !given[r] && r !== "rrhh").map(r => `demo.people.${r}=null`);
  const out = [`--set ${nulls.join(",")}`];
  if (!given.rrhh) out.push("--set demo.people.rrhh.uid=wpsadmin");
  if (Object.keys(given).length) out.push(`--set-json ${sq("demo.people=" + JSON.stringify(given))}`);
  return out.join(" \\\n  ");
}

/** Files and steps of an existing directory (before applyCicd: it turns secrets.yaml into ExternalSecrets). */
export function applyDirectory(form, s, files, steps, lang, {vault = false, keycloak = false} = {}){
  const c = s.dirExt; if (!c) return {files, steps};
  const F = {...files}, es = lang === "es";
  F[`${DIR}/ldap-test-pod.yaml`] = {text: testPod(c, s)};
  if (c.admin) F[`${DIR}/admin-role.xml`] = {text: adminRoleXml(c)};
  let out = steps.map(st => ({...st}));
  const at = id => out.findIndex(x => x.id === id);
  const after = (id, ...add) => { const i = at(id); out.splice(i < 0 ? 0 : i + 1, 0, ...add); };
  const pre = [secretStep(c, s, lang, {vault, keycloak}), testStep(c, s, lang)];
  if (c.basic) {   // the basic preset: one install with the block in lab-base (src/basic.js), no stage 2
    const k = "lab-base/custom-values.yaml";
    if (F[k]) F[k] = {...F[k], text: F[k].text.replace(/^configuration:\n/m, "configuration:\n" + ldapValues(c, {head:
      `  # basic preset: an LDAP that already exists (${c.legacy ? "BASIC_LDAP_HOST" : "DIR_HOST"}); wpsadmin (basic registry) still works\n`}))};
    after(at("D-CA") >= 0 ? "D-CA" : "D-1", ...pre);
    if (c.admin) after("1-5", adminStep(c, s, lang, 1));
    return {files: F, steps: out};
  }
  // The engine slot of Active Directory (dir "ad"): its files and steps become the ones of the existing directory
  for (const k of Object.keys(F)) if (k.startsWith(`${DIR}/`) && /secrets\.yaml$|custom-values\.ad\.yaml$/.test(k)) delete F[k];
  F[VALUES] = {text: valuesFile(c)};
  if (vault && !c.existingSecret) F[`${DIR}/secrets.yaml`] = {text: `# ${DIR} secret: the bind account of your directory (bindUser, bindPassword), for the native LDAP block of DX
---
apiVersion: v1
kind: Secret
metadata:
  name: ${c.secret}
  namespace: ${s.DX_NS}
type: Opaque
stringData:
  bindUser: '${c.bindDn.replace(/'/g, "''")}'
  bindPassword: '@@OB:ad:bindPassword@@'
`, mode: 0o100600};
  out = out.filter(st => st.id !== "AD-1").map(st => {
    if (typeof st.cmd === "string") st.cmd = st.cmd.split(`${DIR}/custom-values.ad.yaml`).join(VALUES);
    if (st.id === "AD-2") Object.assign(st, {title: es ? `Conectar DX a ${c.ad ? "tu Active Directory" : "tu directorio LDAP"} (~5 min)` : `Connect DX to ${c.ad ? "your Active Directory" : "your LDAP directory"} (~5 min)`,
      note: es ? "La capa del directorio (bloque LDAP nativo del chart) en DX. No se instala ningún OpenLDAP." : "The directory layer (native LDAP block of the chart) in DX. No OpenLDAP is installed.", manual: adminManual(c, lang)});
    if (/helm upgrade --install orbita /.test(st.cmd || "")) st.cmd = st.cmd.replace(/(--set dx\.host=\S+ --set dx\.caSecret=\S+) \\\n/, (m, a) => `${a} \\\n  ${orbitaArgs(c)} \\\n`);
    if (/j_username=macarena|"username":"macarena"/.test(st.cmd || "")) {   // the IQ question about ÓRBITA: as wpsadmin (HR), not a lab user
      st.cmd = st.cmd.replace(/macarena/g, "wpsadmin");
      if (s.DEMO_PASSWORD && s.DEMO_PASSWORD !== s.LAB_PASSWORD) st.cmd = st.cmd.split(s.DEMO_PASSWORD).join(s.LAB_PASSWORD);
      st.title = st.title.replace(/macarena/g, "wpsadmin");
    }
    if (/macarena, andres/.test(st.manual || "")) st.manual = es ? `Entra como wpsadmin (RR. HH. de la demo) o con los usuarios de ORBITA_DEMO_PEOPLE y abre https://${s.DX_HOST}/wps/myportal/Home/mi-intranet.`
      : `Sign in as wpsadmin (HR of the demo) or as the users of ORBITA_DEMO_PEOPLE and open https://${s.DX_HOST}/wps/myportal/Home/mi-intranet.`;
    return st;
  });
  after(at("D-CA") >= 0 ? "D-CA" : "D-1", ...pre);
  if (c.admin) after("AD-2", adminStep(c, s, lang, 2));
  return {files: F, steps: out};
}

/** One line for BUILD-INFO.txt */
export function directoryInfo(s){
  const c = s.dirExt;
  if (c) return `${c.ad ? "Active Directory" : "existing LDAP"} ${c.host}:${c.port}${c.ssl ? " (LDAPS)" : ""} · login ${c.login} · admin group ${c.admin ? "set" : "none"} · no OpenLDAP installed`;
  return s.dir === "openldap" ? "OpenLDAP (demo users)" : "none (only wpsadmin)";
}

export const DIR_NOTE = {
  en: c => `> 📒 **Your directory:** DX authenticates against ${c.ad ? "your Active Directory" : "your LDAP directory"} \`${c.host}:${c.port}\`${c.ssl ? " over LDAPS" : ""}; no OpenLDAP is installed. The bind password is never in this folder: install.sh asks for it (or reads \`DIR_BIND_PASSWORD\`).`,
  es: c => `> 📒 **Tu directorio:** DX se autentica contra ${c.ad ? "tu Active Directory" : "tu directorio LDAP"} \`${c.host}:${c.port}\`${c.ssl ? " por LDAPS" : ""}; no se instala ningún OpenLDAP. La contraseña de bind nunca está en esta carpeta: install.sh la pide (o lee \`DIR_BIND_PASSWORD\`).`,
};
