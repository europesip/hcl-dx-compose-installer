# Requisitos

[English](requirements.md) · **Español**

Dos cosas distintas necesitan recursos: el **instalador** (una aplicación web pequeña) y la **instalación que genera**
(HCL DX Compose y sus requisitos previos, en tu clúster).

## Para ejecutar el instalador

| Forma | Qué necesitas |
|---|---|
| Docker (tu PC) | Docker o Podman. `docker run --rm -p 8080:8080 ghcr.io/europesip/hcl-dx-compose-installer:<versión>` y un navegador |
| Chart de Helm (un clúster) | Kubernetes u OpenShift, Helm 3.8+ (charts OCI), un Ingress o una ruta si debe verse desde fuera (deja `auth.enabled=true`) |
| Headless (Node) | Node.js 20.19 o posterior. Sin navegador ni servidor: ver [Modo headless](headless.es.md) |
| Opciones de AWS (opcional) | Una clave de acceso de AWS con permiso para crear EC2 / EKS (y un token de Red Hat para ROSA). Solo se usa para crear o borrar ese entorno |

El instalador es ligero: el chart pide 20m de CPU y 96 MiB (límite 768 MiB, para los trabajos de AWS). Nada de lo que genera se envía a un servidor: ver [Seguridad](security.es.md).

## Para la instalación que genera

### Clúster

| | |
|---|---|
| **Kubernetes** | Un clúster al que llegues con `kubectl` como administrador (crea namespaces, CRDs de los requisitos previos, recursos de Ingress). Probado en k3s y Amazon EKS; los scripts también admiten OpenShift (crear un clúster ROSA desde el instalador aún no está probado de principio a fin). O deja que el instalador cree uno: k3s en tu PC (WSL2), en una máquina Linux o en AWS EC2 |
| **Almacenamiento** | Una clase de almacenamiento `ReadWriteOnce` y otra `ReadWriteMany` (DAM y otros volúmenes compartidos). Por defecto `dx-deploy-rwo` / `dx-deploy-rwx`; Longhorn, EBS + EFS... |
| **Ingress** | Traefik (el de k3s), ingress-nginx u otra clase; en OpenShift, rutas |
| **DNS y TLS** | Un nombre para el portal que resuelva al Ingress (`nip.io` vale para una PoC). Tu certificado, o uno autofirmado que generan los scripts |
| **CloudNativePG existente** | El paso de PostgreSQL instala su propio operador CloudNativePG. En un clúster que ya tenga uno, no ejecutes ese paso hasta que esté [#24](https://github.com/europesip/hcl-dx-compose-installer/issues/24) |

### CPU y memoria

*Requests* de Kubernetes medidas en el clúster del laboratorio (DX Compose CF239). El instalador muestra la estimación
de lo que elijas, y RUNBOOK.md la repite.

| Qué | CPU | Memoria |
|---|---|---|
| Solo el software de HCL (DX Compose; + IQ, + Search) | ~8 | ~14 GiB |
| Todo (HCL + requisitos previos + extras) | ~9,3 en requests | ~20,6 GiB en requests |
| Capacidad libre recomendada para todo | ~13 | ~27 GiB |

### Herramientas en la máquina que ejecuta la carpeta

| Herramienta | Para qué |
|---|---|
| `kubectl` | Todos los pasos |
| `helm` 3 o 4 | Los charts (los scripts adaptan las opciones de Helm 4 cuando encuentran Helm 3) |
| `openssl`, `curl` | Certificados, comprobación de cada paso |
| `python3` | Recoger datos para el soporte (`--collect`) y algunas comprobaciones |
| `sops`, `age` | Solo para el webinar con los secretos cifrados con SOPS |

Linux, macOS o Windows con WSL2. Los scripts comprueban las herramientas antes de empezar.

### Cuentas y ficheros

| | |
|---|---|
| **HCL Harbor** (`hclcr.io`) | El correo de tu cuenta de HCL y su secreto CLI, para descargar los charts e imágenes de HCL. O tu propio registro con una copia |
| **Licencia de HCL DXClient** | Se acepta en el asistente cuando se instalan el DX Delivery Operator u ÓRBITA |
| **`setup-postgres-dx.sql`** | El script de HCL para el Web Engine en PostgreSQL (etapa 3), copiado en `lab-bbdd/` |
| **Proveedor de IA** (etapa 4) | Una clave de API de OpenRouter, AWS Bedrock (clave y región) o una clave de API de Anthropic, para LiteLLM |

### Nota de seguridad

Sin la opción de OpenBao, la carpeta generada contiene contraseñas y claves: guárdala en privado. En el
[modo headless](headless.es.md) los secretos van aparte, en `secrets.env` y los ficheros de secretos, y el resto puede ir a Git.
