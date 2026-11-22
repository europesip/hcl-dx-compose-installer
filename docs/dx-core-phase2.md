# DX Core: what is configured differently (phase 2)

[Español](dx-core-phase2.es.md)

Since issue [#38](https://github.com/europesip/hcl-dx-compose-installer/issues/38) the installer can deploy **DX Core**,
the traditional HCL Digital Experience 9.5 server on WebSphere Application Server, instead of the **Web Engine** of
DX Compose (`DX_RUNTIME=core`, wizard → *Choose what to install* → *DX server*). Both come from the same chart
(hcl-dx-deployment 2.50.0, CF239).

**Phase 1** (now): the base portal (Lab 1), with or without DAM, on **Derby**. Everything else is switched off for Core.

This page lists what Core configures differently from the Web Engine, found while building phase 1. Each item is a
candidate for phase 2; nothing here is implemented yet.

## Found in the chart (hcl-dx-deployment 2.50.0)

| Area | Web Engine (DX Compose) | DX Core | Phase 2 |
|---|---|---|---|
| Image | `dx-compose/webengine` | the chart default `dx-compose/core` **does not exist** in hclcr.io; the image is `dx/core` (`images.names.core`, measured 22-nov-2026) | done in phase 1 (the installer sets it) |
| Credentials | one Secret, `security.webEngine.customWebEngineSecret` | three: `customWpsSecret` (wpsadmin), `customWasSecret` (WebSphere administrator), `customConfigWizardSecret` (Config Wizard); without the Config Wizard one the chart fails (`b64enc` of an empty user) | done in phase 1 (same user and password in the three) |
| Volumes | `volumes.webEngine.customization` + `log` | `volumes.core.profile` (wp_profile, with Derby) + `log` + `tranlog` | done in phase 1 (all on `SC_RWO`) |
| Host | `networking.webEngine.host` | `networking.core.host` | done in phase 1 |
| External database | `configuration.webEngine.useExternalDatabase`, `customDbTypePropertiesSecret`, `customDbDomainPropertiesSecret`: the Web Engine transfers Derby on the next start | **nothing in the chart**: no `useExternalDatabase`, dbDomain or dbType for Core, and no transfer logic in `templates/core`. The classic way is ConfigEngine inside the pod (`validate-database`, `database-transfer`) with `wkplc_dbdomain.properties` / `wkplc_dbtype.properties` of the profile | to design: an installer step with ConfigEngine, only if it is reproducible and survives restarts (the profile is on a PVC) |
| PostgreSQL | supported by the Web Engine properties (being validated by HCL) | `wkplc_dbtype.properties` of the CF239 Core profile has **no PostgreSQL** entries (only derby, db2, oracle, sqlserver2005, db2_zos, db2_iseries) | Oracle, DB2 or SQL Server for Core; PostgreSQL would need HCL support |
| LDAP | `configuration.webEngine.ldap` → Liberty `<ldapRegistry>` XML | `configuration.core.ldap` has the same value schema but no `sslEnabled` / `recursiveSearch`, only `serverType: CUSTOM` documented, and it is applied by the Core start-up (ConfigEngine / VMM), not by Liberty XML | test the native block; LDAPS needs the CA in the WebSphere truststore |
| Overrides | `configOverrideFiles`, `customSecrets`, `customTruststoreSecrets`, `propertiesFilesOverrides` | **none** of them on Core | every Lab 2 customisation becomes a ConfigEngine task: `preferredLanguage` (`wp-add-property` instead of `wplc-add-property`), Active Directory filters, e-mail login, LDAPS truststore (`wp-modify-ldap-security`, …) |
| Start-up | ~5 min (Liberty) | first start copies a fresh profile and a Config Wizard profile to the PVCs before WebSphere starts (measured below) | — |

## Not validated on Core yet

- **HCL DX IQ** (Lab 3) and its MCP server, the IQ database and the RAG appendix.
- **Search V2** (Lab 4): Core has its own Remote Search option in the chart (`applications.remoteSearch`).
- **People Service**.
- **Keycloak / OIDC** (the Web Engine uses the `WAS_*` session cookie and Liberty OIDC; Core uses WebSphere TAI).
- **ÓRBITA**, the Hello DX Script Application extra and the **Script Application operator**
  ([operator#44](https://github.com/europesip/hcl-dx-scriptapp-operator/issues/44)): dxclient, XMLAccess, WCM, themes.
- **HCL Leap** (Lab 6).
- The CI/CD options (OpenBao + External Secrets, Argo CD, the operator) and Keycloak.

## The Script Application operator on Core

Goal: adapt the operator ([operator#44](https://github.com/europesip/hcl-dx-scriptapp-operator/issues/44)) to the
traditional server: WCM library imports and exports, pages, themes, XMLAccess, Script Applications. What the operator
does today on the Web Engine and what to check on Core:

| Operator today (DX Compose CF239) | On DX Core |
|---|---|
| Context root fixed: `/wps/config`, `/wps/mycontenthandler`, `/wps/wcm/myconnect`, `/wps/dxFileTransfer/dft`, `/wps/portal` (`client.go`, `wcmimport.go`, `theme.go`) | **configurable context root needed**: the container Core of the chart uses `wps` (`networking.core.contextRoot`, default `wps`, home `portal`), but a traditional DX 9.5 on a VM (CF230, AWS) has an **empty** context root: XMLAccess at `https://<host>:10042/config`, WCM REST at `/mycontenthandler/wcmrest/…` |
| Ports through HAProxy (443) | the chart Core is behind HAProxy too; a VM install uses the WebSphere ports (10039 HTTP, 10041/10042 HTTPS, 10202 SOAP for dxclient) |
| Login: Ring API `POST /dx/api/core/v1/auth/login`, falling back to the form login | the Ring API exists only where it is deployed (the chart deploys it with Core and its login answers 200, measured; a VM install has none): use form login (`j_security_check`) / LTPA, Basic for `/config` and WebDAV |
| WCM import: dxFileTransfer + WCM data module (`?MOD=data&taskType=import`) | **`/wps/dxFileTransfer/dft` answers 404 on Core CF239** (measured): files must reach the server another way; the classic way is the WCM *import-wcm-data* ConfigEngine task or the data module with files already on the server disk |
| XMLAccess over HTTP (`/wps/config`) | same protocol, works with Basic on `/wps/config` (measured); the header says `HCL Digital Experience/8.5 build …` instead of `HCL Digital Experience Compose/9.5` (`xmlaccess.sh` is in `<wp_profile>/PortalServer/bin`); different path (context root) and the WebSphere SOAP port for some tasks |
| dxclient (`deploy-scriptapplication`, `deploy-theme`) with `dxConnect` | dxclient supports DX 9.5 Core (it was made for it): `dxConnectHostname/Port` 10202, `dxProfileName` wp_profile, SOAP; check the flags per command |
| Themes: WebDAV `…/mycontenthandler/dav/fs-type1/themes/` | same WebDAV, under the Core context root |
| Pod and service names: `<release>-web-engine-0`, `…-web-engine:9080` (`InternalURL`) | `<release>-core-0`, service `<release>-core` (ports 10039/10041 in the container) |
| DXConnection: no field for the server kind | add `runtime` (`compose` / `core`) and `contextRoot`, defaulted from the namespace label `dx.europesip.com/runtime` |

## Phase 1 test results

See the comments of issue #38 (Derby with and without DAM on the EUROPESIP cluster).
