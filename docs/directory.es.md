# El directorio: OpenLDAP de demo, tu LDAP o Active Directory

[English](directory.md)

La etapa 2 del asistente (*Despliegue › Personalizado*) elige quién entra en DX:

| Opción | Qué hace la carpeta |
|---|---|
| **OpenLDAP con usuarios de demo** (por defecto) | Instala el OpenLDAP de los labs (usuarios de demo andres, macarena…) en el namespace compartido, como antes. No cambia nada |
| **Tu LDAP** | Usa un directorio LDAP que **ya existe**. No se instala ningún OpenLDAP |
| **Tu Active Directory** | Lo mismo, con los valores por defecto de Microsoft Active Directory |
| **Sin directorio** | Solo `wpsadmin` (el registro básico del chart) |

Con *Tu LDAP* o *Tu Active Directory*, DX, Keycloak (si está activado) y el rol Administrator usan tu directorio, e
`install.sh` prueba la conexión **antes** de instalar DX. El webinar usa siempre el OpenLDAP de demo. DX Core aún no
tiene directorio (fase 1).

## Qué pide el asistente

Cada valor vacío toma el de por defecto del tipo de directorio (*Más ajustes del directorio* los muestra). Cada uno es
también una clave del [modo headless](headless.es.md).

| Campo | Clave | Por defecto en LDAP | Por defecto en Active Directory |
|---|---|---|---|
| Servidor, puerto | `DIR_HOST`, `DIR_PORT` | puerto 636 con LDAPS, 389 sin él | igual |
| LDAPS (recomendado) | `DIR_SSL` | activado | activado |
| Fichero de la CA del directorio | `DIR_CA_FILE` (o `DIR_CA_SECRET`) | ninguno: una CA en la que Java ya confía | igual |
| DN base, usuarios bajo, grupos bajo | `DIR_BASE_DN`, `DIR_USER_BASE`, `DIR_GROUP_BASE` | usuarios y grupos bajo el DN base | igual |
| Cuenta de bind (solo lectura) | `DIR_BIND_DN` (o `DIR_BIND_SECRET`) | | un DN o `usuario@dominio` |
| Los usuarios entran con | `DIR_LOGIN_ATTR` | `uid` | `sAMAccountName` |
| Clase de usuarios / grupos, atributo de miembro | `DIR_USER_CLASS`, `DIR_GROUP_CLASS`, `DIR_MEMBER_ATTR` | `inetOrgPerson`, `groupOfUniqueNames`, `uniqueMember` | `user`, `group`, `member` |
| Grupo de administradores (DN) | `DIR_ADMIN_GROUP` | ninguno: solo wpsadmin es administrador | igual |
| Imagen de la prueba de conexión | `DIR_TEST_IMAGE` | `docker.io/jpgouin/openldap:2.6.9-fix` (la del OpenLDAP de los labs) | igual |
| Papeles de la demo de ÓRBITA | `ORBITA_DEMO_PEOPLE` | nadie de tu directorio | igual |

Como atributo de login también se ofrecen `mail` y `userPrincipalName` (o cualquier otro nombre de atributo).

## La contraseña de bind nunca está en la carpeta

La contraseña de la cuenta de bind **no** se escribe en el asistente y **nunca se guarda** en el zip:

- el paso *Tu directorio: la cuenta de bind* de `install.sh` la pide con entrada oculta, o lee la variable de entorno
  `DIR_BIND_PASSWORD` (ejecuciones desatendidas, un Job), y crea el Secret `dx-ldap-bind` (`bindUser`,
  `bindPassword`, las claves que espera el chart) en el namespace de DX. Si el paso se repite, se conserva el Secret que
  ya exista, salvo que se dé `DIR_BIND_PASSWORD`;
- con **Usar el gestor de secretos (OpenBao)** se guarda una vez en OpenBao (`dx/<DX_NS>/ad bindPassword`, la pide
  `lab-cicd/openbao-secrets.sh` o la toma de `DIR_BIND_PASSWORD`) y External Secrets Operator crea `dx-ldap-bind`
  (`lab-directory/secrets.yaml` es un ExternalSecret);
- o el Secret ya existe (`DIR_BIND_SECRET`, por ejemplo hecho por un ExternalSecret): no se pide nada, el paso solo
  comprueba que está.

La CA del directorio va al Secret `dx-directory-ca` (desde `DIR_CA_FILE`), o se indica uno que ya exista en
`DIR_CA_SECRET`.

## Qué se genera

`lab-directory/` en lugar de `lab-ldap/`:

- **`custom-values.directory.yaml`**, la capa de DX, que se añade a cada `helm upgrade` de DX desde la etapa 2:
  - el **bloque LDAP nativo** del chart hcl-dx-deployment: `configuration.webEngine.ldap` con `type: other`, el
    servidor, el puerto, `sslEnabled`, `suffix` (DN base), `serverType` (`Custom`, o `Microsoft Active Directory`) y
    `customLdapSecret: dx-ldap-bind`; wpsadmin (registro básico) sigue funcionando;
  - LDAPS: `customTruststoreSecrets` con la CA del directorio;
  - la propiedad `preferredLanguage` (`wplc-add-property`), como con el OpenLDAP de demo;
  - **solo cuando tu directorio no tiene la forma que espera el chart** (el chart escribe su registro LDAP para `uid`,
    `inetOrgPerson` y `groupOfUniqueNames`, sin ningún valor para cambiarlo): `directory-registry.xml`, un
    configuration override que amplía el registro del chart (mismo id, `ldap`) con tus filtros, clases de objeto,
    atributo de miembro, bases de búsqueda y atributo de login. En Active Directory además ignora los referrals y
    asigna `sAMAccountName` (o `userPrincipalName`) al nombre corto de DX (`uid`), con los grupos por `memberOf` /
    `member`. El login por e-mail añade `<loginProperty name="mail"/>` junto a `uid`, como con el OpenLDAP de demo.
- **`ldap-test-pod.yaml`**, la prueba de conexión (paso *Comprobar la conexión con tu directorio*, etapa 0, antes de
  DX). Un pod temporal con `ldapsearch` usa el mismo Secret y la misma CA que DX. Hace el bind, lee el DN base, muestra
  hasta tres usuarios con el atributo de login y lee el grupo de administradores. No escribe nada, se borra al acabar,
  y el paso detiene la instalación si la prueba falla (`./install.sh --from <paso>` tras corregirlo).
- **`admin-role.xml`** (con `DIR_ADMIN_GROUP`): una petición XMLAccess que da el rol **Administrator**, sobre el
  recurso virtual PORTAL, a ese grupo, justo después de conectar DX al directorio. Sin él, el RUNBOOK explica cómo
  hacerlo en *Resource Permissions*.

**Keycloak** (CI/CD avanzado, si está activado) federa el mismo directorio: User Federation `ldap`, en solo lectura,
importado al iniciar sesión, proveedor `ad` para Active Directory (`objectGUID`, paginación) u `other`, los usuarios de
la base de usuarios con el atributo de login como nombre de usuario de Keycloak (el mismo nombre que encuentra DX, así
el usuario OIDC es el usuario LDAP de DX). `install.sh` copia la cuenta de bind a `keycloak-ldap-bind` en el namespace
compartido, y el CR de Keycloak confía en la CA del directorio (`truststores`).

**ÓRBITA** (etapa 6) cuenta su historia de demo con papeles que hacen usuarios de DX. Con tu propio directorio, los
usuarios de los labs (andres, macarena…) **no** reciben esos papeles: los recibiría una persona real con el mismo uid.
Cada papel conserva el usuario ficticio de ÓRBITA y RR. HH. es `wpsadmin`, salvo que `ORBITA_DEMO_PEOPLE` diga quién de
tu directorio hace cada papel (JSON, p. ej. `{"ventas-1": {"uid": "jdoe"}}`). La pregunta a IQ sobre ÓRBITA se hace como
`wpsadmin`.

**People Service, IQ y Search** no necesitan cambios: estos labs no instalan People Service, el rastreador de personas
de Search está apagado, e IQ usa la sesión de DX de quien entra.

## Qué está comprobado

- El bloque LDAP nativo con un Secret, LDAPS con `customTruststoreSecrets`, `preferredLanguage` y el login por e-mail
  (`loginProperty`) se comprobaron en DX Compose CF239 contra un OpenLDAP (el de los labs y el OpenLDAP corporativo de
  EUROPESIP).
- El override con otros filtros y clases de objeto y los valores de Active Directory siguen las reglas de fusión de la
  configuración de Open Liberty y la documentación de HCL (*DX Compose CF239 › Configuring LDAP*), pero **aún no** se han
  probado contra un Active Directory real: revisa el paso de prueba y un primer inicio de sesión antes de confiar en ellos.

## Headless y el preset basic

Las mismas claves sirven en el [modo headless](headless.es.md) con `dir: "ldap"` o `dir: "ad"` (no con el webinar). El
preset basic conserva `BASIC_LDAP_HOST`, `BASIC_LDAP_PORT`, `BASIC_LDAP_SUFFIX` y `BASIC_LDAP_SECRET` (#35) y ahora
también acepta `dir` con las claves `DIR_*`; el bloque va en `lab-base` (una sola instalación) y la prueba de conexión se
ejecuta antes de DX. Las claves de Active Directory de antes (`AD_HOST`, `AD_PORT`, `AD_BASE_DN`, `AD_BIND_USER`,
`AD_CA_FILE`) se siguen leyendo si las `DIR_*` están vacías; `AD_BIND_PASSWORD` ya no se escribe en ninguna parte.
