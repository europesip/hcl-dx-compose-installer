# Historial de versiones

[English](CHANGELOG.md) · **Español**

Para volver a una versión anterior, ejecuta su imagen (`ghcr.io/europesip/hcl-dx-compose-installer:<versión>`) o su chart
(`helm upgrade dx-installer oci://ghcr.io/europesip/charts/hcl-dx-compose-installer --version <versión> --reuse-values`,
con `image.tag` en esa versión si la fijaste). Las opciones nuevas vienen desactivadas: sin ellas, la instalación generada
es la misma que en la 2.0.x.

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
