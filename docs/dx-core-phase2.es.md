# DX Core: qué se configura de otra forma (fase 2)

[English](dx-core-phase2.md)

Desde el issue [#38](https://github.com/europesip/hcl-dx-compose-installer/issues/38) el instalador puede desplegar
**DX Core**, el servidor tradicional de HCL Digital Experience 9.5 sobre WebSphere Application Server, en lugar del
**Web Engine** de DX Compose (`DX_RUNTIME=core`, asistente → *Elige qué instalar* → *Servidor DX*). Los dos salen del
mismo chart (hcl-dx-deployment 2.50.0, CF239).

**Fase 1** (ahora): el portal base (Lab 1), con o sin DAM, sobre **Derby**. Todo lo demás está desactivado con Core.

Esta página recoge lo que Core configura de otra forma que el Web Engine, encontrado al hacer la fase 1. Cada punto
es candidato a la fase 2; nada de esto está hecho todavía.

## Encontrado en el chart (hcl-dx-deployment 2.50.0)

| Área | Web Engine (DX Compose) | DX Core | Fase 2 |
|---|---|---|---|
| Imagen | `dx-compose/webengine` | la imagen por defecto del chart, `dx-compose/core`, **no existe** en hclcr.io; la imagen es `dx/core` (`images.names.core`, comprobado el 22-nov-2026) | hecho en la fase 1 (el instalador la pone) |
| Credenciales | un Secret, `security.webEngine.customWebEngineSecret` | tres: `customWpsSecret` (wpsadmin), `customWasSecret` (administrador de WebSphere), `customConfigWizardSecret` (Config Wizard); sin el del Config Wizard el chart falla (`b64enc` de un usuario vacío) | hecho en la fase 1 (mismo usuario y contraseña en los tres) |
| Volúmenes | `volumes.webEngine.customization` + `log` | `volumes.core.profile` (wp_profile, con Derby) + `log` + `tranlog` | hecho en la fase 1 (todos en `SC_RWO`) |
| Host | `networking.webEngine.host` | `networking.core.host` | hecho en la fase 1 |
| Base de datos externa | `configuration.webEngine.useExternalDatabase`, `customDbTypePropertiesSecret`, `customDbDomainPropertiesSecret`: el Web Engine transfiere Derby en el siguiente arranque | **nada en el chart**: ni `useExternalDatabase` ni dbDomain ni dbType para Core, y ninguna lógica de transferencia en `templates/core`. La forma clásica es ConfigEngine dentro del pod (`validate-database`, `database-transfer`) con `wkplc_dbdomain.properties` / `wkplc_dbtype.properties` del perfil | por diseñar: un paso del instalador con ConfigEngine, solo si es reproducible y sobrevive a los reinicios (el perfil está en un PVC) |
| PostgreSQL | soportado por las propiedades del Web Engine (HCL lo está validando) | `wkplc_dbtype.properties` del perfil de Core CF239 **no tiene PostgreSQL** (solo derby, db2, oracle, sqlserver2005, db2_zos, db2_iseries) | Oracle, DB2 o SQL Server para Core; PostgreSQL necesitaría soporte de HCL |
| LDAP | `configuration.webEngine.ldap` → XML `<ldapRegistry>` de Liberty | `configuration.core.ldap` tiene el mismo esquema de valores pero sin `sslEnabled` / `recursiveSearch`, solo `serverType: CUSTOM` documentado, y lo aplica el arranque de Core (ConfigEngine / VMM), no un XML de Liberty | probar el bloque nativo; LDAPS necesita la CA en el truststore de WebSphere |
| Overrides | `configOverrideFiles`, `customSecrets`, `customTruststoreSecrets`, `propertiesFilesOverrides` | **ninguno** en Core | cada personalización del Lab 2 pasa a ser una tarea de ConfigEngine: `preferredLanguage` (`wp-add-property` en vez de `wplc-add-property`), filtros de Active Directory, login por e-mail, truststore de LDAPS (`wp-modify-ldap-security`, …) |
| Arranque | ~5 min (Liberty) | el primer arranque copia un perfil nuevo y un perfil del Config Wizard a los PVC antes de arrancar WebSphere (medido abajo) | — |

## Aún no validado en Core

- **HCL DX IQ** (Lab 3) y su servidor MCP, la base de datos de IQ y el apéndice de RAG.
- **Search V2** (Lab 4): Core tiene su propia opción Remote Search en el chart (`applications.remoteSearch`).
- **People Service**.
- **Keycloak / OIDC** (el Web Engine usa la cookie de sesión `WAS_*` y OIDC de Liberty; Core usa TAI de WebSphere).
- **ÓRBITA**, el extra de Script Application Hello DX y el **operador de Script Applications**
  ([operator#44](https://github.com/europesip/hcl-dx-scriptapp-operator/issues/44)): dxclient, XMLAccess, WCM, temas.
- **HCL Leap** (Lab 6).
- Las opciones de CI/CD (OpenBao + External Secrets, Argo CD, el operador) y Keycloak.

## Resultados de las pruebas de la fase 1

Ver los comentarios del issue #38 (Derby con y sin DAM en el clúster de EUROPESIP).
