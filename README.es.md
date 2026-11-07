# Instalador de HCL DX Compose

[English](README.md) · **Español**

Un instalador web guiado para **HCL DX Compose**, de [EUROPESIP](https://www.europesip.com). Te lleva del
entorno al portal funcionando, pantalla a pantalla, en inglés o en español (empieza en el idioma de tu
navegador):

1. **Qué es DX Compose** y qué necesita (Kubernetes).
2. **Tu entorno.**
   - **Tu propio clúster:** los requisitos, los comandos para validarlo (StorageClasses RWO y RWX,
     Ingress) y una confirmación antes de seguir.
   - **Sin clúster:** te ayuda a crear uno.
     - En tu **PC con Windows (WSL2)** o en una **máquina Linux**: un k3s de un nodo, con las guías y
       cada comando.
     - En **AWS**, con una estimación de precio y un aviso claro de costes:
       - **una única instancia EC2** con k3s y Longhorn;
       - **Amazon EKS**;
       - **ROSA** (Red Hat OpenShift en AWS, experimental).

     El instalador crea el entorno de AWS por ti, muestra el progreso, te da el kubeconfig y lo borra
     todo al terminar.
3. **Despliegues rápidos:**
   - **Todo**: todas las etapas y todos los extras;
   - **Personalizado**: eliges las etapas;
   - **Webinar · Showroom**: exactamente lo que muestra el webinar, en dos fases (una preparación antes
     de la sesión y la demo).
4. **Tus datos**: el registro de HCL, OpenRouter (para el asistente de IA), contraseñas.
5. **Descarga** una instalación lista para ejecutar:
   - **Todo / Personalizado**: `dx-compose-install.zip`, con `install.sh`, `uninstall.sh`, `RUNBOOK.md`
     y todos los ficheros (values de Helm, Secrets, LDIF, properties) ya rellenos.
   - **Webinar**: `dx-compose-webinar.zip`, con `prepare.sh` (fase 1: todos los pre-requisitos salvo
     LiteLLM, y se detiene), `demo.sh` (fase 2: etapas 0 a 5, comando a comando) y el **guion del
     presentador en Word**. El guion recoge cada etapa, qué contar, los comandos, los valores de los
     YAML en los que fijarse y los secrets que se crean.

Las etapas son las mismas en todos los modos:

| Etapa | Qué hace |
|---|---|
| 0 · Pre-requisitos | Namespaces y las dependencias que necesiten las etapas elegidas (OpenLDAP, PostgreSQL, LiteLLM) |
| 1 · Instalación base de DX | DX Compose, sus secrets, los charts de HCL desde hclcr.io y el acceso externo |
| 2 · Configuración del LDAP | DX se autentica contra OpenLDAP (usuarios de demo) o tu Active Directory |
| 3 · Transferencia a base de datos externa | El Web Engine pasa de Derby a PostgreSQL u Oracle |
| 4 · Asistente de IA | HCL DX IQ con LiteLLM y OpenRouter (extras: MCP de EUROPESIP, sesiones de IQ, RAG) |
| 5 · Búsqueda | OpenSearch y Search V2 |
| Extras | Script Application de ejemplo (Hello DX), [ÓRBITA](https://github.com/europesip/orbita) |

> Está pensado para **pruebas de concepto y entornos de pruebas**, no para producción.

## Tus datos

- **Datos de la instalación:** la instalación (scripts, RUNBOOK, guion de Word) se genera **en tu
  navegador**. Lo que escribes en los pasos de la instalación, credenciales incluidas, no se envía a
  ningún servidor. Tus elecciones se recuerdan en tu navegador (nunca las credenciales).
- **Claves de AWS:** solo se envían cuando pides al instalador crear o borrar un entorno de AWS. Van al
  servidor del propio instalador (el pod o contenedor que tú ejecutas), que se las pasa al AWS CLI solo
  para esa operación. Nunca se escriben en disco ni en los logs.
- **Auditoría:** el código fuente está aquí para que lo audites.

> ⚠️ **¿Accesible desde fuera? Activa la autenticación.** Si despliegas el instalador en una máquina o clúster accesible
> desde Internet o desde otras redes, activa su usuario y contraseña (`auth.enabled=true` en el chart de Helm, o
> `AUTH_USER` / `AUTH_PASSWORD` en Docker). Si no, cualquiera que llegue a la página puede usarla, incluidas sus funciones
> de AWS con sus propias claves (o desactívalas con `aws.enabled=false`).

## Ejecutarlo con Docker

```bash
docker run --rm -p 8080:8080 ghcr.io/europesip/hcl-dx-compose-installer:2.0.0
```

Abre http://localhost:8080. La imagen se ejecuta con un usuario sin privilegios y funciona con el sistema de
ficheros raíz de solo lectura (`--read-only --tmpfs /tmp`). Incluye las herramientas para los entornos de
AWS: AWS CLI, eksctl, ROSA CLI, oc, kubectl, Helm y ssh.

Autenticación básica (opcional): `-e AUTH_USER=admin -e AUTH_PASSWORD='S3cret!'`. Sin las funciones de AWS:
`-e AWS_ENABLED=false`.

## Instalarlo en Kubernetes u OpenShift (Helm)

```bash
helm upgrade --install dx-installer oci://ghcr.io/europesip/charts/hcl-dx-compose-installer \
  --version 2.0.0 -n dx-installer --create-namespace \
  --set ingress.enabled=true --set ingress.className=nginx --set ingress.host=installer.example.com \
  --set auth.enabled=true --set auth.username=admin --set auth.password='S3cret!'   # si es accesible desde fuera
```

| Valor | Por defecto | Qué hace |
|---|---|---|
| `image.repository` / `image.tag` | `ghcr.io/europesip/hcl-dx-compose-installer` / appVersion del chart | Imagen (usa un espejo en clústeres sin Internet) |
| `imagePullSecrets` | `[]` | Para un registro privado |
| `replicaCount` | `1` | Réplicas (los trabajos de AWS viven en el pod que los lanzó: deja 1 si los usas) |
| `service.type` / `service.port` / `service.nodePort` | `ClusterIP` / `80` | `ClusterIP`, `NodePort` o `LoadBalancer` |
| `ingress.enabled` / `className` / `host` / `annotations` | `false` | Ingress de Kubernetes |
| `ingress.tls.enabled` / `ingress.tls.secretName` | `false` | HTTPS; sin nombre de secret: el certificado por defecto del controlador |
| `route.enabled` / `route.host` / `route.tls.termination` | `false` / generado / `edge` | Route de OpenShift en lugar del Ingress |
| `auth.enabled` / `auth.username` / `auth.password` / `auth.existingSecret` | `false` | Autenticación básica (o un Secret con las claves `username` y `password`) |
| `aws.enabled` | `true` | Crear y borrar entornos de AWS desde la página |
| `workDir.sizeLimit` | `1Gi` | Espacio para los trabajos de AWS (clave SSH, kubeconfig, logs) |
| `resources` | peticiones 20m / 96Mi | CPU y memoria |
| `podSecurityContext` / `securityContext` | sin root, FS raíz de solo lectura, sin capabilities, seccomp | Funciona con la SCC `restricted-v2` de OpenShift |
| `nodeSelector` / `tolerations` / `affinity` / `priorityClassName` | vacíos | Planificación |
| `networkPolicy.enabled` / `networkPolicy.from` | `false` | Solo deja entrar tráfico al puerto del pod; de salida solo DNS y HTTPS/SSH/6443 (AWS), nada sin AWS |
| `podDisruptionBudget.enabled` | `false` | PDB con `minAvailable` |

## Después, ejecuta la instalación

En una máquina con `bash`, `kubectl`, `helm`, `openssl`, `curl` y `python3` apuntando a tu clúster:

```bash
unzip dx-compose-install.zip && cd dx-install
./install.sh            # todos los pasos, etapa a etapa
./install.sh --list     # lista de pasos
./install.sh --from 4-1 # continuar desde un paso
./install.sh --pause    # muestra cada comando y espera a Enter
./uninstall.sh          # borra todo lo que creó
```

Webinar:

```bash
unzip dx-compose-webinar.zip && cd dx-install
./prepare.sh            # fase 1, antes de la sesión: se detiene con el entorno preparado
./demo.sh               # fase 2, el día de la demo: etapas 0 a 5, comando a comando
./uninstall.sh          # después del webinar
```

## Entornos de AWS desde tu propia máquina

Los scripts que ejecuta la página están en [`server/aws`](server/aws). Puedes ejecutarlos tú con el AWS CLI
(y eksctl para EKS, rosa y oc para ROSA):

```bash
cd server/aws
NAME=dx-compose-poc REGION=eu-west-1 ./ec2-create.sh     # o eks-create.sh / rosa-create.sh
NAME=dx-compose-poc REGION=eu-west-1 ./ec2-destroy.sh    # borra todo lo etiquetado dx-installer=NAME
```

| Script | Qué crea | Precio aprox. (eu-west-1) |
|---|---|---|
| `ec2-create.sh` | una m6i.4xlarge (Ubuntu 24.04, 200 GB gp3) con k3s, Helm, Longhorn y las StorageClasses `dx-deploy-rwo` / `dx-deploy-rwx`, Traefik; DX en `dx-demo.<IP>.nip.io` | ~0,89 USD/hora |
| `eks-create.sh` | EKS con 2 × m6i.2xlarge en su propia VPC, EBS CSI (RWO), EFS CSI y un sistema de ficheros EFS (RWX), ingress-nginx tras un NLB, un kubeconfig con su propio token | ~1,08 USD/hora |
| `rosa-create.sh` | ROSA con planos de control alojados, 2 workers, EBS y EFS (experimental) | ~2 USD/hora |

Cuestan dinero mientras existen: bórralos al terminar.

## Cómo funciona

| Ruta | Qué es |
|---|---|
| `src/App.jsx`, `src/views.jsx`, `src/aws-view.jsx`, `src/ui.jsx`, `src/i18n.js` | Interfaz (React + Tailwind CSS, inglés y español) |
| `src/state.js` | Valores del formulario, despliegues rápidos, dependencias entre etapas |
| `src/engine/core.js` | Motor de generación: ficheros de los labs, pasos, `install.sh` |
| `src/engine/stages.js` | Etapas 0-5 y extras, las dos fases del webinar, `RUNBOOK.md` |
| `src/bundle.js`, `src/zip.js` | El zip, el enmascarado de credenciales, los valores clave de cada YAML |
| `src/word.js` | Guion del webinar en Word |
| `src/aws.js`, `server/aws/*.sh` | Tamaños y estimaciones de precio de AWS; los scripts que crean y borran los entornos |
| `server/index.mjs` | Servidor: la página, y la API que ejecuta los scripts de AWS y emite su salida |
| `Dockerfile`, `chart/hcl-dx-compose-installer` | Imagen del contenedor y chart de Helm |

El motor nació como la opción C del asistente de configuración de los
[labs](https://github.com/europesip/hcl-dx-compose-labs), que ahora está congelado.
`test/golden.e2e.mjs` comprueba que, para el mismo estado, el motor sigue generando los mismos ficheros y
comandos que ese asistente.

## Desarrollo

```bash
npm ci
PORT=8080 npm start &               # el servidor (API), con las herramientas de AWS en el PATH
npm run dev                         # http://localhost:5173 (envía /api a :8080)
npm test                            # pruebas unitarias
WIZARD=/ruta/a/hcl-dx-compose-labs/docs/index.html node test/golden.e2e.mjs
npm run build && npm start          # build de producción en http://localhost:8080
```

GitHub Actions ejecuta las pruebas, la prueba de equivalencia y el build. Construye la imagen (amd64 y
arm64) y prueba el contenedor: herramientas, cabeceras, API, solo lectura, y la interfaz completa con las
descargas. Después publica `ghcr.io/europesip/hcl-dx-compose-installer` (`:main` en cada push; `:X.Y.Z` y
el chart de Helm con un tag `vX.Y.Z`).

## Contribuir

Las contribuciones son bienvenidas: opciones nuevas, entornos, idiomas o correcciones. Abre un issue o un
pull request.

## Licencia

[MIT](LICENSE). Ver [NOTICE](NOTICE). HCL, HCL Digital Experience y HCL DX Compose son marcas de HCL
Technologies; este proyecto no es un producto de HCL. Los charts y las imágenes de HCL se descargan del
registro de HCL con tu propia cuenta de HCL.

## Contacto

EUROPESIP · https://www.europesip.com · info@europesip.com
