# External LDAP / Active Directory in the wizard

Issue: #52 · Status: Implemented · Release: Unreleased

## Summary
The wizard offers a directory choice in stage 2: install the OpenLDAP of the labs (demo, default), use an LDAP that
already exists, or use Active Directory. With an existing directory no OpenLDAP is installed; DX (native LDAP block of
the chart), Keycloak (when on) and the Administrator role use that directory, and `install.sh` tests the connection
before DX. The headless keys generalise `BASIC_LDAP_*` (#35).

## Current behaviour
- `dir`: `openldap` | `ad` | `none`. `ad` used the engine slot of the labs (`2a-ad`): a Secret `dx-ad-bind` with
  `AD_HOST`… **and the bind password in clear** in `lab-ldap-ad/secrets.yaml`, and a whole LDAP registry as a
  configuration override (`ldap.type` none). Keycloak only with `openldap`.
- Basic preset: `BASIC_LDAP_HOST/PORT/SUFFIX/SECRET` inject the native block into `lab-base` (`src/basic.js`).

## Specification
- `dir`: `openldap` (default, unchanged) | `ldap` | `ad` | `none`. Webinar: always `openldap`. DX Core: `none`.
- Settings (form and headless, `DIR_*`), every empty value a default of the kind (`src/directory.js` `DIR_DEFAULTS`):
  host, port (636 with LDAPS, else 389), `DIR_SSL` (default true), CA file or existing CA Secret, base DN, users and
  groups bases (default: base DN), bind DN or existing bind Secret, login attribute (`uid` | `mail` |
  `sAMAccountName` | `userPrincipalName` | other; default `uid` / `sAMAccountName`), user class, group class, member
  attribute (`inetOrgPerson`, `groupOfUniqueNames`, `uniqueMember` / `user`, `group`, `member`), admin group DN, test
  image, ÓRBITA demo people.
- The bind password is never in the zip: `install.sh` asks for it (hidden) or reads `DIR_BIND_PASSWORD`; with OpenBao it
  is `dx/<DX_NS>/ad bindPassword` (ExternalSecret); or `DIR_BIND_SECRET` already exists.
- `lab-directory/custom-values.directory.yaml`: native block (`type: other`, `serverType` Custom or Microsoft Active
  Directory, `customLdapSecret: dx-ldap-bind`), `customTruststoreSecrets` with the CA, `preferredLanguage`, and a
  `directory-registry.xml` override (same registry id `ldap`) only when filters, classes, bases or the login attribute
  differ from what the chart generates.
- Steps: stage 0 *Your directory* (Secret, CA, Keycloak copy) and *Check the connection* (ldapsearch pod, not optional,
  fails the run) before DX; stage 2 the DX layer, then the Administrator role (XMLAccess) when an admin group is given.
- Keycloak: User Federation against the directory (read-only, vendor `ad` or `other`), bind from `keycloak-ldap-bind`,
  truststore with the CA.
- ÓRBITA: no lab demo user is mapped onto the directory (roles fictitious, HR = wpsadmin) unless `ORBITA_DEMO_PEOPLE`.
- Basic preset: `BASIC_LDAP_*` produce the same values as before; `dir` + `DIR_*` also accepted; the test step is added.
- `AD_*` keys still read when `DIR_*` are empty; `AD_BIND_PASSWORD` is no longer written.

## Acceptance criteria
- [x] Given "use an existing LDAP", the folder installs no OpenLDAP, DX and Keycloak use that directory and the admin
  group gets the Administrator role (unit tests; lab verification pending, see Test plan).
- [x] The demo OpenLDAP folder is unchanged; the golden test stays green; `src/engine/core.js` is byte-identical.

## Out of scope
- Writing to the directory, nested-group tuning, several directories at once, DX Core with LDAP (phase 2).

## Plan
Output layer `src/directory.js` (the engine still gets `dir` `ad`, or `none` in the basic preset), hooks in
`src/state.js`, `src/bundle.js`, `src/cicd.js` (Keycloak, OpenBao), `src/basic.js`, `src/headless.js`, the page
(`src/views.jsx`, `src/i18n.js`). Risk: the override relies on the merging of Liberty configuration elements.

## Test plan
- Unit: `test/directory.test.mjs` (demo, existing LDAP, Active Directory, OpenBao, Keycloak, ÓRBITA, headless, basic),
  `npm test`; golden test; UI e2e.
- Lab (pending): an existing OpenLDAP over LDAPS with login by e-mail, and a real Active Directory (sign-in, groups,
  Administrator role, Keycloak SSO).
