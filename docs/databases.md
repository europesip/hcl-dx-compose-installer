# External databases

[Español](databases.es.md)

DX starts on **Derby**, a database inside the DX volume that is fine for tests and labs but **not supported for
production**. An external database replaces it. This page explains the options for both DX servers
(Web Engine / DX Compose and DX Core) and what the installer and the operator create in each case. The wizard and
headless options that implement it are tracked in
[#40](https://github.com/europesip/hcl-dx-compose-installer/issues/40); what exists today is marked below.

## The key difference: an instance or schemas inside one

| | What it is | Who owns it |
|---|---|---|
| **Database instance** (server) | a running database server with its own storage, memory, licence and backups: a PostgreSQL cluster, an Oracle database, a SQL Server | the customer's DBA in production; the installer only for tests |
| **Schemas / database / users for DX** | what DX needs **inside** an instance: on Oracle one user (= schema) per DX domain, on SQL Server one database with six schemas, on PostgreSQL one database | created by the installer or the operator with an admin account, or handed over by the DBA |

What creates what:

| Database | Installer (today) | Operator `DXDatabase` |
|---|---|---|
| PostgreSQL | **creates a new instance**: a CloudNativePG `Cluster` in the DX namespace (Lab 2B, and `BASIC_PG` in the basic preset), then the transfer | creates a database and its owner **inside an existing** PostgreSQL |
| Oracle | **creates no instance**: you give the JDBC URL, user and password of **your** Oracle (`ORACLE_JDBC_URL`, `ORACLE_DX_USER`, `ORACLE_DX_PASSWORD`, `ORACLE_CA_FILE`), Web Engine only | creates a user/schema **inside an existing** Oracle (the PDB) |
| SQL Server | not offered yet (#40) | creates a login, a database and its user **inside an existing** SQL Server |

The operator never creates database instances. For Oracle and SQL Server an instance per portal makes no sense in
production (licences, DBA, backups): the normal case is an **existing server**.

## Two modes (#40)

1. **Existing server** — the default for Oracle and SQL Server and the only one for production. The customer gives the
   JDBC URL (and the CA for TLS) and either an **admin account**, so the installer creates the DX schemas and users,
   or **ready-made DX credentials** if their DBA creates them.
2. **Test instance** — demos and labs only. The installer creates a database server in the DX namespace:

| Database | Test instance | Licence | Limits |
|---|---|---|---|
| PostgreSQL | CloudNativePG `Cluster` (as today) | PostgreSQL licence (free) | none |
| Oracle | **Oracle Database 21c Express Edition** (`gvenzl/oracle-xe:21.3.0-slim`; not the `-faststart` images, which fail on an empty volume) | Oracle XE: free, production use allowed | 2 CPU threads, 2 GB RAM, 12 GB of user data |
| SQL Server | **SQL Server 2022 Developer** (`mcr.microsoft.com/mssql/server`) | free, **development and test only, not production**; you accept Microsoft's EULA | none |

## What HCL supports (CF239)

From the [Kubernetes databases page](https://help.hcl-software.com/digital-experience/9.5/CF239/get_started/system_requirements/kubernetes/databases/)
and the [Web Engine database transfer](https://help.hcl-software.com/digital-experience/dx-compose/CF239/deploy_dx/manage/cfg_webengine/external_db_database_transfer/).
All databases need **XA transactions** (two-phase commit).

| Database | DX Core | Web Engine |
|---|---|---|
| Derby | built in, not for production | built in, not for production |
| DB2 | 11.5, 12.1 | yes (sample scripts) |
| Oracle | **19c and 21c** (Amazon RDS 12.2 and 21c). The editions are not named; **23ai is not listed** | 19c and 21c (RDS 19c/21c), AL32UTF8 / AL16UTF16 |
| SQL Server | **Standard and Enterprise** 2017, 2019, 2022 (Express and Developer are not listed) | setup script and sample values; Amazon RDS 2022 |
| PostgreSQL | **not supported** (no entries in the Core profile) | used in our labs; not on the CF239 page |

Editions and licences:

| | Oracle | SQL Server |
|---|---|---|
| Free | **21c XE**: production allowed; 12 GB user data, 2 CPU threads, 2 GB RAM. Version 21c is supported by HCL, the XE edition is not named | **Developer**: all Enterprise features, **not for production**. **Express**: production allowed, 10 GB per database, 1 socket / 4 cores, ~1.4 GB buffer; not named by HCL |
| Paid | Standard Edition 2, Enterprise | Standard, Enterprise |
| No free option | 19c | — |

## How DX moves from Derby to the external database

| | Web Engine | DX Core |
|---|---|---|
| How | **declarative**: `configuration.webEngine.useExternalDatabase: true` + `customDbTypePropertiesSecret` / `customDbDomainPropertiesSecret`; the Web Engine transfers on the next start, once | **only with ConfigEngine** in the pod (directly, or through the Config Wizard UI that runs the same tasks); **nothing in the chart** |
| Steps | `helm upgrade` with the values | create the schemas/users, copy the JDBC driver to the profile volume, `validate-database`, `database-transfer enable-profiles-check-managed package-profiles`, `datasource-enable-fully-materialize-lob-data`, restart the pod; mark it as done so it never runs twice |
| JDBC driver | in the image (`ojdbc11`, `mssql-jdbc`, PostgreSQL) | copy it, Java 8 build: `ojdbc8`, `mssql-jdbc-…jre8` |
| Schemas | one user per domain on Oracle (`release`, `community`, `customization`, `jcr`, `feedback`, `likeminds`) | Oracle: one user per domain + 5 JCR tablespaces + XA grants; SQL Server: one database (case-sensitive collation, `READ_COMMITTED_SNAPSHOT`) with 6 schemas + `sp_sqljdbc_xa_install`; **one data source per domain** |
| Credentials | Secrets referenced by the chart | the Helm parameters come from Secrets; the properties file used by ConfigEngine inside the pod may hold the password while the task runs (use `-DSaveParentProperties=false`, capital S, so it is not copied into `wkplc_dbdomain.properties`); at run time WebSphere keeps it in its J2C aliases (`{xor}`, an encoding) |
| Measured (22-nov-2026, CF239) | ~15 min to PostgreSQL | SQL Server 2022: ~11 min; Oracle 21c XE: ~22.5 min; 465 tables, ~1 GB of data |

## Choosing

- **Production**: an existing Oracle 19c/21c or SQL Server Standard/Enterprise owned by the customer; for the Web
  Engine also PostgreSQL (our labs) once HCL validates it.
- **Demos and labs**: Derby, a CloudNativePG test instance (Web Engine), or Oracle 21c XE as a test instance (both
  runtimes). SQL Server Developer only if the EULA is accepted and it is clearly not production.
- **DX Core with PostgreSQL**: not possible; Core stays on Derby or uses Oracle / SQL Server / DB2.

See also [DX Core vs Web Engine](core-vs-webengine.md).
