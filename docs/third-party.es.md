# Software de terceros: qué hace el instalador y por qué

[English](third-party.md) · **Español** · [README](../README.es.md)

HCL DX Compose necesita software que HCL no suministra, o funciona mejor con él. El instalador lo despliega para una PoC.
Esta página recoge las **peculiaridades y trucos** que hicieron falta para que cada pieza funcionase con DX **sin romper
nada más**, tal como los encontramos en nuestro clúster de laboratorio (DX Compose CF239). En cada punto se indica dónde
lo aplica el instalador.

## OpenLDAP (chart `openldap-stack-ha` 4.3.3) · etapa 2

- **El LDIF debe incluir la entrada raíz** (`dn: dc=dxdemo,dc=com`). Sin ella, el primer `ldapadd` falla y el LDAP
  arranca vacío.
- **Los grupos son `groupOfUniqueNames` / `uniqueMember`**, que es lo que espera el bloque LDAP nativo del chart de DX
  (tipo `other`).
- **`preferredLanguage` necesita `wplc-add-property`**: el registro de usuarios de DX Compose no lo declara, así que DX no
  lo leería del LDAP. La capa de DX lo añade (`configOverrideFiles`), y tras un cambio hay que reiniciar el Web Engine.
  Las Script Applications como ÓRBITA lo usan para el idioma de cada usuario.
- **Se mantiene el registro básico** (`wpsadmin`): el repositorio federado tiene los dos. `webEngineAdminGroup` **no**
  apunta a un grupo del LDAP: crea un grupo con ese nombre en el registro básico, y dos grupos con el mismo nombre hacen
  fallar a Liberty («multiple entities found»). En su lugar, da el rol de Administrador al grupo del LDAP desde el portal.
- **Las contraseñas de los usuarios de demo** van en el LDIF como hashes `{SSHA}` con sal. Con OpenBao, el hash se
  calcula al instalar a partir de la contraseña guardada en OpenBao.

## PostgreSQL (CloudNativePG 0.29.1, PostgreSQL 18) · etapas 0 y 3

- HCL **aún no soporta** PostgreSQL para el Web Engine. HCL lo está validando, y el script de tablas
  (`setup-postgres-dx.sql`) es una versión preliminar.
- **`max_prepared_transactions` > 0**: DX usa transacciones XA (commit en dos fases).
- **Los tablespaces del JCR** se declaran en el Cluster, cada uno con su volumen.
- **Cambios de contraseña**: los Secrets de los usuarios llevan la etiqueta `cnpg.io/reload: "true"`, así que
  CloudNativePG aplica solo una contraseña nueva. También funciona con OpenBao.
- **En Rancher**, `kubectl get cluster` choca con Cluster API: usa `clusters.postgresql.cnpg.io`.
- Keycloak, ÓRBITA y las sesiones de IQ tienen su propia base de datos y su usuario en el mismo cluster.

## LiteLLM (chart oficial de BerriAI 1.106.5) · etapa 0

- **`LITELLM_BASE_URL` es obligatorio pero no está documentado** en IQ 1.0.2 y 1.0.3. Sin él, el Integrator no envía las
  peticiones a LiteLLM.
- **Los nombres de las herramientas MCP llevan puntos**, y las APIs de Anthropic y OpenAI los rechazan. LiteLLM usa su
  proveedor `anthropic/` (directamente, o a través del endpoint compatible con Anthropic de OpenRouter), que limpia los
  nombres.
- **Los modelos de razonamiento de OpenAI** (gpt-5.x) inyectan `reasoning_effort` y rompen las herramientas de IQ: usa
  Claude.
- **AWS Bedrock**: el ID documentado de Sonnet 4.6 no existe (usa `us.anthropic.claude-sonnet-4-6`). Hay que indicar
  `aws_region_name` y rellenar una vez por cuenta de AWS el formulario «use case details» de Anthropic.
- **Si se acaba el crédito del proveedor**, aparece `PaymentRequiredError` (HTTP 402) en el log de LiteLLM y «An unknown
  error occurred» en el chat de IQ.

## Servidor MCP de EUROPESIP (ejemplo, no es de HCL) · etapa 0, extra

- **Se registra parcheando el ConfigMap del Integrator** (`mcp_server_list`) y reiniciando el Integrator. La variable
  documentada no tiene efecto (caso CS1479102 de HCL).
- Con **Helm 4**, un `helm upgrade` posterior de IQ necesita `--force-conflicts`, porque ese campo pasa a pertenecer a
  `kubectl patch`.
- El Integrator reenvía las cookies de DX del usuario en cada `tools/call`. Con OpenID Connect la cookie de sesión es
  `WAS_n...`; también se reenvía, así que las herramientas del MCP siguen funcionando.

## OpenBao 2.7.2 + External Secrets Operator 2.14.0 · etapa 0, extra

El detalle está en [CI/CD avanzado: OpenBao](openbao.es.md). Las peculiaridades:

- **OpenBao arranca sellado tras cada reinicio**: `./lab-cicd/openbao-unseal.sh` lo desbloquea con 3 de las 5 claves. En
  producción, usa el desbloqueo automático con un KMS o un HSM.
- **`bao status` termina con código 2 mientras está sellado.** Los scripts con `set -o pipefail` no deben pasarlo
  directamente a `grep`; la función auxiliar guarda antes su salida.
- **Ningún secreto en una línea de comandos**: cada valor va por la entrada estándar de `kubectl exec` hasta el CLI `bao`
  del pod. Una clave de desbloqueo se pasa con `bao operator unseal <clave>` dentro del pod, nunca en los argumentos del
  puesto de trabajo.
- **Liberty solo lee los Secrets al arrancar, y el chart de DX los copia**: una contraseña cambiada en OpenBao llega al
  Secret de Kubernetes en 5 minutos como máximo. DX solo la aplica tras un `helm upgrade` de DX (el chart copia
  `web-engine-secret` con `lookup` de Helm a `<release>-web-engine-wps`) y un reinicio del Web Engine.
- **El motor de plantillas de ESO usa `{{ }}`**, así que las llaves literales de un valor con plantilla (como el `}}}` que
  cierra un `.dockerconfigjson`) se escapan como `{{ "}}" }}`.
- **Kubernetes auth**: el rol está ligado a una sola ServiceAccount (`openbao-eso`) y a una sola ruta
  (`dx/<namespace de DX>/*`), de solo lectura. El ClusterSecretStore solo sirve a los namespaces de la instalación.
- **`--cleanup` conserva OpenBao** (guarda los secretos); `--cleanup --all` también lo borra.

## Argo CD 3.6.1 (chart 10.15.0) · etapa 0, extra

- **Se instala desde el chart OCI** `oci://ghcr.io/argoproj/argo-helm/argo-cd`. Las descargas de releases de GitHub
  devolvieron 503 y 504 durante un rato el 8 de noviembre de 2026 (un incidente de GitHub); la copia OCI de ghcr.io siguió
  funcionando.
- **Los health checks de los recursos del operador** se escriben en `argocd-cm` mediante los valores del chart, así que una
  DXScriptApplication aparece como Healthy, Progressing o Degraded según lo que el operador ve en DX.
- **No se crea ninguna Application**: apúntalo a tu propio repositorio.

## Keycloak 26.8.2 (operador oficial) · etapa 0, extra; capa de DX desde la etapa 2

Keycloak federa el **mismo OpenLDAP** que DX (solo lectura), y DX autentica a los usuarios a través de él con el cliente
OpenID Connect de Liberty. Estos son los trucos que hicieron falta para que funcionase sin romper nada:

1. **El operador necesita cinco CRDs**: `keycloaks`, `keycloakrealmimports` y, desde la 26.8, también
   `keycloakoidcclients` y `keycloaksamlclients`. Sin estas dos últimas, el operador se reinicia en bucle («Not Found» en
   sus informers). Su ClusterRoleBinding nombra el namespace `keycloak`: el instalador lo cambia por el namespace
   compartido.
2. **Dos URLs, un único emisor**: el navegador usa la URL pública. DX habla con Keycloak dentro del clúster
   (`http://keycloak-service.<ns>.svc:8080`) gracias a `hostname.backchannelDynamic`, así que DX no necesita la CA de
   Keycloak.
3. **Sin URL de descubrimiento en DX**: Liberty solo acepta un `discoveryEndpointUrl` **HTTPS**, aunque se ponga
   `httpsRequired="false"`. Por eso la capa de DX declara los endpoints: el de autorización en la URL pública, los de token
   y claves dentro del clúster, y el emisor público.
4. **`mapIdentityToRegistryUser="true"`**: el usuario OIDC (`preferred_username` = `uid`) se asocia al usuario del LDAP de
   DX, así que DX conserva sus grupos, sus roles y su `preferredLanguage`. No hacen falta usuarios transitorios.
5. **Liberty cambia el nombre de la cookie de sesión.** Con `openidConnectClient-1.0`, la cookie LTPA se llama
   `WAS_n<hash>` en lugar de `LtpaToken2`, y `ssoCookieName="LtpaToken2"` se ignora (issue 18803 de Open Liberty).
   Consecuencias:
   - el login REST de DX (`/dx/api/core/v1/auth/login`) responde «Login successful» **sin cookie**. Es un componente de
     HCL y convendría preguntarles;
   - todo lo que buscaba `LtpaToken2` por su nombre dejó de funcionar. Nuestro **operador** (0.1.2, interruptor
     `dx.oidcCompatibility`) y **ÓRBITA** (3.1.2, interruptor `dx.oidcSupport`) entran ahora con el formulario de login
     del portal y aceptan la cookie nueva;
   - la Ring API, la API del DAM e IQ aceptan la cookie nueva cuando la reciben.
6. **La API del DAM responde 401 «Token is expired»** si recibe una cookie `LtpaToken2`, o la cookie `WASReqURL` ya
   caducada, junto a la cookie de sesión real. Envía solo la cookie de SSO.
7. **`authFilter`**: quedan fuera de OIDC las URLs que documenta HCL (XMLAccess, seedlist de la búsqueda, Site Builder,
   login de WCM, WebDAV, sindicación y connect) y, además:
   - `/dx/api/core/v1/auth`;
   - la página de login (`nm:oid:wps.Login`), para que `wpsadmin` siga entrando en `/wps/portal/poc?uri=nm:oid:wps.Login`;
   - `j_security_check`;
   - las peticiones con `Authorization: Basic`, que usan DXClient y los scripts.
8. **Las comprobaciones opcionales de IQ** de `install.sh` entran con el formulario del portal cuando Keycloak está
   activado.
9. **Importación del realm**: el realm se crea de forma declarativa (`KeycloakRealmImport`). Sus secretos (contraseña de
   bind del LDAP y secreto del cliente) son placeholders que se leen de Secrets, así que el fichero no contiene
   credenciales. Una importación solo crea el realm; los cambios posteriores se hacen en la consola de administración.
10. **Certificado**: el Ingress de Keycloak usa un certificado autofirmado que crea el paso de instalación. Sustituye el
    Secret `keycloak-tls` por el tuyo; DX no necesita confiar en él.
11. **Cierre de sesión completo**: `redirect.logout`, `redirect.logout.ssl` y `redirect.logout.url` en
    `ConfigService.properties` (paso 4 de la página de HCL, mediante `propertiesFilesOverrides`). «Finalizar sesión» en DX
    va al endpoint de cierre de sesión de Keycloak (`client_id` + `post_logout_redirect_uri`, registrado en el cliente),
    que cierra la sesión de Keycloak y vuelve al portal. Cambiar estas propiedades reinicia el Web Engine.
12. **Tema de login**: por defecto, el tema por defecto de Keycloak (`keycloak.v2`) con su logo, para que se vea
    claramente que se usa Keycloak. Con *Tema de login de EUROPESIP*, se monta desde un ConfigMap (con
    `spec.unsupported.podTemplate` del CR de Keycloak, sin imagen propia) un tema `europesip` que extiende `keycloak.v2`
    (sus variables CSS: logo, colores, fondo). La cabecera usa el `displayNameHtml` del realm (logo + «HCL DX Compose»).
    Keycloak lee los temas al arrancar su pod.

## Descargas durante la instalación

`install.sh` descarga charts y manifiestos de GitHub, de repositorios de Helm y de registros. Desde la 2.3.0 los
reintenta: `retry` repite una descarga (`helm repo add`, `helm pull`, `helm registry login`, `kubectl apply -f
https://...`) hasta 5 veces, y `rhelm` repite un `helm upgrade` solo si falló porque no se pudo descargar el chart (503,
504, «failed to fetch»...), nunca si falló la instalación en sí.

## El propio HCL DX: cosas que conviene saber

- **Para volver a aplicar la configuración de DX, usa el ÚLTIMO paso de DX** de `install.sh`. Cada paso de `helm upgrade`
  de DX lleva solo las capas hasta su etapa. Ejecutar uno anterior por separado (por ejemplo, el del LDAP) quita las capas
  de las etapas siguientes (base de datos, IQ, búsqueda) hasta que se vuelve a ejecutar el último.
- **Helm 4**: `--wait=legacy`. La nueva estrategia watcher aborta cuando DAM falla mientras arranca su base de datos, algo
  normal.
- **Search V2 detrás de un Ingress**: `automatedSetup.haproxyProtocol: https`; si no, los crawlers usan `http` y no
  indexan nada. El File Processor es una dependencia no documentada.
