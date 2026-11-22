# Bases de datos externas

[English](databases.md)

DX arranca con **Derby**, una base de datos dentro del volumen de DX que sirve para pruebas y laboratorios pero **no
está soportada en producción**. Una base de datos externa la sustituye. Esta página explica las opciones para los dos
servidores DX (Web Engine / DX Compose y DX Core) y qué crean el instalador y el operador en cada caso. Las opciones
del asistente y del modo headless que lo implementan están en
[#40](https://github.com/europesip/hcl-dx-compose-installer/issues/40); abajo se indica lo que ya existe hoy.

## La diferencia clave: una instancia o esquemas dentro de una

| | Qué es | De quién es |
|---|---|---|
| **Instancia de base de datos** (servidor) | un servidor de base de datos en marcha, con su almacenamiento, memoria, licencia y copias: un clúster de PostgreSQL, una base de datos Oracle, un SQL Server | del DBA del cliente en producción; del instalador solo para pruebas |
| **Esquemas / base de datos / usuarios de DX** | lo que DX necesita **dentro** de una instancia: en Oracle un usuario (= esquema) por dominio de DX, en SQL Server una base de datos con seis esquemas, en PostgreSQL una base de datos | los crea el instalador o el operador con una cuenta de administrador, o los entrega el DBA |

Qué crea cada uno:

| Base de datos | Instalador (hoy) | `DXDatabase` del operador |
|---|---|---|
| PostgreSQL | **crea una instancia nueva**: un `Cluster` de CloudNativePG en el namespace de DX (Lab 2B y `BASIC_PG` del portal básico) y después transfiere | crea una base de datos y su propietario **dentro de un** PostgreSQL **que ya existe** |
| Oracle | **no crea ninguna instancia**: pide la URL JDBC, el usuario y la contraseña de **tu** Oracle (`ORACLE_JDBC_URL`, `ORACLE_DX_USER`, `ORACLE_DX_PASSWORD`, `ORACLE_CA_FILE`); solo Web Engine | crea un usuario/esquema **dentro de un** Oracle **que ya existe** (la PDB) |
| SQL Server | todavía no se ofrece (#40) | crea un login, una base de datos y su usuario **dentro de un** SQL Server **que ya existe** |

El operador nunca crea instancias de base de datos. Con Oracle y SQL Server no tiene sentido una instancia por portal
en producción (licencias, DBA, copias): lo normal es un **servidor que ya existe**.

## Dos modos (#40)

1. **Servidor existente**: el modo por defecto para Oracle y SQL Server y el único para producción. El cliente da la
   URL JDBC (y la CA si hay TLS) y o bien una **cuenta de administrador**, para que el instalador cree los esquemas y
   usuarios de DX, o bien **las credenciales de DX ya creadas** si las crea su DBA.
2. **Instancia de pruebas**: solo demos y laboratorios. El instalador crea un servidor de base de datos en el
   namespace de DX:

| Base de datos | Instancia de pruebas | Licencia | Límites |
|---|---|---|---|
| PostgreSQL | `Cluster` de CloudNativePG (como hoy) | licencia de PostgreSQL (gratuita) | ninguno |
| Oracle | **Oracle Database 21c Express Edition** (`gvenzl/oracle-xe:21.3.0-slim`; no las imágenes `-faststart`, que fallan con un volumen vacío) | Oracle XE: gratuita, se puede usar en producción | 2 hilos de CPU, 2 GB de RAM, 12 GB de datos de usuario |
| SQL Server | **SQL Server 2022 Developer** (`mcr.microsoft.com/mssql/server`) | gratuita, **solo desarrollo y pruebas, no producción**; hay que aceptar el EULA de Microsoft | ninguno |

## Qué soporta HCL (CF239)

Según la [página de bases de datos de Kubernetes](https://help.hcl-software.com/digital-experience/9.5/CF239/get_started/system_requirements/kubernetes/databases/)
y la [transferencia de base de datos del Web Engine](https://help.hcl-software.com/digital-experience/dx-compose/CF239/deploy_dx/manage/cfg_webengine/external_db_database_transfer/).
Todas necesitan **transacciones XA** (two-phase commit).

| Base de datos | DX Core | Web Engine |
|---|---|---|
| Derby | incluida, no para producción | incluida, no para producción |
| DB2 | 11.5, 12.1 | sí (scripts de ejemplo) |
| Oracle | **19c y 21c** (Amazon RDS 12.2 y 21c). No nombra ediciones; **23ai no está en la lista** | 19c y 21c (RDS 19c/21c), AL32UTF8 / AL16UTF16 |
| SQL Server | **Standard y Enterprise** 2017, 2019, 2022 (Express y Developer no aparecen) | script de preparación y valores de ejemplo; Amazon RDS 2022 |
| PostgreSQL | **no soportado** (no hay entradas en el perfil de Core) | lo usamos en los laboratorios; no aparece en la página de CF239 |

Ediciones y licencias:

| | Oracle | SQL Server |
|---|---|---|
| Gratuita | **21c XE**: producción permitida; 12 GB de datos de usuario, 2 hilos de CPU, 2 GB de RAM. HCL soporta la versión 21c, pero no nombra la edición XE | **Developer**: todas las funciones de Enterprise, **no para producción**. **Express**: producción permitida, 10 GB por base de datos, 1 procesador / 4 núcleos, ~1,4 GB de caché; HCL no la nombra |
| De pago | Standard Edition 2, Enterprise | Standard, Enterprise |
| Sin opción gratuita | 19c | — |

## Cómo pasa DX de Derby a la base de datos externa

| | Web Engine | DX Core |
|---|---|---|
| Cómo | **declarativa**: `configuration.webEngine.useExternalDatabase: true` + `customDbTypePropertiesSecret` / `customDbDomainPropertiesSecret`; el Web Engine transfiere en el siguiente arranque, una vez | **solo con ConfigEngine** en el pod (directamente o con la interfaz del Config Wizard, que ejecuta las mismas tareas); **el chart no tiene nada** |
| Pasos | `helm upgrade` con los valores | crear los esquemas y usuarios, copiar el driver JDBC al volumen del perfil, `validate-database`, `database-transfer enable-profiles-check-managed package-profiles`, `datasource-enable-fully-materialize-lob-data`, reiniciar el pod; marcarlo como hecho para que no se repita |
| Driver JDBC | en la imagen (`ojdbc11`, `mssql-jdbc`, PostgreSQL) | se copia, versión para Java 8: `ojdbc8`, `mssql-jdbc-…jre8` |
| Esquemas | en Oracle un usuario por dominio (`release`, `community`, `customization`, `jcr`, `feedback`, `likeminds`) | Oracle: un usuario por dominio + 5 tablespaces de JCR + permisos XA; SQL Server: una base de datos (colación sensible a mayúsculas, `READ_COMMITTED_SNAPSHOT`) con 6 esquemas + `sp_sqljdbc_xa_install`; **una fuente de datos por dominio** |
| Credenciales | Secrets referenciados por el chart | los parámetros de Helm salen de Secrets; el fichero de propiedades que usa ConfigEngine dentro del pod puede llevar la contraseña mientras dura la tarea (con `-DSaveParentProperties=false`, con S mayúscula, para que no se copie a `wkplc_dbdomain.properties`); en ejecución WebSphere la guarda en sus alias J2C (`{xor}`, una codificación) |
| Medido (22-nov-2026, CF239) | ~15 min a PostgreSQL | SQL Server 2022: ~11 min; Oracle 21c XE: ~22,5 min; 465 tablas, ~1 GB de datos |

## Cómo elegir

- **Producción**: un Oracle 19c/21c o un SQL Server Standard/Enterprise que ya tenga el cliente; para el Web Engine
  también PostgreSQL (nuestros laboratorios) cuando HCL lo valide.
- **Demos y laboratorios**: Derby, una instancia de pruebas de CloudNativePG (Web Engine) u Oracle 21c XE como
  instancia de pruebas (los dos servidores). SQL Server Developer solo si se acepta el EULA y queda claro que no es
  producción.
- **DX Core con PostgreSQL**: no es posible; Core se queda en Derby o usa Oracle / SQL Server / DB2.

Ver también [DX Core frente al Web Engine](core-vs-webengine.es.md).
