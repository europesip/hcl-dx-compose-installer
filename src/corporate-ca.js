// Corporate CAs (output layer; the engine stays as the frozen wizard). Whenever the installation includes the lab
// OpenLDAP and/or PostgreSQL, they come with SSL, as a corporate directory and a corporate database would:
//   - internals-ca/ holds the CA certificates "that corporate IT gave us": one root CA for the directory and another one
//     for the databases (two different CAs, clearly named). The other CAs of the lab (OpenSearch) we create ourselves.
//   - prep-pki/ plays the part of corporate IT: the keys of those CAs and the server certificates they sign. Only the
//     preparation uses it (the base installation of OpenLDAP and PostgreSQL, which the user does not see).
//   - OpenLDAP serves LDAPS (636); DX uses LDAPS trusting the directory CA (customTruststoreSecrets) and plain LDAP is
//     closed (olcSecurity tls=1). DX can also sign in with the e-mail (configuration override, loginProperty mail).
//   - PostgreSQL (CloudNativePG) rejects any connection without SSL; DX connects with sslmode=verify-full,
//     validated with the CAs of customTruststoreSecrets, where the same secret uploaded the database CA. Keycloak federates the LDAP over
//     LDAPS. IQ 1.0.3 ignores dbTlsEnabled, so pg_hba keeps an exception for its database (iqdb).
// The webinar tells it as a story: stage 2 starts with the basic LDAP layer (plain 389), shows that the e-mail does not
// work, then the complete layer (overrides + LDAPS + the corporate CAs) and finally closes plain LDAP.
const KAPPLY = "--dry-run=client -o yaml | kubectl apply -f -";
const CAS = "internals-ca", PKI = "prep-pki";
const SUBJ = cn => `"/C=ES/O=EUROPESIP/OU=Corporate IT/CN=${cn}"`;
const CA = {ldap: {file: "corporate-directory-ca", cn: "EUROPESIP Corporate Directory Root CA"},
            pg:   {file: "corporate-database-ca",  cn: "EUROPESIP Corporate Database Root CA"}};
const DX_SECRET = "dx-corporate-cas";
const CERTS_PATH = "/opt/bitnami/openldap/certs";      // where openldap-stack-ha mounts openldap-tls (tls.crt, tls.key, ca.crt)

const ext = (sans, ca) => `# openssl extensions of a server certificate signed by the ${ca}
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = ${sans.map(x => `DNS:${x}`).join(", ")}
`;

const README = on => `# internals-ca · the CAs of corporate IT

The certificates of the root CAs that sign the servers of the corporate infrastructure DX connects to:

${on.ldap ? `- \`${CA.ldap.file}.crt\` · **${CA.ldap.cn}**: the corporate directory (OpenLDAP, LDAPS on port 636).\n` : ""}${on.pg ? `- \`${CA.pg.file}.crt\` · **${CA.pg.cn}**: the corporate databases (PostgreSQL, SSL only).\n` : ""}
DX must trust them: \`customTruststoreSecrets\` uploads them to the truststore of Liberty from the secret
\`${DX_SECRET}\` (one file per CA). Without them, LDAPS and SSL to the database fail with "PKIX path building failed".

In a real project corporate IT gives you these files. In this lab the preparation creates them (\`${PKI}/\` plays the
part of corporate IT: the CA keys and the server certificates). The other CAs of the lab, such as the one of OpenSearch
(lab-search/certs), we generate ourselves.
`;

const LOGIN_EMAIL = (sp) => `${sp}ldap-login-email.xml: |
${sp}  <server description="DX Web Engine - sign in with the short name (uid) or the e-mail (mail)">
${sp}    <ldapRegistry id="ldap">
${sp}      <loginProperty name="uid"/>
${sp}      <loginProperty name="mail"/>
${sp}    </ldapRegistry>
${sp}  </server>
`;
const TRUST = (sp, why) => `${sp}# ${why}
${sp}customTruststoreSecrets:
${sp}  corporate-cas: "${DX_SECRET}"   # the CA certificates of ${CAS}/, in the DX namespace
`;

export function corporateCaOn(s, files){
  return {ldap: !!(s.deps && s.deps.ldap && files["lab-ldap/openldap-values.yaml"]),
          pg: !!(s.deps && s.deps.pg && files["lab-bbdd/cluster-dx-pg.yaml"])};
}

// Files: before applyCicd (it derives the secrets of the secrets manager from them)
export function corporateCaFiles(files, s, {webinar}){
  const on = corporateCaOn(s, files); if (!on.ldap && !on.pg) return files;
  const out = {...files}, sh = s.SHARED_NS, set = (k, f) => { if (out[k]) out[k] = {...out[k], text: f(out[k].text)}; };
  const ldapHost = s.LDAP_HOST || `${s.LDAP_RELEASE}.${sh}.svc.cluster.local`, rel = s.LDAP_RELEASE;
  out[`${CAS}/README.md`] = {text: README(on)};
  if (on.ldap) {
    out[`${PKI}/openldap.ext`] = {text: ext([ldapHost, `${rel}.${sh}.svc`, `${rel}.${sh}`, rel, `${rel}-0.${rel}-headless.${sh}.svc.cluster.local`, "localhost"], CA.ldap.cn)};
    set("lab-ldap/openldap-values.yaml", t => t.replace(/\n*$/, "\n") + `
# LDAPS (port 636) with a certificate signed by the ${CA.ldap.cn} (${CAS}/${CA.ldap.file}.crt, secret openldap-tls)
initTLSSecret:
  tls_enabled: true
  secret: openldap-tls
`);
    set("lab-ldap/custom-values.ldap.yaml", t => {
      const basic = t;
      let x = t.replace(/^(\s*)port: 389\b.*$/m, "$1port: 636                     # LDAPS")
               .replace(/^(\s*)sslEnabled: false\b.*$/m, "$1sslEnabled: true              # the directory CA must be in the truststore of Liberty (below)");
      const trust = TRUST("    ", "LDAPS: Liberty must trust the CA that signed the certificate of the directory, otherwise the SSL handshake fails\n" +
        `    # ("PKIX path building failed") and nobody can sign in. The secret carries the corporate CAs of ${CAS}/: the directory\n` +
        "    # one, and the database one, which validates PostgreSQL over SSL later (stage 3).") + "\n";
      const at = x.search(/^    # preferredLanguage/m) >= 0 ? x.search(/^    # preferredLanguage/m) : x.search(/^    configOverrideFiles:/m);
      if (at >= 0) x = x.slice(0, at) + trust + x.slice(at);
      x = x.replace(/^(    )configOverrideFiles:[ \t]*\n/m, (m, sp) => m +
        `${sp}  # Sign in with the short name OR the e-mail: the native LDAP block of the chart only searches by uid and has no\n` +
        `${sp}  # value to change it. This fragment extends the registry the chart generates (same id, "ldap").\n` + LOGIN_EMAIL(sp + "  "));
      if (webinar) { out["lab-ldap/custom-values.ldap-basic.yaml"] = {text: basicLayer(basic)}; out[AD_EXAMPLE] = {text: adExample()}; }
      return x;
    });
  }
  if (on.pg) {
    const c = s.PG_CLUSTER, sans = ["rw", "ro", "r"].flatMap(k => [`${c}-${k}`, `${c}-${k}.${sh}`, `${c}-${k}.${sh}.svc`, `${c}-${k}.${sh}.svc.cluster.local`]);
    out[`${PKI}/postgres.ext`] = {text: ext(sans, CA.pg.cn)};
    set("lab-bbdd/cluster-dx-pg.yaml", t => t
      .replace(/^  postgresql:[ \t]*\n/m, m => `${m}    # SSL only: any connection without encryption is rejected (${webinar ? "DX connects" : "DX, Keycloak and ÓRBITA connect"} over SSL)\n    pg_hba:\n${s.iqdb ? "      # Exception: IQ 1.0.3 ignores dbTlsEnabled and connects to iqdb without SSL\n      - host iqdb dx_iq_db_user all scram-sha-256\n" : ""}      - hostnossl all all all reject\n`)
      .replace(/^  storage:[ \t]*\n/m, m => `  # Server certificate signed by the ${CA.pg.cn} (${CAS}/${CA.pg.file}.crt): DX verifies it (sslmode=verify-full)\n  certificates:\n    serverTLSSecret: dx-pg-tls\n    serverCASecret: dx-pg-corporate-ca\n${m}`));
    // sslmode=verify-full and nothing else (verified on CF239): DX gives the PostgreSQL driver the CAs of
    // customTruststoreSecrets, in Liberty and in its own Java tools (status checks, DB transfer). A second parameter
    // breaks the DB transfer ("&" is not escaped in dbt_<domain>.xml); sslfactory=DefaultJavaSSLFactory fails in the
    // tools that run before Liberty (JDK truststore, PKIX); sslrootcert alone encrypts but does not verify.
    const url = u => u.replace(/sslmode=disable/g, "sslmode=verify-full");
    set("lab-bbdd/dx_dbdomain.properties", t => {
      const base = (t.match(/DbUrl=(jdbc:postgresql:\/\/[^?\s]+)/) || [])[1] || "jdbc:postgresql://HOST:5432/dx_core";
      return `# JDBC over SSL. The only difference is the end of every DbUrl:
#   without SSL: ${base}?sslmode=disable     (our PostgreSQL rejects it)
#   with SSL:    ${base}?sslmode=verify-full
# sslmode=verify-full encrypts the connection and checks that the certificate of PostgreSQL is signed by a trusted CA
# and matches the host name. The trusted CAs are the ones customTruststoreSecrets uploaded to Liberty: here the
# ${CA.pg.cn} (${DX_SECRET}). Without that CA, the connection fails (PKIX path building failed).
` + url(t); });
    set("lab-bbdd/custom-values.postgres.yaml", t => t.replace(/^(  webEngine:[ \t]*\n)/m, m =>
      m + TRUST("    ", `JDBC over SSL: Liberty must trust the CA of PostgreSQL (${CAS}/${CA.pg.file}.crt). The LDAP layer\n    # already uploads it; it is repeated here so this layer also works on its own.`)));
    set("lab-iq/custom-iq-values.db-external.yaml", t => t.replace(/^(\s*)dbTlsEnabled: false.*$/m, "$1dbTlsEnabled: false                              # IQ 1.0.3 ignores it (no SSL): PostgreSQL has an exception for iqdb"));
  }
  return out;
}

// Webinar: an EXAMPLE (never applied) of what a complex corporate Active Directory may need, shown after the
// overrides of the OpenLDAP: the whole LDAP registry written as a configuration override, with LDAPS
export const AD_EXAMPLE = "lab-ldap/example-active-directory.yaml";
const adExample = () => `# ------------------------------------------------------------------------------------------
# EXAMPLE · advanced configuration for a corporate Microsoft Active Directory. NOT applied in this webinar.
#
# The native LDAP block of the chart (configuration.webEngine.ldap) generates filters for OpenLDAP (inetOrgPerson,
# groupOfUniqueNames). An Active Directory needs its own, so the whole LDAP registry of Liberty is written as a
# configuration override, and the native block is not used (ldap.type: none).
# The connection data is not in this file: it comes from a secret as environment variables (customSecrets), and
# Liberty replaces them in the XML (\${AD_HOST}...). Documentation: DX Compose CF239 > Configuration changes using
# overrides (Configuring LDAP).
# ------------------------------------------------------------------------------------------
configuration:
  webEngine:
    ldap:
      type: "none"                     # the registry comes from the override below

    # AD_HOST, AD_PORT (636), AD_BASE_DN, AD_BIND_USER, AD_BIND_PASSWORD
    customSecrets:
      ad-config: "dx-ad-bind"

    # LDAPS: the root CA of the corporate directory, from ${CAS}/ (as with our OpenLDAP)
    customTruststoreSecrets:
      corporate-cas: "${DX_SECRET}"

    configOverrideFiles:
      ad-registry.xml: |
        <server description="DX Web Engine - corporate Microsoft Active Directory">
          <!-- recursiveSearch="false" (the default, recommended): since CF239 DX resolves every parent group of a
               user at login without a recursive search, and the Users and Groups UI shows the nested groups -->
          <ldapRegistry id="ad" realm="CorporateADRealm"
              host="\${AD_HOST}" port="\${AD_PORT}" sslEnabled="true"
              baseDN="\${AD_BASE_DN}"
              bindDN="\${AD_BIND_USER}" bindPassword="\${AD_BIND_PASSWORD}"
              ldapType="Microsoft Active Directory"
              ignoreCase="true"
              referral="ignore"
              recursiveSearch="false"
              bindAuthMechanism="simple"
              returnToPrimaryServer="true"
              searchPageSize="500"
              searchTimeLimit="15s"
              readTimeout="30s"
              connectTimeout="10s">

            <!-- Sign in with the Windows user (sAMAccountName) or the e-mail; groups through memberOf / member -->
            <activedFilters
                userFilter="(&amp;(|(sAMAccountName=%v)(mail=%v))(objectcategory=person))"
                groupFilter="(&amp;(cn=%v)(objectcategory=group))"
                userIdMap="user:sAMAccountName"
                groupIdMap="*:cn"
                groupMemberIdMap="memberOf:member"/>

            <attributeConfiguration>
              <attribute name="sAMAccountName" propertyName="uid" entityType="PersonAccount"/>
              <attribute name="mail" propertyName="ibm-primaryEmail" entityType="PersonAccount"/>
              <attribute name="title" propertyName="ibm-jobTitle" entityType="PersonAccount"/>
            </attributeConfiguration>

            <ldapEntityType name="PersonAccount">
              <objectClass>person</objectClass>
            </ldapEntityType>
            <ldapEntityType name="Group">
              <objectClass>group</objectClass>
            </ldapEntityType>

            <groupProperties>
              <memberAttribute name="member" scope="direct" objectClass="group"/>
              <membershipAttribute name="memberOf" scope="direct"/>
            </groupProperties>

            <loginProperty name="uid"/>
            <loginProperty name="mail"/>
          </ldapRegistry>

          <!-- One realm with the basic registry of the chart (wpsadmin) and the Active Directory -->
          <federatedRepository>
            <primaryRealm name="FederatedRealm" allowOpIfRepoDown="true">
              <participatingBaseEntry name="o=defaultWIMFileBasedRealm"/>
              <participatingBaseEntry name="\${AD_BASE_DN}"/>
            </primaryRealm>
          </federatedRepository>
        </server>

# The connection pool of the JVM for LDAP, plain and SSL (large directories, many users)
environment:
  pod:
    webEngine:
      - name: JVM_ARGS
        value: >-
          -Dcom.sun.jndi.ldap.connect.pool.protocol="plain ssl"
          -Dcom.sun.jndi.ldap.connect.pool.timeout=180000
          -Dcom.sun.jndi.ldap.connect.pool.maxsize=50
          -Dcom.sun.jndi.ldap.connect.pool.prefsize=10
`;

// The basic LDAP layer of the webinar: the native block of the chart, plain LDAP (389), no overrides
function basicLayer(t){
  const i = t.search(/^\s*# preferredLanguage/m), j = t.search(/^    configOverrideFiles:/m);
  let x = i >= 0 ? t.slice(0, i) : j >= 0 ? t.slice(0, j) : t;
  x = x.replace(/^(# .*DX layer: .*)$/m, "$1\n# Webinar: the BASIC layer (step 2-1). Step 2-3 replaces it with custom-values.ldap.yaml, the complete layer\n# (sign in by e-mail, preferred language, LDAPS with the corporate CAs).");
  return x.replace(/\n*$/, "\n");
}

export function corporateCaSteps(raw, s, files, lang, {webinar}){
  const on = corporateCaOn(s, files); if (!on.ldap && !on.pg) return raw;
  const es = lang === "es", t = (en, sp) => es ? sp : en, ns = s.DX_NS, sh = s.SHARED_NS, rel = s.LDAP_RELEASE;
  const ldapHost = s.LDAP_HOST || `${rel}.${sh}.svc.cluster.local`;
  const rootCa = k => `[ -f ${PKI}/${CA[k].file}.key ] || openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 \\
  -keyout ${PKI}/${CA[k].file}.key -out ${CAS}/${CA[k].file}.crt -subj ${SUBJ(CA[k].cn)}`;
  const cert = (n, k, cn) => `[ -f ${PKI}/${n}.crt ] || { openssl req -new -newkey rsa:2048 -nodes -keyout ${PKI}/${n}.key -out ${PKI}/${n}.csr \\
  -subj ${SUBJ(cn)} && \\
  openssl x509 -req -in ${PKI}/${n}.csr -CA ${CAS}/${CA[k].file}.crt -CAkey ${PKI}/${CA[k].file}.key -CAcreateserial -sha256 -days 825 \\
  -extfile ${PKI}/${n}.ext -out ${PKI}/${n}.crt; }`;
  const names = [on.ldap && t("directory", "directorio"), on.pg && t("databases", "bases de datos")].filter(Boolean).join(t(" and ", " y "));
  const caStep = {lab: "", id: "D-CA", opt: false, manual: "",
    title: t(`Corporate CAs (${names}): ${CAS}/ and the server certificates`, `CAs corporativas (${names}): ${CAS}/ y los certificados de servidor`),
    note: t(`Plays the part of corporate IT: ${on.ldap && on.pg ? "two root CAs, one for the directory and one for the databases," : "a root CA"} whose certificates stay in ${CAS}/ (what IT would give you), and the server certificates of ${[on.ldap && "OpenLDAP", on.pg && "PostgreSQL"].filter(Boolean).join(" and ")} signed by them (${PKI}/). Generated once: running it again keeps the files.`,
            `Hace el papel de IT corporativo: ${on.ldap && on.pg ? "dos CAs raíz, una para el directorio y otra para las bases de datos," : "una CA raíz"} cuyos certificados quedan en ${CAS}/ (lo que te daría IT), y los certificados de servidor de ${[on.ldap && "OpenLDAP", on.pg && "PostgreSQL"].filter(Boolean).join(" y ")} firmados por ellas (${PKI}/). Se genera una vez: si se repite, conserva los ficheros.`),
    cmd: [`mkdir -p ${CAS} ${PKI}`,
      on.ldap && rootCa("ldap"), on.pg && rootCa("pg"),
      on.ldap && cert("openldap", "ldap", ldapHost),
      on.pg && cert("postgres", "pg", `${s.PG_CLUSTER}-rw.${sh}.svc.cluster.local`),
      on.ldap && `kubectl -n ${sh} create secret generic openldap-tls --type=kubernetes.io/tls --from-file=tls.crt=${PKI}/openldap.crt \\\n  --from-file=tls.key=${PKI}/openldap.key --from-file=ca.crt=${CAS}/${CA.ldap.file}.crt ${KAPPLY}`,
      on.ldap && `kubectl -n ${sh} create secret generic dx-corporate-directory-ca --from-file=ca.crt=${CAS}/${CA.ldap.file}.crt ${KAPPLY}`,
      on.pg && `kubectl -n ${sh} create secret tls dx-pg-tls --cert=${PKI}/postgres.crt --key=${PKI}/postgres.key ${KAPPLY}`,
      on.pg && `kubectl -n ${sh} create secret generic dx-pg-corporate-ca --from-file=ca.crt=${CAS}/${CA.pg.file}.crt ${KAPPLY}`,
    ].filter(Boolean).join("\n")};
  const tlsOnly = `printf 'dn: cn=config\\nchangetype: modify\\nreplace: olcSecurity\\nolcSecurity: tls=1\\n' | \\
  kubectl -n ${sh} exec -i ${rel}-0 -c openldap-stack-ha -- ldapmodify -Q -Y EXTERNAL -H ldapi:///`;
  const ldaps = cmd => cmd.replace(/(--\s*\\\n\s*)ldapsearch -x -LLL -H ldap:\/\/localhost:1389/, `$1env LDAPTLS_CACERT=${CERTS_PATH}/ca.crt ldapsearch -x -LLL -H ldaps://localhost:1636`);
  const needDxCa = (on.ldap && s.dir === "openldap") || (on.pg && s.db === "postgres");
  const dxCa = `kubectl -n ${ns} create secret generic ${DX_SECRET} ${[on.ldap && `--from-file=${CAS}/${CA.ldap.file}.crt`, on.pg && `--from-file=${CAS}/${CA.pg.file}.crt`].filter(Boolean).join(" ")} \\\n  ${KAPPLY}     # the corporate CAs, for the truststore of Liberty`;
  const out = [];
  const d3 = raw.find(x => x.id === "D-3");
  for (const st of raw) {
    if (st.id === "D-2" && !webinar) { out.push({...st, cmd: `${st.cmd}\n# Only LDAPS from now on: TLS is required for every connection (plain LDAP on 389 is rejected)\n${tlsOnly}`,
      note: (st.note ? st.note + " " : "") + t(`LDAPS only (636), with the certificate of the ${CA.ldap.cn}.`, `Solo LDAPS (636), con el certificado de la ${CA.ldap.cn}.`)}); continue; }
    if (st.id === "D-3") { out.push({...st, cmd: ldaps(st.cmd)}); continue; }
    if (st.id === "1-3" && needDxCa && !webinar) { out.push({...st, cmd: `${st.cmd}\n${dxCa}`}); continue; }
    if (st.id === "2A-3" && webinar) { out.push({...st, cmd: st.cmd.replace("-f lab-ldap/custom-values.ldap.yaml", "-f lab-ldap/custom-values.ldap-basic.yaml"), fullCmd: st.cmd}); continue; }
    out.push(st);
    if (st.id === "D-1") out.push(caStep);
  }
  if (webinar && on.ldap && s.dir === "openldap") {
    const at = out.findIndex(x => x.id === "2A-3r") >= 0 ? out.findIndex(x => x.id === "2A-3r") : out.findIndex(x => x.id === "2A-3");
    const full = out.find(x => x.id === "2A-3");
    if (at >= 0 && full) {
      const plain = d3 && d3.cmd.replace(/-b ou=groups,\S+ cn uniqueMember/, "-b dc=dxdemo,dc=com -s base dn");
      out.splice(at + 1, 0,
        {lab: full.lab, id: "2A-4", opt: false, manual: "",
          title: t("Configuration overrides: sign in by e-mail, preferred language and LDAPS (~5 min)", "Configuration overrides: login por email, idioma preferido y LDAPS (~5 min)"),
          note: t(`The complete LDAP layer replaces the basic one: overrides (loginProperty mail, preferredLanguage), port 636 with SSL, and the corporate CAs of ${CAS}/ in the truststore of Liberty. The database CA will validate PostgreSQL over SSL in stage 3.`,
                  `La capa LDAP completa sustituye a la básica: overrides (loginProperty mail, preferredLanguage), puerto 636 con SSL y las CAs corporativas de ${CAS}/ en el truststore de Liberty. La CA de bases de datos validará PostgreSQL por SSL en la etapa 3.`),
          cmd: `${dxCa}\n${full.fullCmd}`},
        ...(plain ? [{lab: full.lab, id: "2A-5", opt: false, manual: "",
          title: t("Only LDAPS: close plain LDAP in OpenLDAP", "Solo LDAPS: cerrar el LDAP en claro en OpenLDAP"),
          note: t("DX already uses LDAPS: OpenLDAP now requires TLS for every connection, and plain LDAP (389) is rejected.", "DX ya usa LDAPS: OpenLDAP exige ahora TLS en todas las conexiones, y el LDAP en claro (389) se rechaza."),
          cmd: `${plain}     # plain LDAP: it still works\n${tlsOnly}\n${plain} \\\n  || echo "Plain LDAP rejected: TLS is required (DX keeps working over LDAPS)"`}] : []));
    }
  }
  return out.map(({fullCmd, ...x}) => x);
}

// Keycloak (created by applyCicd): it federates the OpenLDAP over LDAPS, trusting the directory CA
export function corporateCaKeycloak(files, s){
  const on = corporateCaOn(s, files); if (!on.ldap) return files;
  const out = {...files};
  for (const [k, f] of Object.entries(files)) {
    if (!f || typeof f.text !== "string") continue;
    if (/realm-dx\.yaml$/.test(k)) out[k] = {...f, text: f.text.replace(/ldap:\/\/([^"'\s]+):389/g, "ldaps://$1:636")};
    if (/keycloak\.yaml$/.test(k) && /^kind: Keycloak$/m.test(f.text) && !/truststores:/.test(f.text))
      out[k] = {...f, text: f.text.replace(/^(  instances: .*\n)/m, `$1  # The ${CA.ldap.cn}: Keycloak federates the OpenLDAP over LDAPS (realm-dx.yaml)\n  truststores:\n    corporate-directory-ca:\n      secret:\n        name: dx-corporate-directory-ca\n`)};
  }
  return out;
}
