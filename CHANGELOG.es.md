# Historial de versiones

[English](CHANGELOG.md) · **Español**

Para volver a una versión anterior, ejecuta su imagen (`ghcr.io/europesip/hcl-dx-compose-installer:<versión>`) o su chart
(`helm upgrade dx-installer oci://ghcr.io/europesip/charts/hcl-dx-compose-installer --version <versión> --reuse-values`,
con `image.tag` en esa versión si la fijaste). Las opciones nuevas vienen desactivadas: sin ellas, la instalación generada
es la misma que en la 2.0.x.

## 2.7.0 · 2026-11-10 · CAs corporativas (LDAPS, PostgreSQL por SSL), login por email, el showroom del webinar

- **OpenLDAP y PostgreSQL vienen siempre con SSL** (en cualquier configuración que los instale), como lo harían un
  directorio y una base de datos corporativos: dos CAs raíz corporativas, *EUROPESIP Corporate Directory Root CA* y
  *EUROPESIP Corporate Database Root CA*, cuyos certificados quedan en `internals-ca/` (lo que te daría IT); `prep-pki/`
  hace el papel de IT (claves de las CAs y certificados de servidor, solo la preparación). OpenLDAP sirve LDAPS (636) y
  exige TLS (`olcSecurity: tls=1`); PostgreSQL (CloudNativePG) usa su certificado de servidor y rechaza cualquier
  conexión sin SSL (`hostnossl all all all reject`). La CA de OpenSearch sigue aparte.
- **DX confía en las CAs corporativas** con `configuration.webEngine.customTruststoreSecrets` (secret `dx-corporate-cas`),
  se conecta al LDAP por LDAPS (`port: 636`, `sslEnabled: true`) y a PostgreSQL con `?sslmode=verify-full` (la única
  forma que funciona en todos los pasos de CF239 y valida el certificado: ver el `issues.md` del showroom). Keycloak
  federa el LDAP por LDAPS con la CA del directorio en su truststore.
- **Login con el email o con el nombre corto**: un configuration override (`loginProperty` `uid` y `mail` en el
  `ldapRegistry` del chart), junto al de `preferredLanguage`.
- **Los usuarios LDAP de demo llevan los nombres y emails reales de EUROPESIP** (uid, grupos y contraseñas sin cambios).
- **Webinar, etapa 2**: primero una capa LDAP básica (`custom-values.ldap-basic.yaml`, 389 en claro); el paso 2-3 sube las
  CAs corporativas y aplica la capa completa (overrides + LDAPS), y el paso 2-4 cierra el LDAP en claro en directo. La
  carpeta del webinar incluye también `lab-ldap/example-active-directory.yaml`, un ejemplo avanzado de Active Directory
  (no se aplica).
- **IQ 1.0.3 ignora `dbTlsEnabled`**: con la base de datos de IQ en PostgreSQL, `pg_hba` mantiene una excepción solo para `iqdb`.
- **El repositorio de labs pasa a ser el showroom del webinar**: los ficheros generados del webinar (con las credenciales
  ocultas), la presentación y el vídeo. El instalador enlaza la guía del PoC en WSL2 desde el tag
  `labs-archive-2026-11-10`, y el golden test usa el wizard congelado de `hcl-dx-compose-labs-wizard`.

## 2.6.0 · 2026-11-10 · Webinar más en directo y soporte

- **Webinar, etapa 0 en directo**: `prepare.sh` solo crea el namespace de las herramientas de terceros e instala OpenLDAP
  y PostgreSQL. La demo crea el namespace de DX (enseña el YAML genérico y el de OpenShift, con las anotaciones de SCC
  que exige HCL, y aplica uno), hace login en el Harbor de HCL y descarga los charts. El secret del
  administrador de OpenLDAP pasa a `lab-ldap/secrets.openldap.yaml`; el secret de bind de DX se aplica en el paso 2-1.
- **LiteLLM abre la etapa 4, con IQ** (indicación de HCL: instalarlo antes de DX resultaba confuso), en la instalación y
  en el webinar: solo lo usa IQ, y la documentación de HCL lo tiene dentro de IQ. Sin IQ no se instala.
- **DX comprobado con `kubectl port-forward` antes del Ingress** (paso nuevo tras instalar DX, en la instalación y en el
  webinar): la mayoría de los problemas vienen de la red, así que primero se llega a DX por un túnel hasta su HAProxy,
  sin Ingress, DNS ni puertos abiertos; muestra el código HTTP y nunca falla.
- **Rol Administrator para dxadmins (XMLAccess), nuevo paso 2-2** con su fichero `lab-ldap/admin-role.xml`, generado por el
  instalador (solo con el OpenLDAP de demo; hasta ahora el webinar lo añadía a mano).
- **Interfaz de administración de Search activada** (`configuration.searchMiddleware.adminUI.enabled: true` en
  `custom-values.search.yaml`, desactivada por defecto en el chart): fuentes de contenido, crawlers y mapeo de campos en
  `/dx/ui/search/admin-ui`.
- **Certificados de OpenSearch, un paso cada uno** (5-1 a 5-5): la CA, los certificados admin, node y client y los
  secrets, cada comando visible en lugar de un bucle.
- **Deployment key de IQ con `--set`**: sale de `custom-iq-values.yaml` al Secret `iq-deployment-key`
  (`lab-iq/secrets.yaml`); la instalación de IQ la lee en una variable y la pasa con `--set`, porque el chart 1.0.3
  aún no puede leerla de un secret.
- RUNBOOK y guion Word/PDF: las dos formas habituales de crear objetos de Kubernetes (imperativa y declarativa) y por
  qué el webinar sigue la declarativa (GitOps); las capas de valores, `--reuse-values` y el fichero único de valores.
- **Soporte** (comentarios de usuarios): `BUILD-INFO.txt` en la carpeta (versión del instalador, plataforma, Ingress,
  Helm y opciones, sin secretos) y la misma marca al principio de los scripts y del RUNBOOK; `support/environment-info.sh`
  (equipo, herramientas, clúster, Ingress y el acceso a DX capa a capa), incluido también en `--collect`; un paso de
  diagnóstico del acceso tras el Ingress (DX por `kubectl port-forward`, controlador de Ingress, puerto 443, DNS).
- **Correcciones encontradas en las pruebas de la versión**: el PoC de un nodo (WSL2 / Linux) espera a la ServiceAccount
  `default` de un k3s recién instalado (el paso 0-1 fallaba); la VPC nueva del entorno EC2 de AWS usa `10.100.0.0/16` en
  lugar de `10.42.0.0/16`, que es la red de pods de k3s (los pods no llegaban a la API de Kubernetes y Longhorn no
  arrancaba). Ahora se rechaza un rango de VPC dentro de las redes de k3s. El diagnóstico del acceso prueba todas las direcciones
  del Ingress (LoadBalancer, externa e interna del nodo, la que resuelve el nombre) antes de decir que falla el puerto
  443: en la nube, el LoadBalancer de k3s muestra una dirección privada.
- **Compatibilidad con Helm 3**: los scripts generados para Helm 4 adaptan solos `--wait=legacy` y `--force-conflicts`
  cuando encuentran Helm 3.
- Página de **errores frecuentes** ([docs/troubleshooting.es.md](docs/troubleshooting.es.md)): k3s dentro de WSL y los
  puertos 80/443, `nip.io` bloqueado por el DNS, Helm 3, `ImagePullBackOff`, las variables de LiteLLM; enlazada desde el
  README y las preguntas frecuentes.

## 2.5.0 · 2026-11-09 · Aviso de alcance

- **Aviso de alcance** ([#5](https://github.com/europesip/hcl-dx-compose-installer/issues/5)): *Empezar* abre un diálogo
  con para qué sirve el instalador y para qué no (demos y PoC, sin ajuste para producción, las opciones más frecuentes,
  Servicios Profesionales para entornos grandes, se ofrece tal cual bajo licencia MIT). Hay que aceptarlo cada vez que se
  empieza. El mismo texto abre el RUNBOOK.md generado y la guía Word/PDF del webinar.

## 2.4.1 · 2026-11-08 · Operador de Script Applications 0.3.1

- El operador se instala en la **0.3.1**: una sola petición XMLAccess a la vez a DX (las simultáneas a veces volvían
  vacías y una página o un tema mostraban `DXError` durante un rato).

## 2.4.0 · 2026-11-08 · Operador de Script Applications 0.3.0

- El operador se instala en la **0.3.0**, cuyos recursos llevan todos el prefijo DX: el ejemplo hello es ahora un
  `DXScriptApplication` (y un `DXPage`), y los health checks de Argo CD y `--cleanup` usan `DXScriptApplication`,
  `DXDamCollection` y `DXDatabase` (DXDatabase admite ahora PostgreSQL, Oracle y SQL Server).
- Repetir una instalación anterior: el ejemplo hello nuevo adopta la aplicación que ya está en DX; el
  `ScriptApplication` antiguo se queda en Kubernetes (mira las notas de migración del operador 0.3.0 para quitarlo).

## 2.3.1 · 2026-11-08 · Operador de Script Applications 0.2.1

- El operador se instala en la **0.2.1**: gestiona también **temas** de DX (DXTheme) y ya no se queda en `DXError` (HTTP 401)
  cuando DX se reinicia, cosa que pasa en todas las instalaciones, porque DX se actualiza después de instalar el operador.
- Sus CRDs se aplican desde el tag del operador antes de su chart: Helm solo instala CRDs en la primera instalación, así
  que repetir la instalación sobre un operador anterior también trae el CRD nuevo de DXTheme.
- El health check de Argo CD y `--cleanup` incluyen DXTheme.

## 2.3.0 · 2026-11-08 · Tema de Keycloak, cierre de sesión, reintentos y recursos

- **Tema de login de Keycloak**: el tema por defecto de Keycloak (con su logo) o, marcando *Tema de login de EUROPESIP*,
  un tema de EUROPESIP (logo, colores, fondo degradado) montado desde un ConfigMap. **Cierre de sesión completo**:
  «Finalizar sesión» en DX también cierra la sesión de Keycloak.
- **Las descargas se reintentan** en `install.sh` (charts, repositorios, manifiestos); un `helm upgrade` solo se reintenta
  si no se pudo descargar el chart.
- **Estimación de recursos**: las páginas de despliegue, la de descarga y RUNBOOK.md muestran la CPU y la memoria que pide
  la instalación elegida, separadas en software de HCL, pre-requisitos y extras, con el aviso de que el requisito de HCL
  solo cubre el software de HCL. Los tamaños de AWS se comprueban contra la instalación mayor.
- **AWS**: coste por hora, por día y por mes (24×7) en el desglose del tamaño elegido.
- **Guion del webinar (Word / PDF)**: un anexo sobre las opciones avanzadas y los recursos.
- `install.sh --collect` ya no avisa «could not copy the Liberty logs» cuando sí se copiaron.

## 2.2.0 · 2026-11-08 · Repositorio de imágenes propio, Keycloak, versión en pantalla

- **Versión y fecha de compilación en el pie de página**, para saber qué versión se está ejecutando.
- **Usar otro repositorio de imágenes** (sustituye a la opción «air-gapped, en construcción»): las imágenes y los charts
  de HCL vienen de tu Harbor, Quay, Artifactory... en lugar de hclcr.io, con una ventana que explica las condiciones (una
  copia de las imágenes con los mismos nombres, o un proxy / mirror). El e-mail de la cuenta de HCL se pide aparte, solo
  para el script de tablas de PostgreSQL.
- **Keycloak (inicio de sesión único)**, pre-integrado con el OpenLDAP de la instalación, opcional e independiente de
  OpenBao: operador oficial, realm con federación del LDAP y la capa OIDC de DX. Las comprobaciones opcionales de IQ entran
  con el formulario del portal cuando está activado, y se usa ÓRBITA 3.1.2. Por qué está cada ajuste:
  [docs/third-party.es.md](docs/third-party.es.md).
- El operador de Script Applications se instala en la 0.1.3 (funciona con DX con OpenID Connect).
- [docs/third-party.es.md](docs/third-party.es.md): las peculiaridades de cada producto de terceros (OpenLDAP, PostgreSQL,
  LiteLLM, MCP, OpenBao, Argo CD, Keycloak).

## 2.1.2 · 2026-11-08 · CI/CD avanzado

- **CI/CD avanzado** en el despliegue Personalizado: OpenBao (gestor de secretos) con External Secrets Operator, Argo CD y
  el operador de Script Applications; desactivados por defecto, aún no en OpenShift.
- **Usar el gestor de secretos**: ninguna credencial en el zip; solo se pide el usuario de Harbor. [docs/openbao.es.md](docs/openbao.es.md).
- La compilación de la imagen reintenta sus descargas (las etiquetas 2.1.0 y 2.1.1 existen pero nunca se publicaron, por
  una caída de GitHub y un arreglo de ese arreglo).

## 2.0.x · 2026-11-07

- 2.0.0: el nuevo instalador (React + Tailwind, motor propio, entornos en AWS, despliegues rápidos incluido el webinar).
- 2.0.1 - 2.0.3: acceso a ROSA, documentación, guion del webinar en Word y PDF, carpetas con nombre según su contenido, MCP
  por HTTPS, Claude directamente (API de Anthropic) como proveedor de IA.
