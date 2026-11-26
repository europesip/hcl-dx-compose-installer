// SPDX-License-Identifier: MIT
// Copyright (c) 2026 EUROPESIP
// Unit tests of the directory choice (#52, src/directory.js): the OpenLDAP of the labs (demo, unchanged), an existing
// LDAP and Microsoft Active Directory, in the wizard and in headless mode.
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {generateInstall, validateAnswers} from "../src/headless.js";

const {DEFAULTS, applyPreset} = await import("../src/state.js");
const {generate} = await import("../src/bundle.js");
const {dirConfig, registryOverride} = await import("../src/directory.js");

const CREDS = {DX_HOST: "dx.example.com", HCL_HARBOR_USER: "someone@example.com", HCL_HARBOR_TOKEN: "harbor-token-123", OPENROUTER_API_KEY: "sk-or-v1-secret", LAB_PASSWORD: "Lab-Passw0rd", dxcLicense: true};
const make = (extra = {}, preset = "custom", lang = "en") => generate(applyPreset({...DEFAULTS, ...CREDS, ...extra}, preset), lang);
const file = (g, p) => (g.entries.find(e => e.name === "dx-install/" + p) || {}).text;
const LDAP = {dir: "ldap", DIR_HOST: "ldap.example.com", DIR_BASE_DN: "dc=example,dc=com", DIR_BIND_DN: "cn=dx-bind,ou=services,dc=example,dc=com",
  DIR_CA_FILE: "/secure/corp-ca.crt", DIR_ADMIN_GROUP: "cn=dxadmins,ou=groups,dc=example,dc=com"};
const AD = {dir: "ad", DIR_HOST: "dc01.example.com", DIR_BASE_DN: "DC=example,DC=com", DIR_BIND_DN: "svc-dx@example.com",
  DIR_CA_FILE: "/secure/ad-ca.crt", DIR_ADMIN_GROUP: "CN=DX Admins,OU=Groups,DC=example,DC=com"};
const BASIC = {preset: "basic", DX_HOST: "dx-basic-1.example.com", DX_NS: "dx-basic-1", IMAGE_PULL_SECRET: "harbor-pull"};

test("demo OpenLDAP (default): unchanged, no lab-directory", () => {
  const g = make();
  assert.equal(g.s.dirExt, null);
  assert.ok(g.files["lab-ldap/openldap-values.yaml"]);
  assert.ok(!g.entries.some(e => e.name.includes("lab-directory/")));
  assert.doesNotMatch(file(g, "install.sh"), /dx-ldap-test|DIR_BIND_PASSWORD/);
  assert.match(file(g, "BUILD-INFO.txt"), /directory {9}: OpenLDAP \(demo users\)/);
  assert.match(file(make({dir: "none"}), "BUILD-INFO.txt"), /directory {9}: none \(only wpsadmin\)/);
});

test("existing LDAP: no OpenLDAP, the native LDAP block, LDAPS with the CA, test before DX, Administrator role", () => {
  const g = make(LDAP);
  assert.deepEqual(g.check.err, []);
  const sh = file(g, "install.sh"), v = file(g, "lab-directory/custom-values.directory.yaml");
  assert.doesNotMatch(sh, /openldap-stack-ha|helm-openldap|demo-users\.ldif/);
  assert.ok(!g.entries.some(e => /lab-ldap\//.test(e.name)), "no lab-ldap folder");
  assert.match(v, /ldap:\n {6}type: "other"\n {6}host: "ldap\.example\.com"\n {6}port: 636\n {6}sslEnabled: true\n {6}suffix: "dc=example,dc=com"\n {6}serverType: "Custom"/);
  assert.match(v, /customLdapSecret: "dx-ldap-bind"/);
  assert.match(v, /customTruststoreSecrets:\n {6}directory-ca: "dx-directory-ca"/);
  assert.doesNotMatch(v, /directory-registry\.xml: \|/, "shaped like the chart expects: no override");
  assert.match(v, /wplc-add-property/);
  // the bind password is never in the folder
  assert.ok(!g.entries.some(e => e.name.endsWith("lab-directory/secrets.yaml")));
  assert.match(sh, /read -r -s -p "  Password of the bind account cn=dx-bind,ou=services,dc=example,dc=com: " DIR_BIND_PASSWORD <\/dev\/tty/);
  assert.match(sh, /--from-file=bindPassword=\/dev\/stdin/);
  assert.match(sh, /create secret generic dx-directory-ca --from-file=directory-ca\.crt='\/secure\/corp-ca\.crt'/);
  // order: the bind Secret and the test before DX, the DX layer in stage 2, then the Administrator role
  const ids = g.steps.map(s => s.origId);
  assert.ok(ids.indexOf("DIR-1") < ids.indexOf("DIR-2") && ids.indexOf("DIR-2") < ids.indexOf("1-4"));
  assert.ok(ids.indexOf("AD-2") < ids.indexOf("DIR-3"));
  assert.ok(!ids.includes("AD-1"));
  assert.equal(g.steps.find(s => s.origId === "DIR-2").stage, 0);
  assert.equal(g.steps.find(s => s.origId === "DIR-2").opt, false, "the connection test is not optional");
  assert.match(g.steps.find(s => s.origId === "AD-2").cmd, /-f lab-directory\/custom-values\.directory\.yaml/);
  assert.match(file(g, "lab-directory/admin-role.xml"), /subjectid="cn=dxadmins,ou=groups,dc=example,dc=com" subjecttype="user_group"/);
  const pod = file(g, "lab-directory/ldap-test-pod.yaml");
  assert.match(pod, /ldaps:\/\/ldap\.example\.com:636/);
  assert.match(pod, /secretName: dx-directory-ca/);
  assert.match(pod, /-y \/bind\/bindPassword/);
  assert.match(pod, /runAsNonRoot: true/);
  for (const p of ["install.sh", "uninstall.sh"]) assert.equal(spawnSync("bash", ["-n"], {input: file(g, p)}).status, 0, p);
  assert.match(file(g, "RUNBOOK.md"), /Your directory:\*\* DX authenticates against your LDAP directory/);
  // later DX upgrades keep the directory layer
  assert.ok((sh.match(/-f lab-directory\/custom-values\.directory\.yaml/g) || []).length >= 3);
});

test("existing LDAP: login by e-mail, other bases and classes generate the configuration override", () => {
  const mail = registryOverride(dirConfig({...DEFAULTS, ...LDAP, DIR_LOGIN_ATTR: "mail"}));
  assert.match(mail, /<loginProperty name="uid"\/>\n {4}<loginProperty name="mail"\/>/);
  assert.doesNotMatch(mail, /customFilters/);
  const o = registryOverride(dirConfig({...DEFAULTS, ...LDAP, DIR_USER_BASE: "ou=people,dc=example,dc=com", DIR_USER_CLASS: "person", DIR_GROUP_CLASS: "groupOfNames", DIR_MEMBER_ATTR: "member"}));
  assert.match(o, /<ldapRegistry id="ldap">/);
  assert.match(o, /userFilter="\(&amp;\(uid=%v\)\(objectclass=person\)\)"/);
  assert.match(o, /groupMemberIdMap="groupOfNames:member"/);
  assert.match(o, /<searchBase>ou=people,dc=example,dc=com<\/searchBase>/);
  assert.match(o, /<memberAttribute name="member" scope="direct" objectClass="groupOfNames"\/>/);
});

test("Active Directory: serverType AD, sAMAccountName, memberOf, referrals ignored, no AD secret with the password", () => {
  const g = make(AD);
  assert.deepEqual(g.check.err, []);
  const v = file(g, "lab-directory/custom-values.directory.yaml");
  assert.match(v, /serverType: "Microsoft Active Directory"/);
  assert.match(v, /<ldapRegistry id="ldap" referral="ignore">/);
  assert.match(v, /userFilter="\(&amp;\(sAMAccountName=%v\)\(objectcategory=person\)\(objectclass=user\)\)"/);
  assert.match(v, /<activedFilters/);
  assert.match(v, /groupMemberIdMap="memberOf:member"/);
  assert.match(v, /<attribute name="mail" propertyName="ibm-primaryEmail" entityType="PersonAccount"\/>\n.*\n.*<attribute name="sAMAccountName" propertyName="uid"/);
  assert.match(v, /<membershipAttribute name="memberOf" scope="direct"\/>/);
  assert.doesNotMatch(v, /\$\{AD_|configOverrideFiles:\n\s+ad-registry/);
  assert.ok(!g.entries.some(e => /lab-ldap-ad\/|dx-ad-bind/.test(e.name + (e.text || ""))), "the old AD layer is gone");
  assert.match(g.steps.find(s => s.origId === "AD-2").title, /your Active Directory/);
  // userPrincipalName
  const upn = file(make({...AD, DIR_LOGIN_ATTR: "userPrincipalName"}), "lab-directory/custom-values.directory.yaml");
  assert.match(upn, /userFilter="\(&amp;\(userPrincipalName=%v\)/);
  assert.match(upn, /<attribute name="userPrincipalName" propertyName="uid"/);
});

test("Active Directory from the settings before #52 (AD_*): still read", () => {
  const c = dirConfig({...DEFAULTS, dir: "ad", AD_HOST: "dc.local", AD_PORT: "636", AD_BASE_DN: "DC=a,DC=b", AD_BIND_USER: "svc@a", AD_CA_FILE: "/c.crt"});
  assert.equal(c.host, "dc.local"); assert.equal(c.ssl, true); assert.equal(c.port, 636); assert.equal(c.bindDn, "svc@a"); assert.equal(c.caFile, "/c.crt");
  assert.equal(dirConfig({...DEFAULTS, dir: "ad", AD_HOST: "dc.local", AD_PORT: "389"}).ssl, false);
});

test("existing directory: errors and warnings", () => {
  const g = make({dir: "ldap"});
  assert.match(g.check.err.join("\n"), /DIR_HOST/);
  assert.match(g.check.err.join("\n"), /DIR_BASE_DN/);
  assert.match(g.check.err.join("\n"), /DIR_BIND_DN/);
  assert.deepEqual(make({...LDAP, DIR_BIND_DN: "", DIR_BIND_SECRET: "corp-bind"}).check.err, []);
  const w = make({...LDAP, DIR_SSL: false, DIR_ADMIN_GROUP: ""}).check.warn.join("\n");
  assert.match(w, /plain LDAP/); assert.match(w, /DIR_ADMIN_GROUP/);
  assert.match(make({...LDAP, ORBITA_DEMO_PEOPLE: "{\"boss\": {\"uid\": \"x\"}}"}).check.err.join("\n"), /ORBITA_DEMO_PEOPLE: unknown role boss/);
});

test("existing bind Secret: nothing is asked, only checked", () => {
  const g = make({...LDAP, DIR_BIND_DN: "", DIR_BIND_SECRET: "corp-bind"});
  const sh = file(g, "install.sh");
  assert.match(sh, /kubectl -n dx-demo get secret corp-bind >\/dev\/null \|\|/);
  assert.doesNotMatch(sh, /read -r -s -p "  Password of the bind/);
  assert.match(file(g, "lab-directory/custom-values.directory.yaml"), /customLdapSecret: "corp-bind"/);
});

test("Keycloak federates your directory (read-only, AD vendor), with its CA and a copy of the bind account", () => {
  const g = make({...AD, keycloak: true});
  const realm = file(g, "lab-keycloak/realm-dx.yaml"), kc = file(g, "lab-keycloak/keycloak.yaml"), sh = file(g, "install.sh");
  assert.match(realm, /vendor: \["ad"\]/);
  assert.match(realm, /connectionUrl: \["ldaps:\/\/dc01\.example\.com:636"\]/);
  assert.match(realm, /bindDn: \["\$\{LDAP_BIND_DN\}"\]/);
  assert.match(realm, /LDAP_BIND_PASSWORD: \{ secret: \{ name: keycloak-ldap-bind, key: bindPassword \} \}/);
  assert.match(realm, /usernameLDAPAttribute: \["sAMAccountName"\]/);
  assert.match(realm, /uuidLDAPAttribute: \["objectGUID"\]/);
  assert.match(realm, /editMode: \["READ_ONLY"\]/);
  assert.doesNotMatch(realm, /dxdemo|openldap-admin/);
  assert.match(kc, /truststores:\n {4}directory-ca:\n {6}secret:\n {8}name: dx-directory-ca/);
  assert.match(sh, /name: keycloak-ldap-bind\\n {2}namespace: dx-shared/);
  assert.match(sh, /kubectl -n dx-shared create secret generic dx-directory-ca/);
  assert.match(sh, /-f lab-directory\/custom-values\.directory\.yaml \\\n {2}-f lab-keycloak\/custom-values\.keycloak\.yaml/);
  const ids = g.steps.map(s => s.origId);
  assert.ok(ids.indexOf("DIR-1") < ids.indexOf("K-1"), "the bind copy exists before the realm import");
  // the LDAP vendor
  const r2 = file(make({...LDAP, keycloak: true}), "lab-keycloak/realm-dx.yaml");
  assert.match(r2, /vendor: \["other"\]/); assert.match(r2, /userObjectClasses: \["inetOrgPerson"\]/); assert.match(r2, /usernameLDAPAttribute: \["uid"\]/);
});

test("secrets manager: the bind password from OpenBao (ad bindPassword), an ExternalSecret, nothing secret in the folder", () => {
  const g = make({...LDAP, cicdOpenbao: true, useVault: true});
  assert.deepEqual(g.check.err, []);
  const es = file(g, "lab-directory/secrets.yaml");
  assert.match(es, /kind: ExternalSecret/);
  assert.match(es, /remoteRef: \{ key: dx-demo\/ad, property: 'bindPassword' \}/);
  assert.match(file(g, "lab-cicd/openbao-secrets.sh"), /ext ad bindPassword DIR_BIND_PASSWORD/);
  assert.match(file(g, "install.sh"), /kubectl apply -f lab-directory\/secrets\.yaml\nkubectl -n dx-demo wait externalsecret dx-ldap-bind/);
  assert.ok(!g.entries.some(e => /@@OB:/.test(e.text || "")));
});

test("ÓRBITA with your directory: no lab user gets a demo role, unless ORBITA_DEMO_PEOPLE says so", () => {
  const g = make({...LDAP, lab5: true});
  const orb = g.steps.find(s => /helm upgrade --install orbita /.test(s.cmd)).cmd;
  assert.match(orb, /--set demo\.people\.ventas-responsable=null,demo\.people\.ventas-1=null/);
  assert.match(orb, /--set demo\.people\.rrhh\.uid=wpsadmin/);
  assert.doesNotMatch(g.steps.map(s => s.cmd).join("\n"), /macarena/);
  assert.equal(spawnSync("bash", ["-n"], {input: file(g, "install.sh")}).status, 0);
  const p = make({...LDAP, lab5: true, ORBITA_DEMO_PEOPLE: '{"rrhh": {"uid": "hr.boss"}, "ventas-1": {"uid": "jdoe", "nombre": "John"}}'}).steps.find(s => /orbita /.test(s.cmd)).cmd;
  assert.match(p, /--set-json 'demo\.people=\{"rrhh":\{"uid":"hr\.boss"\},"ventas-1":\{"uid":"jdoe","nombre":"John"\}\}'/);
  assert.doesNotMatch(p, /rrhh\.uid=wpsadmin|ventas-1=null/);
});

test("headless: dir ldap / ad with the DIR_* keys, every preset but the webinar", () => {
  const r = generateInstall({answers: {preset: "custom", DX_HOST: "dx.example.com", HCL_HARBOR_USER: "someone@example.com", ...AD}});
  assert.ok(r.ok, r.check.err.join("\n"));
  assert.ok(r.files["lab-directory/custom-values.directory.yaml"], "the DX layer goes to Git (no secret in it)");
  assert.ok(validateAnswers({preset: "custom", dir: "openldap", DIR_HOST: "x"}).some(e => /only with dir ldap or ad/.test(e)));
  assert.ok(validateAnswers({preset: "webinar", ...LDAP}).some(e => /webinar/.test(e)));
  assert.deepEqual(validateAnswers({preset: "custom", ...LDAP}), []);
});

test("basic preset: BASIC_LDAP_* as before, DIR_* too, and the connection test before DX", () => {
  const old = generateInstall({answers: {...BASIC, BASIC_LDAP_HOST: "openldap.identity.svc.cluster.local", BASIC_LDAP_SUFFIX: "dc=europesip,dc=com"}});
  assert.ok(old.ok, old.check.err.join("\n"));
  const v = old.files["lab-base/custom-values.yaml"].text;
  assert.match(v, /configuration:\n  # basic preset: an LDAP that already exists \(BASIC_LDAP_HOST\)[\s\S]*port: 389\n {6}sslEnabled: false[\s\S]*customLdapSecret: "dx-ldap-bind"   # bindUser \/ bindPassword, already in the namespace/);
  assert.doesNotMatch(v, /directory-registry|customTruststoreSecrets/);
  assert.match(old.files["install.sh"].text, /kubectl apply -f lab-directory\/ldap-test-pod\.yaml/);
  assert.doesNotMatch(old.files["install.sh"].text, /lab-ldap|-n dx-shared|helm upgrade --install dx-deployment[\s\S]*helm upgrade --install dx-deployment/);
  const ad = generateInstall({answers: {...BASIC, dir: "ad", DIR_HOST: "dc01.example.com", DIR_BASE_DN: "DC=example,DC=com", DIR_BIND_SECRET: "ad-bind", DIR_CA_SECRET: "ad-ca", DIR_ADMIN_GROUP: AD.DIR_ADMIN_GROUP}});
  assert.ok(ad.ok, ad.check.err.join("\n"));
  const av = ad.files["lab-base/custom-values.yaml"].text;
  assert.match(av, /serverType: "Microsoft Active Directory"/);
  assert.match(av, /directory-ca: "ad-ca"/);
  assert.match(ad.files["install.sh"].text, /admin-role\.xml/);
  assert.equal(spawnSync("bash", ["-n"], {input: ad.files["install.sh"].text}).status, 0);
});
