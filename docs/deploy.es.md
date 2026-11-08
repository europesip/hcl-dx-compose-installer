# Desplegar el instalador: Docker y Helm

[English](deploy.md) · **Español** · [README](../README.es.md)

> ⚠️ **¿Accesible desde fuera? Activa la autenticación.** Si despliegas el instalador en una máquina o clúster accesible
> desde Internet o desde otras redes, activa su usuario y contraseña (`auth.enabled=true` en el chart de Helm, o
> `AUTH_USER` / `AUTH_PASSWORD` en Docker). Si no, cualquiera que llegue a la página puede usarla, incluidas sus funciones
> de AWS con sus propias claves (o desactívalas con `aws.enabled=false`).

## Ejecutarlo con Docker

```bash
docker run --rm -p 8080:8080 ghcr.io/europesip/hcl-dx-compose-installer:2.2.0
```

Abre http://localhost:8080. La imagen se ejecuta con un usuario sin privilegios y funciona con el sistema de
ficheros raíz de solo lectura (`--read-only --tmpfs /tmp`). Incluye las herramientas para los entornos de
AWS: AWS CLI, eksctl, ROSA CLI, oc, kubectl, Helm y ssh.

Autenticación básica (opcional): `-e AUTH_USER=admin -e AUTH_PASSWORD='S3cret!'`. Sin las funciones de AWS:
`-e AWS_ENABLED=false`.

## Instalarlo en Kubernetes u OpenShift (Helm)

```bash
helm upgrade --install dx-installer oci://ghcr.io/europesip/charts/hcl-dx-compose-installer \
  --version 2.2.0 -n dx-installer --create-namespace \
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
