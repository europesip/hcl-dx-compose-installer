# The directory: demo OpenLDAP, your LDAP or Active Directory

[Español](directory.es.md)

Stage 2 of the wizard (*Deployment › Custom*) chooses who signs in to DX:

| Choice | What the folder does |
|---|---|
| **OpenLDAP with demo users** (default) | Installs the OpenLDAP of the labs (demo users andres, macarena…) in the shared namespace, as before. Nothing changes |
| **Your LDAP** | Uses an LDAP directory that **already exists**. No OpenLDAP is installed |
| **Your Active Directory** | The same, with the defaults of Microsoft Active Directory |
| **No directory** | Only `wpsadmin` (the basic registry of the chart) |

With *Your LDAP* or *Your Active Directory*, DX, Keycloak (when it is on) and the Administrator role use your
directory, and `install.sh` tests the connection **before** installing DX. The webinar always uses the demo OpenLDAP.
DX Core has no directory yet (phase 1).

## What the wizard asks

Every empty value takes the default of the kind of directory (*More directory settings* shows them). Each one is also
a key of the [headless mode](headless.md).

| Field | Key | LDAP default | Active Directory default |
|---|---|---|---|
| Host, port | `DIR_HOST`, `DIR_PORT` | port 636 with LDAPS, 389 without | same |
| LDAPS (recommended) | `DIR_SSL` | on | on |
| CA file of the directory | `DIR_CA_FILE` (or `DIR_CA_SECRET`) | none: a CA Java already trusts | same |
| Base DN, users under, groups under | `DIR_BASE_DN`, `DIR_USER_BASE`, `DIR_GROUP_BASE` | users and groups under the base DN | same |
| Bind account (read-only) | `DIR_BIND_DN` (or `DIR_BIND_SECRET`) | | a DN or `user@domain` |
| Users sign in with | `DIR_LOGIN_ATTR` | `uid` | `sAMAccountName` |
| User / group object class, member attribute | `DIR_USER_CLASS`, `DIR_GROUP_CLASS`, `DIR_MEMBER_ATTR` | `inetOrgPerson`, `groupOfUniqueNames`, `uniqueMember` | `user`, `group`, `member` |
| Admin group (DN) | `DIR_ADMIN_GROUP` | none: only wpsadmin is an administrator | same |
| Image of the connection test | `DIR_TEST_IMAGE` | `docker.io/jpgouin/openldap:2.6.9-fix` (the one of the lab OpenLDAP) | same |
| ÓRBITA demo roles | `ORBITA_DEMO_PEOPLE` | nobody of your directory | same |

`mail` and `userPrincipalName` are also offered as the login attribute (or any other attribute name).

## The bind password is never in the folder

The password of the bind account is **not** typed in the wizard and is **never written** in the zip:

- step *Your directory: the bind account* of `install.sh` asks for it with hidden input, or reads the environment
  variable `DIR_BIND_PASSWORD` (unattended runs, a Job), and creates the Secret `dx-ldap-bind` (`bindUser`,
  `bindPassword`, the keys the chart expects) in the DX namespace. A Secret that already exists is kept when the step
  runs again, unless `DIR_BIND_PASSWORD` is set;
- with **Use the secrets manager (OpenBao)** it is stored once in OpenBao (`dx/<DX_NS>/ad bindPassword`, asked by
  `lab-cicd/openbao-secrets.sh` or taken from `DIR_BIND_PASSWORD`) and External Secrets Operator creates
  `dx-ldap-bind` (`lab-directory/secrets.yaml` is an ExternalSecret);
- or the Secret already exists (`DIR_BIND_SECRET`, for example made by an ExternalSecret): nothing is asked, the step
  only checks it is there.

The CA of the directory goes into the Secret `dx-directory-ca` (from `DIR_CA_FILE`), or an existing one is named in
`DIR_CA_SECRET`.

## What is generated

`lab-directory/` instead of `lab-ldap/`:

- **`custom-values.directory.yaml`**, the DX layer, added to every `helm upgrade` of DX from stage 2 on:
  - the **native LDAP block** of the hcl-dx-deployment chart: `configuration.webEngine.ldap` with `type: other`, the
    host, port, `sslEnabled`, `suffix` (base DN), `serverType` (`Custom`, or `Microsoft Active Directory`) and
    `customLdapSecret: dx-ldap-bind`; wpsadmin (basic registry) still works;
  - LDAPS: `customTruststoreSecrets` with the CA of the directory;
  - the `preferredLanguage` property (`wplc-add-property`), as with the demo OpenLDAP;
  - **only when your directory is not shaped like the chart expects** (the chart writes its LDAP registry for `uid`,
    `inetOrgPerson` and `groupOfUniqueNames`, with no value to change it): `directory-registry.xml`, a configuration
    override that extends the registry of the chart (same id, `ldap`) with your filters, object classes, member
    attribute, search bases and login attribute. For Active Directory it also ignores referrals and maps
    `sAMAccountName` (or `userPrincipalName`) to the DX short name (`uid`), with groups by `memberOf` / `member`.
    Login by e-mail adds `<loginProperty name="mail"/>` next to `uid`, as with the demo OpenLDAP.
- **`ldap-test-pod.yaml`**, the connection test (step *Check the connection to your directory*, stage 0, before DX).
  A temporary pod with `ldapsearch` uses the same Secret and CA as DX. It binds, reads the base DN, shows up to three
  users with the login attribute and reads the admin group. It writes nothing, it is deleted afterwards, and the step
  stops the installation when the test fails (`./install.sh --from <step>` after fixing it).
- **`admin-role.xml`** (with `DIR_ADMIN_GROUP`): an XMLAccess request that gives the **Administrator** role, on the
  virtual resource PORTAL, to that group, run right after DX connects to the directory. Without it, the RUNBOOK says
  how to do it in *Resource Permissions*.

**Keycloak** (Advanced CI/CD, when it is on) federates the same directory: User Federation `ldap`, read-only,
imported on login, vendor `ad` for Active Directory (`objectGUID`, pagination) or `other`, users from the users base
with the login attribute as the Keycloak user name (the same name DX finds, so the OIDC user is the LDAP user of DX).
`install.sh` copies the bind account into `keycloak-ldap-bind` in the shared namespace, and the Keycloak CR trusts the
CA of the directory (`truststores`).

**ÓRBITA** (stage 6) tells its demo story with roles played by DX users. With your own directory, the lab users
(andres, macarena…) are **not** given those roles: a real person with the same uid would get them. Every role keeps the
fictitious user of ÓRBITA and HR is `wpsadmin`, unless `ORBITA_DEMO_PEOPLE` says who of your directory plays each role
(JSON, e.g. `{"ventas-1": {"uid": "jdoe"}}`). The IQ question about ÓRBITA is asked as `wpsadmin`.

**People Service, IQ and Search** need no change: People Service is not installed by these labs, the people crawler of
Search is off, and IQ uses the DX session of whoever signs in.

## What has been verified

- The native LDAP block with a Secret, LDAPS with `customTruststoreSecrets`, `preferredLanguage` and the login by
  e-mail (`loginProperty`) were verified on DX Compose CF239 against an OpenLDAP (the labs, and the corporate OpenLDAP
  of EUROPESIP).
- The override for other filters and object classes and the Active Directory defaults follow the configuration
  merging rules of Open Liberty and the HCL documentation (*DX Compose CF239 › Configuring LDAP*), but have **not**
  been tested against a real Active Directory yet: check the test step and a first sign-in before relying on them.

## Headless and the basic preset

The same keys work in [headless mode](headless.md) with `dir: "ldap"` or `dir: "ad"` (not with the webinar). The basic
preset keeps `BASIC_LDAP_HOST`, `BASIC_LDAP_PORT`, `BASIC_LDAP_SUFFIX` and `BASIC_LDAP_SECRET` (#35) and now also takes
`dir` with the `DIR_*` keys; the block goes into `lab-base` (one installation) and the connection test runs before DX.
The Active Directory keys from before (`AD_HOST`, `AD_PORT`, `AD_BASE_DN`, `AD_BIND_USER`, `AD_CA_FILE`) are still read
when the `DIR_*` ones are empty; `AD_BIND_PASSWORD` is no longer written anywhere.
