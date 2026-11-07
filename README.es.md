# Instalador de HCL DX Compose

[English](README.md) · **Español**

Un instalador web para **HCL DX Compose** y los [laboratorios de HCL DX Compose de EUROPESIP](https://github.com/europesip/hcl-dx-compose-labs).
Responde a unas preguntas (plataforma, nombre de host, qué instalar, credenciales) y descarga una
**instalación lista para ejecutar**:

- **`dx-compose-labs-install.zip`**: la carpeta `dx-install/` con `install.sh`, `uninstall.sh`,
  `RUNBOOK.md` y todos los ficheros (valores de Helm, Secrets, LDIF, properties…) ya rellenados con tus
  valores, más la guía en Word.
- **`RUNBOOK.md`**: todos los pasos con su comando, en orden.
- **Una guía en Word (`.docx`)**: qué se va a instalar, cómo ejecutarlo, los comandos de cada paso, los
  comandos que crean Secrets y claves, los **valores clave que pone cada fichero YAML** comparados con
  la plantilla del lab, y los propios ficheros YAML. Las credenciales se pueden ocultar (activado por
  defecto).

Funciona como **pod** en tu clúster (chart de Helm) o como **contenedor Docker**, en inglés y en
español.

## Tus credenciales se quedan en tu navegador

El instalador es una página estática. Todo se genera **en el navegador**: nada de lo que escribes,
credenciales incluidas, llega al pod ni a ningún otro servidor. La página se sirve con una
Content-Security-Policy con `connect-src 'none'`, así que el propio navegador bloquea cualquier
petición de red desde ella. Lo que eliges (nunca las credenciales) se recuerda solo en tu navegador.

## Ejecutarlo con Docker

```bash
docker run --rm -p 8080:8080 ghcr.io/europesip/hcl-dx-compose-installer:1.0.0
```

Abre http://localhost:8080. La imagen se ejecuta con un usuario sin privilegios y funciona con el
sistema de ficheros raíz de solo lectura (`--read-only --tmpfs /tmp`).

Autenticación básica (opcional): monta un fichero htpasswd y una configuración de dos líneas:

```bash
htpasswd -nbB admin 'S3cret!' > htpasswd
printf 'auth_basic "Instalador DX";\nauth_basic_user_file /etc/nginx/htpasswd/htpasswd;\n' > auth.conf
docker run --rm -p 8080:8080 -v "$PWD/auth.conf:/etc/nginx/auth/auth.conf:ro" \
  -v "$PWD/htpasswd:/etc/nginx/htpasswd/htpasswd:ro" ghcr.io/europesip/hcl-dx-compose-installer:1.0.0
```

## Instalarlo en Kubernetes u OpenShift (Helm)

```bash
helm upgrade --install dx-installer oci://ghcr.io/europesip/charts/hcl-dx-compose-installer \
  --version 1.0.0 -n dx-installer --create-namespace \
  --set ingress.enabled=true --set ingress.className=traefik --set ingress.host=installer.example.com
```

| Valor | Por defecto | Qué hace |
|---|---|---|
| `image.repository` / `image.tag` | `ghcr.io/europesip/hcl-dx-compose-installer` / appVersion del chart | Imagen (usa un espejo en clústeres sin Internet) |
| `imagePullSecrets` | `[]` | Para un registro privado |
| `replicaCount` | `1` | Réplicas (la página no tiene estado) |
| `service.type` / `service.port` / `service.nodePort` | `ClusterIP` / `80` | `ClusterIP`, `NodePort` o `LoadBalancer` |
| `ingress.enabled` / `className` / `host` / `annotations` | `false` | Ingress de Kubernetes |
| `ingress.tls.enabled` / `ingress.tls.secretName` | `false` | HTTPS; sin nombre de secret: el certificado por defecto del controlador |
| `route.enabled` / `route.host` / `route.tls.termination` | `false` / generado / `edge` | Route de OpenShift en lugar del Ingress |
| `auth.enabled` / `auth.htpasswd` / `auth.existingSecret` | `false` | Autenticación básica (línea htpasswd, o un Secret con la clave `htpasswd`) |
| `resources` | peticiones 10m / 32Mi | CPU y memoria |
| `podSecurityContext` / `securityContext` | sin root, FS raíz de solo lectura, sin capabilities, seccomp | Funciona con la SCC `restricted-v2` de OpenShift |
| `nodeSelector` / `tolerations` / `affinity` / `priorityClassName` | vacíos | Planificación |
| `podAnnotations` / `podLabels` | vacíos | Metadatos adicionales |
| `networkPolicy.enabled` / `networkPolicy.from` | `false` | Solo deja entrar tráfico al puerto del pod; sin salida |
| `podDisruptionBudget.enabled` | `false` | PDB con `minAvailable` |

Sin Ingress ni Route: `kubectl -n dx-installer port-forward svc/dx-installer-hcl-dx-compose-installer 8080:80`.

## Después, ejecuta la instalación

En una máquina con `bash`, `kubectl`, `helm`, `curl` y `python3` apuntando a tu clúster:

```bash
unzip dx-compose-labs-install.zip && cd dx-install
./install.sh            # todos los pasos, indicando el lab y el paso en el que está
./install.sh --list     # lista de pasos
./install.sh --from 1-4 # reanudar desde un paso
./uninstall.sh          # borra todo lo que creó
```

## Cómo funciona

El instalador es la **opción C (instalación directa) del asistente de configuración** de los labs, con
una interfaz nueva. Para tener una sola fuente de verdad, el motor de generación no se reescribe: se
**extrae del asistente** (`docs/index.html` de los labs) con `scripts/sync-engine.mjs` a
`src/engine/wizard-engine.js`, de modo que los ficheros, los pasos, `RUNBOOK.md` e `install.sh` son
exactamente los del asistente. La prueba `test/golden.e2e.mjs` lo comprueba: con las mismas
respuestas, el instalador y el asistente generan los mismos ficheros. Esta aplicación añade la
interfaz en React, la guía en Word (`src/word.js`, con [docx](https://github.com/dolanmiu/docx)) y el
contenedor.

## Desarrollo

```bash
npm ci
npm run dev                         # http://localhost:5173
npm test                            # pruebas unitarias
npm run sync-engine -- /ruta/a/hcl-dx-compose-labs/docs/index.html   # cuando cambien los labs
WIZARD=/ruta/a/hcl-dx-compose-labs/docs/index.html node test/golden.e2e.mjs
npm run build && npm run preview    # build de producción
```

GitHub Actions ejecuta las pruebas, la prueba de equivalencia con los labs, construye la imagen (amd64
y arm64), prueba el contenedor (cabeceras, solo lectura, la interfaz completa con las descargas) y
publica `ghcr.io/europesip/hcl-dx-compose-installer` (`:main` en cada push, `:X.Y.Z` y el chart de Helm
con un tag `vX.Y.Z`).

## Licencia

[Apache License 2.0](LICENSE), como los labs. Ver [NOTICE](NOTICE). HCL, HCL Digital Experience y
HCL DX Compose son marcas de HCL Technologies; este proyecto no es un producto de HCL. Los charts y las
imágenes de HCL se descargan del registro de HCL con tu propia cuenta de HCL.

## Contacto

EUROPESIP · https://www.europesip.com · info@europesip.com
