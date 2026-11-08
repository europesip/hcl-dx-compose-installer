# Historial de versiones

[English](CHANGELOG.md) · **Español**

Para volver a una versión anterior, ejecuta su imagen (`ghcr.io/europesip/hcl-dx-compose-installer:<versión>`) o su chart
(`helm upgrade dx-installer oci://ghcr.io/europesip/charts/hcl-dx-compose-installer --version <versión> --reuse-values`,
con `image.tag` en esa versión si la fijaste). Las opciones nuevas vienen desactivadas: sin ellas, la instalación generada
es la misma que en la 2.0.x.

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
