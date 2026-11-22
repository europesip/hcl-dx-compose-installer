# DX Core vs Web Engine (DX Compose)

[Español](core-vs-webengine.es.md)

The installer can deploy two DX servers from the same chart (hcl-dx-deployment 2.50.0, CF239,
[#38](https://github.com/europesip/hcl-dx-compose-installer/issues/38)):

- **Web Engine** — DX Compose, HCL Digital Experience 9.5 on Open Liberty (default);
- **DX Core** — the traditional HCL Digital Experience 9.5 server on WebSphere Application Server (`DX_RUNTIME=core`).

This page puts every difference we have found in one place. **Measured** means read on the EUROPESIP lab cluster on
22-nov-2026 (a Core on Oracle 21c XE and a Web Engine on Derby, both CF239) or on a traditional DX 9.5 CF230 on a
virtual machine; **docs** means the HCL CF239 documentation, linked in each row. For the database options see
[External databases](databases.md); for what is still open on Core see [DX Core phase 2](dx-core-phase2.md).

## 1. Product versions (measured)

| | DX Core | Web Engine |
|---|---|---|
| Image (hclcr.io) | `dx/core:v95_CF239_20261103-1617` (the chart default `dx-compose/core` does not exist) | `dx-compose/webengine:CF239_20261103-1608` |
| Application server | **IBM WebSphere Application Server Network Deployment 9.0.5.29** | **Open Liberty 26.0.0.9** (edition Open, EPL) |
| Java | **IBM SDK, Java Technology Edition 8** — 8.0.8.71 (SR8 FP71), `1.8.0_503`, IBM J9 VM 2.9 / OpenJ9 | **IBM Semeru Runtime Open Edition 21** — `21.0.12.1` LTS, Eclipse OpenJ9 0.61.0 |
| Java level for your code | Java 8 (JDBC drivers, portlets, shared libraries must run on Java 8: e.g. `ojdbc8`) | Java 21 (`ojdbc11`) |
| Operating system | Red Hat Enterprise Linux 8.10 | Red Hat Enterprise Linux 9.8 |
| Product header (XMLAccess) | `HCL Digital Experience/8.5 build …` (the 9.5 features are installed on the 8.5 base: `MP95.product` 9.5.0.0) | `HCL Digital Experience Compose/9.5` |
| Processes in the pod | **two JVMs**: `WebSphere_Portal` (profile `wp_profile`) and the **Config Wizard** `server1` (profile `cw_profile`), plus 3 side-car containers (logs, prerequisites) | **one JVM**: the Liberty `defaultServer`, plus 2 log side-cars |
| Ports in the container | 10032-10049 (portal: 10039 HTTP, 10041/10042 HTTPS, 10033 SOAP), 10200-10210 (Config Wizard, **10202 DXConnect**) | 9080 HTTP, 9443 HTTPS, 10033, 2809, 7276/7286, 9402 |
| JDBC drivers in the image | Derby, DB2 (`db2jcc`); **no Oracle, no SQL Server**: you copy them to the profile volume | Derby, DB2 (`db2jcc4`), **Oracle `ojdbc11` 23.6**, **SQL Server `mssql-jdbc` 12.10**, **PostgreSQL 42.7.11** |
| Default resources (chart) | requests 2 CPU / 4 GiB, limits 4 CPU / 6 GiB | the same |
| First start | **~20 min** (copies a full WebSphere profile and a Config Wizard profile to the volumes) | ~5 min |
| Restart with the profile already there | ~3-3.5 min | a few minutes (Liberty regenerates its configuration from the values) |

## 2. Chart values, credentials and volumes

| Area | DX Core | Web Engine |
|---|---|---|
| Switch | `applications.core: true`, `applications.webEngine: false` | the opposite (installer default) |
| Credentials | **three** Secrets: `security.core.customWpsSecret` (portal admin), `customWasSecret` (WebSphere admin), `customConfigWizardSecret` (Config Wizard admin); without the last one the chart fails | **one**: `security.webEngine.customWebEngineSecret` |
| Volumes | `volumes.core.profile` (the whole `wp_profile`, Derby inside), `log`, `tranlog` | `volumes.webEngine.customization`, `log` |
| Host | `networking.core.host` | `networking.webEngine.host` |
| Context root | `networking.core.contextRoot`, default `wps` | `networking.webEngine.contextRoot`, default `wps` |
| Overrides | **none**: no `configOverrideFiles`, `customSecrets`, `customTruststoreSecrets`, `propertiesFilesOverrides` | Liberty `server.xml` fragments (`configOverrideFiles`), properties files, truststores, extra secrets |
| How configuration lives | **state of the profile** on its volume: a ConfigEngine task runs once and stays; a `helm upgrade` does not undo it | **declarative**: regenerated from the chart values on every start |

## 3. Tools

| Tool | DX Core | Web Engine |
|---|---|---|
| **ConfigEngine** | yes, in the pod (`/opt/HCL/wp_profile/ConfigEngine`, `containerConfigEngine.sh` pauses the probes, [docs](https://help.hcl-software.com/digital-experience/9.5/CF239/deployment/manage/container_configuration/run_core_config_engine/)). Most configuration is a ConfigEngine task | **does not exist** ([docs](https://help.hcl-software.com/dx-compose/9.5/CF239/deploy_dx/manage/working_with_compose/dxclient/)): what is a task on Core is a chart value or a REST call |
| **Config Wizard** (web UI) | yes (`cw_profile`, ports 10200/10203): guided wizards that run ConfigEngine (database transfer, LDAP, virtual portals…) | no |
| **DXClient** | every command ([docs](https://help.hcl-software.com/digital-experience/9.5/CF239/extend_dx/development_tools/dxclient/dxclient_commands/)); several go through **DXConnect** (servlet of the Config Wizard server, port 10202, `/hcl/dxconnect/processHandler`) and run ConfigEngine tasks on the server | only the [supported operations](https://help.hcl-software.com/dx-compose/9.5/CF239/deploy_dx/manage/working_with_compose/dxclient/) («all other DXClient operations are not supported at this time»); it is the common tool for both and keeps growing towards the ConfigEngine tasks |
| **XMLAccess** | `xmlaccess.sh` (`<wp_profile>/PortalServer/bin`) and the HTTP servlet `/wps/config` | `xmlaccess.sh` inside the container, the servlet `/wps/config` and `dxclient xmlaccess` (the recommended way from outside) |
| What XMLAccess does **not** cover | WCM libraries, DAM, LDAP, database | the same |
| **wsadmin** | yes (WebSphere scripting: truststores, J2C aliases, resource environment providers) | no (Liberty is configured with `server.xml`) |

## 4. LDAP

| | DX Core | Web Engine |
|---|---|---|
| Chart values | `configuration.core.ldap`: same schema and same `core.config.ldap_*` keys | `configuration.webEngine.ldap` |
| How it is applied | ConfigEngine **once** at start-up (`wp-create-ldap` and companions); then it is state of the profile; changing the values later does nothing | a Liberty `<ldapRegistry>` generated on **every** start |
| Bind Secret (`customLdapSecret`) | **values base64-encoded twice** (chart 2.50.0 bug, undocumented: the image decodes them again); the image puts `cn=` in front of `bindUser`, so a bind user that is not `cn=…` cannot be used | normal Secret, full DN |
| Admin credentials with LDAP | documented: with LDAP in the chart the `security.core` credentials **are not applied**; they must be those of an LDAP administrator. Installing with LDAP and a new wpsadmin password fails (SOAP authentication) — install without LDAP, then upgrade | the Liberty admin keeps working |
| LDAPS | no chart value: import the CA with wsadmin (`addSignerCertificate`, `NodeDefaultTrustStore`) and run `wp-update-federated-ldap` with port 636 and `sslEnabled=true` (the first run fails once while ConfigEngine refreshes `etc/trust.p12`; run it again) | `sslEnabled: true` + `customTruststoreSecrets` |
| Login by e-mail | `wp-update-federated-ldap -Dfederated.ldap.loginProperties=uid;mail` | `configOverrideFiles` with `<loginProperty name="mail"/>` |
| `preferredLanguage` | `wp-add-property` | `wplc-add-property` + restart |
| HCL's own advice | the chart LDAP option «is quite limited; for more complex configurations use the Config Wizard» ([docs](https://help.hcl-software.com/digital-experience/9.5/CF239/deployment/install/container/helm_deployment/preparation/optional_tasks/optional_configure_apps/#supported-ldap-configuration)) | [Configuring LDAP](https://help.hcl-software.com/dx-compose/9.5/CF239/deploy_dx/manage/cfg_webengine/ldap_configuration/) |
| Measured | plain and LDAPS, by uid and by e-mail: all work (through ConfigEngine) | all work (labs) |

## 5. Database

Summary here; details in [External databases](databases.md).

| | DX Core | Web Engine |
|---|---|---|
| Supported (CF239) | DB2 11.5/12.1, Oracle 19c/21c, SQL Server Standard/Enterprise 2017-2022, Derby (not for production). **No PostgreSQL** | Derby, DB2, Oracle 19c/21c; SQL Server (setup script, sample values, RDS 2022); PostgreSQL in our labs |
| How the transfer from Derby is done | **only with ConfigEngine** in the pod — directly or through the Config Wizard UI, which runs the same ConfigEngine tasks: `validate-database`, `database-transfer enable-profiles-check-managed package-profiles`, `datasource-enable-fully-materialize-lob-data`, then a restart. There is **nothing in the chart** for it | **declarative**: `useExternalDatabase` + `customDbTypePropertiesSecret` / `customDbDomainPropertiesSecret`; the Web Engine transfers on the next start |
| JDBC driver | not in the image: copy it to the profile volume, Java 8 build (`ojdbc8`, `mssql-jdbc …jre8`) | in the image (`ojdbc11`, `mssql-jdbc`, PostgreSQL) |
| Data sources | one per domain when each domain has its own user (`wpreldbDS`, `wpcustdbDS`, `wpcommdbDS`, `wpjcrdbDS`, `wpfdbkdbDS`, `wplmdbDS`); Derby shares one (`wpdbDS`) | generated from the properties |
| Password at run time | J2C authentication aliases in `security.xml`, `{xor}` (an encoding, not encryption: standard WebSphere) | Liberty configuration from the Secrets |
| Measured transfer | SQL Server 2022: ~11 min; Oracle 21c XE: ~22.5 min (2 CPU threads); 465 tables, ~1 GB | ~15 min to PostgreSQL (labs) |

## 6. Import and export

| | DX Core | Web Engine |
|---|---|---|
| Move files to/from the server | **DXConnect** (`?requestMethod=upload` / `download`), with three credentials: DX admin (`DXAuth`), WebSphere admin (`DXWASAuth`) and the Config Wizard admin. On a VM the Config Wizard server must be **running** | **dxFileTransfer** (`/wps/dxFileTransfer/dft`, Basic); it answers **404 on Core** |
| WCM library export | DXConnect `exportWCMLibrary` (runs `export-wcm-data`): an **uncompressed tar named `.tar.gz`**, one folder per library (`WCM_Library-<time>/<library>/…`); or ConfigEngine `export-wcm-data` on the server | WCM data module (`/wps/wcm/myconnect?MOD=data&taskType=export`) to a folder, download with dxFileTransfer |
| WCM library import | DXConnect `upload` + `importWCMLibrary` (runs `import-wcm-data`): **only its own tar layout** — a flat zip fails | data module `taskType=import` or `import-copy` on a zip |
| Import as a copy (new IDs) | **no** (`import-wcm-data` has no copy mode) | yes (`import-copy`) |
| WCM format | the same JCR export (`554ee7f5/423dc4e4/<library>/…`): what one exports, the other imports (measured both ways) | the same |
| Pages, portlets, virtual portals, URL mappings | XMLAccess, same schema | the same |
| Cloned portlets (`$cloned`, e.g. a Web Content Viewer) | must travel with their definition in the export, or the import fails with `EJPXA0240E` | the same |
| Theme files | WebDAV `…/mycontenthandler/dav/fs-type1/themes/` | the same |
| Theme and skin registration | XMLAccess; exports from older CFs can carry an empty `localedata locale=""` and repeated `<skin action="locate">` that break the import (`NullPointerException`, `EJPXA0140E`): clean them | the same XMLAccess |
| Script Applications | DXClient `deploy-scriptapplication` (through DXConnect) | DXClient `deploy-scriptapplication` |
| DAM | the same DAM service (optional in the chart) | the same |
| Virtual portals list (`PortalVPHandler`) | works on the container Core; answered empty on a CF230 VM | works |

## 7. Login, APIs and URLs

| | DX Core | Web Engine |
|---|---|---|
| Ring API (`/dx/api/core/v1/auth/login`) | only if the chart deploys it (it does with Core); a VM install has none | yes |
| Form login | `j_security_check` → `LtpaToken2` | yes |
| WCM REST with Basic | redirects to the login: needs the LTPA session | works with the session from the Ring API |
| Session cookie | `JSESSIONID` + LTPA | Liberty `WAS_*` cookie (matters for OIDC, People Service) |
| OIDC / Keycloak | WebSphere TAI (not validated yet) | Liberty OIDC (validated in the labs) |
| Context root | `/wps` with the chart; **an empty context root on a VM** (`/config`, `/mycontenthandler`) is a customisation of that installation | `/wps` |
| Pod and service | `<release>-core-0`, service `<release>-core` (10039/10041) | `<release>-web-engine-0`, service `<release>-web-engine` (9080) |

## 8. Not validated on Core yet

HCL DX IQ and its MCP server, Search V2 (Core has its own Remote Search option), People Service, Keycloak/OIDC,
HCL Leap, ÓRBITA, the Hello DX Script Application extra, and the CI/CD options (OpenBao + External Secrets, Argo CD).
See [DX Core phase 2](dx-core-phase2.md).
