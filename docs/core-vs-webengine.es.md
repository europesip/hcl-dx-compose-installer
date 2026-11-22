# DX Core frente al Web Engine (DX Compose)

[English](core-vs-webengine.md)

El instalador puede desplegar dos servidores DX con el mismo chart (hcl-dx-deployment 2.50.0, CF239,
[#38](https://github.com/europesip/hcl-dx-compose-installer/issues/38)):

- **Web Engine**: DX Compose, HCL Digital Experience 9.5 sobre Open Liberty (por defecto);
- **DX Core**: el servidor tradicional de HCL Digital Experience 9.5 sobre WebSphere Application Server
  (`DX_RUNTIME=core`).

Esta página reúne todas las diferencias encontradas. **Medido** quiere decir leído en el clúster de laboratorio de
EUROPESIP el 22-nov-2026 (un Core sobre Oracle 21c XE y un Web Engine sobre Derby, los dos CF239) o en un DX 9.5
CF230 tradicional en una máquina virtual; **documentación** es la de HCL CF239, enlazada en cada fila. Las opciones de
base de datos están en [Bases de datos externas](databases.es.md); lo que sigue abierto en Core, en
[DX Core, fase 2](dx-core-phase2.es.md).

## 1. Versiones del producto (medidas)

| | DX Core | Web Engine |
|---|---|---|
| Imagen (hclcr.io) | `dx/core:v95_CF239_20261103-1617` (la que trae el chart por defecto, `dx-compose/core`, no existe) | `dx-compose/webengine:CF239_20261103-1608` |
| Servidor de aplicaciones | **IBM WebSphere Application Server Network Deployment 9.0.5.29** | **Open Liberty 26.0.0.9** (edición Open, EPL) |
| Java | **IBM SDK, Java Technology Edition 8**: 8.0.8.71 (SR8 FP71), `1.8.0_503`, IBM J9 VM 2.9 / OpenJ9 | **IBM Semeru Runtime Open Edition 21**: `21.0.12.1` LTS, Eclipse OpenJ9 0.61.0 |
| Nivel de Java para tu código | Java 8 (drivers JDBC, portlets y librerías compartidas tienen que funcionar en Java 8: p. ej. `ojdbc8`) | Java 21 (`ojdbc11`) |
| Sistema operativo | Red Hat Enterprise Linux 8.10 | Red Hat Enterprise Linux 9.8 |
| Cabecera del producto (XMLAccess) | `HCL Digital Experience/8.5 build …` (las funciones de 9.5 se instalan sobre la base 8.5: `MP95.product` 9.5.0.0) | `HCL Digital Experience Compose/9.5` |
| Procesos en el pod | **dos JVM**: `WebSphere_Portal` (perfil `wp_profile`) y el **Config Wizard** `server1` (perfil `cw_profile`), más 3 contenedores auxiliares (logs, prerrequisitos) | **una JVM**: el `defaultServer` de Liberty, más 2 auxiliares de logs |
| Puertos en el contenedor | 10032-10049 (portal: 10039 HTTP, 10041/10042 HTTPS, 10033 SOAP), 10200-10210 (Config Wizard, **10202 DXConnect**) | 9080 HTTP, 9443 HTTPS, 10033, 2809, 7276/7286, 9402 |
| Drivers JDBC en la imagen | Derby, DB2 (`db2jcc`); **ni Oracle ni SQL Server**: se copian al volumen del perfil | Derby, DB2 (`db2jcc4`), **Oracle `ojdbc11` 23.6**, **SQL Server `mssql-jdbc` 12.10**, **PostgreSQL 42.7.11** |
| Recursos por defecto (chart) | pide 2 CPU / 4 GiB, límite 4 CPU / 6 GiB | lo mismo |
| Primer arranque | **~20 min** (copia un perfil completo de WebSphere y otro del Config Wizard a los volúmenes) | ~5 min |
| Reinicio con el perfil ya hecho | ~3-3,5 min | unos minutos (Liberty regenera su configuración a partir de los valores) |

## 2. Valores del chart, credenciales y volúmenes

| Área | DX Core | Web Engine |
|---|---|---|
| Interruptor | `applications.core: true`, `applications.webEngine: false` | al revés (lo que pone el instalador por defecto) |
| Credenciales | **tres** Secrets: `security.core.customWpsSecret` (administrador del portal), `customWasSecret` (administrador de WebSphere), `customConfigWizardSecret` (administrador del Config Wizard); sin el último el chart falla | **uno**: `security.webEngine.customWebEngineSecret` |
| Volúmenes | `volumes.core.profile` (todo el `wp_profile`, con Derby dentro), `log`, `tranlog` | `volumes.webEngine.customization`, `log` |
| Host | `networking.core.host` | `networking.webEngine.host` |
| Raíz de contexto | `networking.core.contextRoot`, por defecto `wps` | `networking.webEngine.contextRoot`, por defecto `wps` |
| Overrides | **ninguno**: ni `configOverrideFiles`, ni `customSecrets`, ni `customTruststoreSecrets`, ni `propertiesFilesOverrides` | fragmentos de `server.xml` de Liberty (`configOverrideFiles`), ficheros de propiedades, truststores, secretos extra |
| Dónde vive la configuración | **estado del perfil** en su volumen: una tarea de ConfigEngine se ejecuta una vez y se queda; un `helm upgrade` no la deshace | **declarativa**: se regenera desde los valores del chart en cada arranque |

## 3. Herramientas

| Herramienta | DX Core | Web Engine |
|---|---|---|
| **ConfigEngine** | sí, en el pod (`/opt/HCL/wp_profile/ConfigEngine`; `containerConfigEngine.sh` pausa las sondas, [documentación](https://help.hcl-software.com/digital-experience/9.5/CF239/deployment/manage/container_configuration/run_core_config_engine/)). Casi toda la configuración es una tarea de ConfigEngine | **no existe** ([documentación](https://help.hcl-software.com/dx-compose/9.5/CF239/deploy_dx/manage/working_with_compose/dxclient/)): lo que en Core es una tarea, aquí es un valor del chart o una llamada REST |
| **Config Wizard** (interfaz web) | sí (`cw_profile`, puertos 10200/10203): asistentes guiados que ejecutan ConfigEngine (transferencia de base de datos, LDAP, portales virtuales…) | no |
| **DXClient** | todos los comandos ([documentación](https://help.hcl-software.com/digital-experience/9.5/CF239/extend_dx/development_tools/dxclient/dxclient_commands/)); varios van por **DXConnect** (servlet del servidor del Config Wizard, puerto 10202, `/hcl/dxconnect/processHandler`) y ejecutan tareas de ConfigEngine en el servidor | solo las [operaciones soportadas](https://help.hcl-software.com/dx-compose/9.5/CF239/deploy_dx/manage/working_with_compose/dxclient/) («all other DXClient operations are not supported at this time»); es la herramienta común de los dos y va creciendo hacia las tareas de ConfigEngine |
| **XMLAccess** | `xmlaccess.sh` (`<wp_profile>/PortalServer/bin`) y el servlet HTTP `/wps/config` | `xmlaccess.sh` dentro del contenedor, el servlet `/wps/config` y `dxclient xmlaccess` (lo recomendado desde fuera) |
| Lo que XMLAccess **no** cubre | librerías WCM, DAM, LDAP, base de datos | lo mismo |
| **wsadmin** | sí (scripting de WebSphere: truststores, alias J2C, resource environment providers) | no (Liberty se configura con `server.xml`) |

## 4. LDAP

| | DX Core | Web Engine |
|---|---|---|
| Valores del chart | `configuration.core.ldap`: mismo esquema y mismas claves `core.config.ldap_*` | `configuration.webEngine.ldap` |
| Cómo se aplica | ConfigEngine **una vez** en el arranque (`wp-create-ldap` y compañía); después es estado del perfil y cambiar los valores ya no hace nada | un `<ldapRegistry>` de Liberty generado en **cada** arranque |
| Secret del bind (`customLdapSecret`) | **valores codificados en base64 dos veces** (fallo del chart 2.50.0, no documentado: la imagen los vuelve a decodificar); la imagen pone `cn=` delante de `bindUser`, así que no sirve un usuario de bind que no sea `cn=…` | Secret normal, DN completo |
| Credenciales de administrador con LDAP | documentado: con LDAP en el chart, las credenciales de `security.core` **no se aplican**; tienen que ser las de un administrador del LDAP. Instalar con LDAP y una contraseña nueva de wpsadmin falla (autenticación SOAP): instalar sin LDAP y luego hacer el upgrade | el administrador de Liberty sigue funcionando |
| LDAPS | sin valor en el chart: importar la CA con wsadmin (`addSignerCertificate`, `NodeDefaultTrustStore`) y `wp-update-federated-ldap` con el puerto 636 y `sslEnabled=true` (la primera vez falla mientras ConfigEngine refresca `etc/trust.p12`; se repite) | `sslEnabled: true` + `customTruststoreSecrets` |
| Login por e-mail | `wp-update-federated-ldap -Dfederated.ldap.loginProperties=uid;mail` | `configOverrideFiles` con `<loginProperty name="mail"/>` |
| `preferredLanguage` | `wp-add-property` | `wplc-add-property` + reinicio |
| Lo que aconseja HCL | la opción LDAP del chart «is quite limited; for more complex configurations use the Config Wizard» ([documentación](https://help.hcl-software.com/digital-experience/9.5/CF239/deployment/install/container/helm_deployment/preparation/optional_tasks/optional_configure_apps/#supported-ldap-configuration)) | [Configuring LDAP](https://help.hcl-software.com/dx-compose/9.5/CF239/deploy_dx/manage/cfg_webengine/ldap_configuration/) |
| Medido | sin y con SSL, por uid y por e-mail: todo funciona (con ConfigEngine) | todo funciona (laboratorios) |

## 5. Base de datos

Resumen; el detalle está en [Bases de datos externas](databases.es.md).

| | DX Core | Web Engine |
|---|---|---|
| Soportadas (CF239) | DB2 11.5/12.1, Oracle 19c/21c, SQL Server Standard/Enterprise 2017-2022, Derby (no para producción). **Sin PostgreSQL** | Derby, DB2, Oracle 19c/21c; SQL Server (script de preparación, valores de ejemplo, RDS 2022); PostgreSQL en nuestros laboratorios |
| Cómo se transfiere desde Derby | **solo con ConfigEngine** en el pod, directamente o a través de la interfaz del Config Wizard, que ejecuta las mismas tareas: `validate-database`, `database-transfer enable-profiles-check-managed package-profiles`, `datasource-enable-fully-materialize-lob-data` y un reinicio. **El chart no tiene nada** para esto | **declarativa**: `useExternalDatabase` + `customDbTypePropertiesSecret` / `customDbDomainPropertiesSecret`; el Web Engine transfiere en el siguiente arranque |
| Driver JDBC | no viene en la imagen: se copia al volumen del perfil, versión para Java 8 (`ojdbc8`, `mssql-jdbc …jre8`) | en la imagen (`ojdbc11`, `mssql-jdbc`, PostgreSQL) |
| Fuentes de datos | una por dominio cuando cada dominio tiene su usuario (`wpreldbDS`, `wpcustdbDS`, `wpcommdbDS`, `wpjcrdbDS`, `wpfdbkdbDS`, `wplmdbDS`); Derby comparte una (`wpdbDS`) | se generan desde las propiedades |
| Contraseña en ejecución | alias de autenticación J2C en `security.xml`, `{xor}` (una codificación, no un cifrado: lo normal en WebSphere) | configuración de Liberty desde los Secrets |
| Transferencia medida | SQL Server 2022: ~11 min; Oracle 21c XE: ~22,5 min (2 hilos de CPU); 465 tablas, ~1 GB | ~15 min a PostgreSQL (laboratorios) |

## 6. Importar y exportar

| | DX Core | Web Engine |
|---|---|---|
| Subir y bajar ficheros al servidor | **DXConnect** (`?requestMethod=upload` / `download`), con tres credenciales: administrador de DX (`DXAuth`), de WebSphere (`DXWASAuth`) y del Config Wizard. En una máquina virtual el servidor del Config Wizard tiene que estar **arrancado** | **dxFileTransfer** (`/wps/dxFileTransfer/dft`, Basic); en Core responde **404** |
| Exportar una librería WCM | DXConnect `exportWCMLibrary` (ejecuta `export-wcm-data`): un **tar sin comprimir llamado `.tar.gz`**, una carpeta por librería (`WCM_Library-<hora>/<librería>/…`); o ConfigEngine `export-wcm-data` en el servidor | módulo de datos de WCM (`/wps/wcm/myconnect?MOD=data&taskType=export`) a una carpeta y descarga con dxFileTransfer |
| Importar una librería WCM | DXConnect `upload` + `importWCMLibrary` (ejecuta `import-wcm-data`): **solo acepta su propio tar**; un zip plano falla | módulo de datos `taskType=import` o `import-copy` sobre un zip |
| Importar como copia (IDs nuevos) | **no** (`import-wcm-data` no tiene modo copia) | sí (`import-copy`) |
| Formato WCM | la misma exportación JCR (`554ee7f5/423dc4e4/<librería>/…`): lo que exporta uno lo importa el otro (medido en los dos sentidos) | igual |
| Páginas, portlets, portales virtuales, URL mappings | XMLAccess, mismo esquema | igual |
| Portlets clonados (`$cloned`, p. ej. un Web Content Viewer) | tienen que viajar con su definición en la exportación; si no, la importación falla con `EJPXA0240E` | igual |
| Ficheros del tema | WebDAV `…/mycontenthandler/dav/fs-type1/themes/` | igual |
| Registro de temas y skins | XMLAccess; las exportaciones de CF antiguos pueden traer `localedata locale=""` vacío y `<skin action="locate">` repetidos que rompen la importación (`NullPointerException`, `EJPXA0140E`): hay que limpiarlos | el mismo XMLAccess |
| Script Applications | DXClient `deploy-scriptapplication` (por DXConnect) | DXClient `deploy-scriptapplication` |
| DAM | el mismo servicio de DAM (opcional en el chart) | igual |
| Lista de portales virtuales (`PortalVPHandler`) | funciona en el Core en contenedor; en una máquina virtual CF230 respondió vacía | funciona |

## 7. Login, APIs y URLs

| | DX Core | Web Engine |
|---|---|---|
| Ring API (`/dx/api/core/v1/auth/login`) | solo si la despliega el chart (lo hace con Core); una instalación en máquina virtual no la tiene | sí |
| Login por formulario | `j_security_check` → `LtpaToken2` | sí |
| WCM REST con Basic | redirige al login: necesita la sesión LTPA | funciona con la sesión de la Ring API |
| Cookie de sesión | `JSESSIONID` + LTPA | cookie `WAS_*` de Liberty (importa para OIDC y People Service) |
| OIDC / Keycloak | TAI de WebSphere (sin validar aún) | OIDC de Liberty (validado en los laboratorios) |
| Raíz de contexto | `/wps` con el chart; **una raíz vacía en una máquina virtual** (`/config`, `/mycontenthandler`) es una personalización de esa instalación | `/wps` |
| Pod y servicio | `<release>-core-0`, servicio `<release>-core` (10039/10041) | `<release>-web-engine-0`, servicio `<release>-web-engine` (9080) |

## 8. Sin validar aún en Core

HCL DX IQ y su servidor MCP, Search V2 (Core tiene su propia opción Remote Search), People Service, Keycloak/OIDC,
HCL Leap, ÓRBITA, el extra Hello DX Script Application y las opciones de CI/CD (OpenBao + External Secrets, Argo CD).
Ver [DX Core, fase 2](dx-core-phase2.es.md).
