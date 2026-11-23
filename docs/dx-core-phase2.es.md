# DX Core: qué se configura de otra forma (fase 2)

[English](dx-core-phase2.md)

Desde el issue [#38](https://github.com/europesip/hcl-dx-compose-installer/issues/38) el instalador puede desplegar
**DX Core**, el servidor tradicional de HCL Digital Experience 9.5 sobre WebSphere Application Server, en lugar del
**Web Engine** de DX Compose (`DX_RUNTIME=core`, asistente → *Elige qué instalar* → *Servidor DX*). Los dos salen del
mismo chart (hcl-dx-deployment 2.50.0, CF239).

**Fase 1** (ahora): el portal base (Lab 1), con o sin DAM, sobre **Derby**. Todo lo demás está desactivado con Core.

Esta página recoge lo que Core configura de otra forma que el Web Engine, encontrado al hacer la fase 1. Cada punto
es candidato a la fase 2; nada de esto está hecho todavía.


Todas las diferencias entre DX Core y el Web Engine en una página, con las versiones medidas del producto (Java, WebSphere, Liberty): [DX Core frente al Web Engine](core-vs-webengine.es.md). Opciones de base de datos para los dos: [Bases de datos externas](databases.es.md).

## Encontrado en el chart (hcl-dx-deployment 2.50.0)

| Área | Web Engine (DX Compose) | DX Core | Fase 2 |
|---|---|---|---|
| Imagen | `dx-compose/webengine` | la imagen por defecto del chart, `dx-compose/core`, **no existe** en hclcr.io; la imagen es `dx/core` (`images.names.core`, comprobado el 22-nov-2026) | hecho en la fase 1 (el instalador la pone) |
| Credenciales | un Secret, `security.webEngine.customWebEngineSecret` | tres: `customWpsSecret` (wpsadmin), `customWasSecret` (administrador de WebSphere), `customConfigWizardSecret` (Config Wizard); sin el del Config Wizard el chart falla (`b64enc` de un usuario vacío) | hecho en la fase 1 (mismo usuario y contraseña en los tres) |
| Volúmenes | `volumes.webEngine.customization` + `log` | `volumes.core.profile` (wp_profile, con Derby) + `log` + `tranlog` | hecho en la fase 1 (todos en `SC_RWO`) |
| Host | `networking.webEngine.host` | `networking.core.host` | hecho en la fase 1 |
| Base de datos externa | `configuration.webEngine.useExternalDatabase`, `customDbTypePropertiesSecret`, `customDbDomainPropertiesSecret`: el Web Engine transfiere Derby en el siguiente arranque | **nada en el chart**: ni `useExternalDatabase` ni dbDomain ni dbType para Core, y ninguna lógica de transferencia en `templates/core`. La forma clásica es ConfigEngine dentro del pod (`validate-database`, `database-transfer`) con `wkplc_dbdomain.properties` / `wkplc_dbtype.properties` del perfil | por diseñar: un paso del instalador con ConfigEngine, solo si es reproducible y sobrevive a los reinicios (el perfil está en un PVC) |
| PostgreSQL | soportado por las propiedades del Web Engine (HCL lo está validando) | `wkplc_dbtype.properties` del perfil de Core CF239 **no tiene PostgreSQL** (solo derby, db2, oracle, sqlserver2005, db2_zos, db2_iseries) | Oracle, DB2 o SQL Server para Core; PostgreSQL necesitaría soporte de HCL |
| LDAP | `configuration.webEngine.ldap` → XML `<ldapRegistry>` de Liberty | `configuration.core.ldap` tiene el mismo esquema de valores pero sin `sslEnabled` / `recursiveSearch`, solo `serverType: CUSTOM` documentado, y lo aplica el arranque de Core (ConfigEngine / VMM), no un XML de Liberty | **probado el 22-nov-2026, falla tal cual**: con `configuration.core.ldap` el arranque de Core escribe *LDAP enabled in the helm chart. Skipping admin credential update*, así que el perfil conserva la contraseña de administrador de la imagen mientras los secrets del chart llevan la nuestra; la siguiente tarea de ConfigEngine falla (*Unable to authenticate user of the incoming SOAP request*) y el pod se reinicia. Con LDAP, wpsadmin y el administrador de WebSphere tienen que ser **usuarios del LDAP** (su DN y contraseña en `customWpsSecret` / `customWasSecret`). Fase 2: una cuenta de administrador en el LDAP; LDAPS necesita la CA en el truststore de WebSphere |
| Overrides | `configOverrideFiles`, `customSecrets`, `customTruststoreSecrets`, `propertiesFilesOverrides` | **ninguno** en Core | cada personalización del Lab 2 pasa a ser una tarea de ConfigEngine: `preferredLanguage` (`wp-add-property` en vez de `wplc-add-property`), filtros de Active Directory, login por e-mail, truststore de LDAPS (`wp-modify-ldap-security`, …) |
| Arranque | ~5 min (Liberty) | el primer arranque copia un perfil nuevo y un perfil del Config Wizard a los PVC antes de arrancar WebSphere (medido abajo) | — |

## Aún no validado en Core

- **HCL DX IQ** (Lab 3) y su servidor MCP, la base de datos de IQ y el apéndice de RAG.
- **Search V2** (Lab 4): Core tiene su propia opción Remote Search en el chart (`applications.remoteSearch`).
- **People Service**.
- **Keycloak / OIDC** (el Web Engine usa la cookie de sesión `WAS_*` y OIDC de Liberty; Core usa TAI de WebSphere).
- **ÓRBITA**, el extra de Script Application Hello DX y el **DX Delivery Operator**
  ([operator#44](https://github.com/europesip/dx-delivery-operator/issues/44)): dxclient, XMLAccess, WCM, temas.
- **HCL Leap** (Lab 6).
- Las opciones de CI/CD (OpenBao + External Secrets, Argo CD, el operador) y Keycloak.

## El DX Delivery Operator en Core

Objetivo: adaptar el operador ([operator#44](https://github.com/europesip/dx-delivery-operator/issues/44)) al
servidor tradicional: importación y exportación de librerías WCM, páginas, temas, XMLAccess, Script Applications. Lo que
hace hoy el operador sobre el Web Engine y qué hay que comprobar en Core:

| El operador hoy (DX Compose CF239) | En DX Core |
|---|---|
| Context root fijo: `/wps/config`, `/wps/mycontenthandler`, `/wps/wcm/myconnect`, `/wps/dxFileTransfer/dft`, `/wps/portal` (`client.go`, `wcmimport.go`, `theme.go`) | el mismo `/wps` en el Core en contenedor (`networking.core.contextRoot` y `networking.webEngine.contextRoot` valen `wps` por defecto; medido). El context root **vacío** de un DX 9.5 tradicional en una VM (CF230: `https://<host>:10042/config`, `/mycontenthandler/wcmrest/…`) es una personalización de esa instalación, no una diferencia de Core → el operador necesita un context root configurable en el DXConnection (por defecto `wps`) |
| Puertos a través de HAProxy (443) | el Core del chart también va detrás de HAProxy; una instalación en VM usa los puertos de WebSphere (10039 HTTP, 10041/10042 HTTPS, 10202 SOAP para dxclient) |
| Login: Ring API `POST /dx/api/core/v1/auth/login`, y si no, el login por formulario | la Ring API solo existe donde se despliega (el chart la despliega con Core y su login responde 200, medido; una VM no la tiene): login por formulario (`j_security_check`) / LTPA, Basic para `/config` y WebDAV |
| Importación WCM: dxFileTransfer + data module de WCM (`?MOD=data&taskType=import`) | **`/wps/dxFileTransfer/dft` responde 404 en Core CF239** (medido): los ficheros tienen que llegar al servidor de otra forma; la forma clásica es la tarea de ConfigEngine *import-wcm-data* o el data module con los ficheros ya en el disco del servidor |
| XMLAccess por HTTP (`/wps/config`) | mismo protocolo, funciona con Basic en `/wps/config` (medido); la cabecera dice `HCL Digital Experience/8.5 build …` en vez de `HCL Digital Experience Compose/9.5` (`xmlaccess.sh` está en `<wp_profile>/PortalServer/bin`); otra ruta (context root) y el puerto SOAP de WebSphere para algunas tareas |
| dxclient (`deploy-scriptapplication`, `deploy-theme`) con `dxConnect` | dxclient soporta DX 9.5 Core (se hizo para él): en el Core en contenedor HAProxy envía `/hcl/dxconnect/processHandler` (443) a DXConnect (puerto 10202 del pod core, medido); `dxProfileName` wp_profile; revisar los flags de cada comando |
| Temas: WebDAV `…/mycontenthandler/dav/fs-type1/themes/` | el mismo WebDAV, bajo el context root de Core |
| Nombres de pod y servicio: `<release>-web-engine-0`, `…-web-engine:9080` (`InternalURL`) | `<release>-core-0`, servicio `<release>-core` (puertos 10039/10041 en el contenedor) |
| DXConnection: sin campo para el tipo de servidor | añadir `runtime` (`compose` / `core`) y `contextRoot`, por defecto desde la etiqueta del namespace `dx.europesip.com/runtime` |

### Medido en un DX 9.5 tradicional en una VM (CF230, build 20250923)

Un DX 9.5 CF230 tradicional en AWS (la web pública de **producción** europesip.com: solo operaciones de lectura —
exportaciones, listados, pruebas en seco — salvo que Andrés autorice una importación en un portal virtual o una librería
de pruebas concretos), accesible desde el clúster en `https://<host>:10042` (certificado autofirmado):

- **context root vacío**: XMLAccess en `https://<host>:10042/config` (Basic → 200 con la respuesta de XMLAccess), WCM
  REST en `/mycontenthandler/wcmrest/…`, login por formulario en `/j_security_check` (da la cookie `LtpaToken2`);
- WCM REST con Basic responde 302 al login: necesita la sesión de formulario / LTPA;
- sin Ring API;
- para las pruebas del operador: un Secret con el administrador en el namespace `dxop-core-sergio` (etiquetado
  `dx.europesip.com/runtime=core`).

## Resultados de las pruebas de la fase 1

Ver los comentarios del issue #38 (Derby con y sin DAM en el clúster de EUROPESIP).
