# Air-gapped: tu propio registro para todas las imágenes y charts

[English](air-gapped.md) · **Español**

Con *Usar otro repositorio de imágenes* las imágenes y los charts de HCL vienen de tu propio registro (Harbor, Quay,
Artifactory, Nexus...) en lugar de hclcr.io. Elige **Todas las imágenes y charts** (headless: `REGISTRY_SCOPE: "all"`,
#51) y nada de la instalación vendrá ya de un registro público: ni las imágenes de HCL, ni las de terceros (OpenLDAP,
CloudNativePG y PostgreSQL, Keycloak, OpenBao, External Secrets Operator, Argo CD, LiteLLM, el DX Delivery Operator,
ÓRBITA, el servidor MCP de EUROPESIP, las imágenes auxiliares de los Jobs), ni los charts de Helm.

El alcance por defecto, **Solo las imágenes de HCL** (`REGISTRY_SCOPE: "hcl"`), mantiene el comportamiento de las
versiones anteriores: la carpeta es exactamente la misma.

## Qué trae la carpeta

| Ruta | Qué es |
|---|---|
| `mirror/IMAGES.txt` | El inventario del preset y las opciones elegidos: cada imagen, chart y manifiesto, **origen → destino** |
| `mirror/images.json` | El mismo inventario en JSON, para tus herramientas (análisis de vulnerabilidades, flujos de aprobación) |
| `mirror/images.list`, `charts.list`, `files.list` | Las listas que leen los scripts |
| `mirror/mirror-images.sh` | Copia todo a tu registro y descarga los manifiestos (ver abajo) |
| `mirror/check-images.sh` | Comprobación previa: que cada imagen, chart y manifiesto está en tu registro |
| `mirror/values/<chart>.yaml` | Las imágenes que cada chart de terceros usa por defecto, ya en tu registro |
| `mirror/manifests/` | Lo rellena `mirror-images.sh`: los manifiestos que la instalación aplica desde GitHub (operador de Keycloak, CRDs del DX Delivery Operator), ya reescritos a tu registro |

Y todas las referencias de los ficheros generados apuntan a tu registro:

- `image:`, `imageName:` y `repository:` de los values y manifiestos (servidor MCP de EUROPESIP, clúster de
  CloudNativePG, LiteLLM, el pod del volumen de DAM de la PoC de un nodo...);
- los charts e imágenes de HCL (`images.repository` de DX, IQ y la búsqueda);
- los charts de terceros: desaparece `helm repo add` y cada `helm upgrade` usa `oci://<tu registro>/...`;
- las imágenes que los charts usan por defecto (no están escritas en la carpeta): `install.sh` añade
  `-f mirror/values/<chart>.yaml` como último fichero de values de cada `helm upgrade`;
- los manifiestos que se descargaban de `raw.githubusercontent.com` se leen de `mirror/manifests/`.

## Esquema de rutas

| `REGISTRY_LAYOUT` | Destino de `docker.io/library/postgres:18.1-alpine` | Destino del Web Engine de DX |
|---|---|---|
| `host` (por defecto) | `<registro>/docker.io/library/postgres:18.1-alpine` | `<registro>/hclcr.io/dx-compose/webengine:<tag>` |
| `flat` | `<registro>/library/postgres:18.1-alpine` | `<registro>/dx-compose/webengine:<tag>` (como con *Solo las imágenes de HCL*) |

`host` mantiene el registro original como primera carpeta, así dos registros nunca chocan; es el que recomendamos.
`flat` mantiene la ruta original sin su registro. La generación se detiene con un error si dos orígenes fueran al
mismo destino. Los charts de repositorios de Helm que no son OCI van a `<registro>/<host del repositorio>/<ruta>/<chart>`
(`host`) o a `<registro>/<REGISTRY_CHARTS_PATH>/<chart>` (`flat`, por defecto `charts`). `<registro>` es la dirección que
escribiste, con su proyecto (en Harbor, `harbor.example.com/mirror`).

## Pasos

1. **Genera la carpeta** con *Usar otro repositorio de imágenes · Todas las imágenes y charts* (o las claves headless
   de abajo).
2. **Copia las imágenes y los charts** con `mirror/mirror-images.sh` en una máquina con acceso a Internet y a tu
   registro. Necesita `helm` (3.8 o posterior), `curl` y uno de `skopeo`, `crane` u `oras`:

   ```bash
   export SRC_HCL_USER='<e-mail de tu cuenta de HCL>' SRC_HCL_TOKEN='<CLI secret de hclcr.io>'   # las imágenes de HCL no son públicas
   export DEST_USER='<usuario de tu registro>' DEST_PASSWORD='<contraseña o token>'
   export DOCKERHUB_USER='<usuario>' DOCKERHUB_TOKEN='<token>'     # opcional: el límite de descargas de Docker Hub
   ./mirror/mirror-images.sh --dry-run    # lo que haría
   ./mirror/mirror-images.sh              # imágenes (todas las plataformas), charts (helm pull + helm push) y manifiestos
   ```

   ¿Ninguna máquina llega a los dos lados? Ejecuta `./mirror/mirror-images.sh --save /media/usb/dx` en el lado de
   Internet (las imágenes como archivos OCI con skopeo, los `.tgz` de los charts y los manifiestos), lleva la carpeta y
   el directorio, y ejecuta `./mirror/mirror-images.sh --load /media/usb/dx` en el lado del registro (copia
   `DIR/mirror/manifests` en `mirror/`). En la carpeta no se guarda nada: los logins son variables de entorno, o inicia
   sesión tú antes con `skopeo login` / `crane auth login` / `oras login` y `helm registry login`.
3. **Copia la carpeta entera**, con `mirror/manifests/`, a la máquina que ejecuta `install.sh`.
4. **Confía en la CA de tu registro** si no es pública:
   - esta máquina: cópiala en `internals-ca/registry-ca.crt` (la carpeta de las CAs corporativas). `install.sh`,
     `mirror-images.sh` y `check-images.sh` la añaden a las CAs de helm, skopeo, crane y oras (`SSL_CERT_FILE`);
   - los nodos del clúster: el runtime de contenedores debe confiar en ella, y eso la carpeta no puede hacerlo por ti:
     containerd (`/etc/containerd/certs.d/<host>/hosts.toml` o las CAs del sistema), k3s
     (`/etc/rancher/k3s/registries.yaml`), CRI-O (`/etc/containers/certs.d/<host>/ca.crt`) u OpenShift
     (`image.config.openshift.io/cluster`, `additionalTrustedCA`).
5. **Ejecuta `./install.sh`.** Su primer paso (tras los namespaces) inicia sesión con Helm, crea el pull secret
   `regcred` en cada namespace que usa la instalación (`DX_NS`, `SHARED_NS`, el de CI/CD, `default` con la PoC) y lo
   asigna a su ServiceAccount `default`, para los pods y Jobs auxiliares. Después ejecuta `mirror/check-images.sh`: si
   falta una imagen, un chart o un manifiesto, la instalación se detiene antes de instalar nada y dice qué falta. El
   webinar hace lo mismo al principio de `prepare.sh` y pide la contraseña (o lee `REGISTRY_PASSWORD`), para que nunca
   quede en el script.

## Opciones (también headless)

| Clave | Por defecto | Qué hace |
|---|---|---|
| `REGISTRY_SCOPE` | `hcl` | `hcl`: solo las imágenes y charts de HCL · `all`: todas las imágenes y charts |
| `REGISTRY_LAYOUT` | `host` | `host` o `flat` (tabla de arriba) |
| `REGISTRY_CHARTS_PATH` | `charts` | Carpeta de los charts que no son OCI con el esquema `flat` |
| `MIRROR_TOOL` | `auto` | Herramienta de `mirror-images.sh` para las imágenes: `auto` (la primera de skopeo, crane, oras), `skopeo`, `crane`, `oras`; `--tool` la cambia |
| `MIRROR_PREFLIGHT` | `strict` | Comprobación previa: `strict` se detiene si falta algo, `warn` solo avisa, `off` la omite; la variable de entorno `MIRROR_PREFLIGHT` la cambia al ejecutar `install.sh` |

`REGISTRY`, `REGISTRY_USER` y `REGISTRY_PASSWORD` son los mismos que con *Solo las imágenes de HCL*. Un usuario vacío
significa descargas anónimas: sin pull secret ni login de Helm. Con el preset `basic` el pull secret es
`IMAGE_PULL_SECRET` (ya existe) y la comprobación previa usa los logins de skopeo, crane u oras de la máquina que la
ejecuta.

```json
{"preset": "all", "DX_HOST": "dx.example.com", "altRegistry": true, "REGISTRY": "harbor.example.com/mirror",
 "REGISTRY_USER": "robot$dx", "REGISTRY_SCOPE": "all", "REGISTRY_LAYOUT": "host"}
```

## Límites conocidos

- **El propio clúster.** Kubernetes, la CNI, CoreDNS, el controlador de Ingress y los drivers CSI no forman parte de
  la carpeta. Un k3s de un nodo (plataforma PoC) necesita su tarball de imágenes air-gap o `registries.yaml` (ver la
  documentación de k3s); Traefik viene con k3s.
- **La CA del registro en los nodos** la configura el administrador del clúster (paso 4).
- **Pods de test de los charts.** `helm test` de LiteLLM usa `busybox` escrito en la plantilla del chart, sin un value
  para cambiarlo; la instalación nunca ejecuta `helm test`.
- **Versiones nuevas de los charts.** Las imágenes que un chart usa por defecto se listan por versión en
  `src/mirror.js` (medidas con `helm template` y los values de la carpeta). Los tests unitarios fallan si una versión
  fijada de un chart no tiene su lista, así que una versión nueva no puede dejar una imagen pública sin avisar; hay que
  volver a medir la lista.
- **Lo que despliegues después lo replicas tú.** La carpeta conoce las imágenes de la instalación. Los artefactos OCI
  e imágenes que nombres más tarde en tus propios recursos (importaciones, exportaciones y bundles de Script
  Applications del DX Delivery Operator, tus propias Script Applications) vienen de los registros que escribas ahí.
- **Digests.** Las imágenes se copian por tag (todas las plataformas). Si tu política exige digests, fíjalos en tu
  registro (por ejemplo con las reglas de inmutabilidad de Harbor) tras la copia.
