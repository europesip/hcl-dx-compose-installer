# Modo headless: el instalador sin su página web

[English](headless.md) · **Español** · [README](https://github.com/europesip/hcl-dx-compose-installer/blob/main/README.es.md)

El motor del DX Installer Wizard puede funcionar **sin su página web**, en Node: una librería y una pequeña herramienta
de línea de comandos toman las respuestas del asistente en un fichero JSON y devuelven la misma carpeta `dx-install/`
que descarga la página. Está pensado para automatizar, por ejemplo una **plantilla de Backstage «Nuevo entorno de HCL
DX»** en un portal interno del desarrollador (IDP), un job de CI o un script.

> **La carpeta la sigue ejecutando una persona, con `helm` de verdad, siguiendo el RUNBOOK.** HCL DX no se instala con
> Argo CD ni con ningún controlador GitOps: sus charts de Helm guardan estado en la release (hooks, actualizaciones,
> transferencia de la base de datos). En un flujo automatizado, Git guarda y revisa la carpeta generada (un merge
> request); una persona (o un job manual de CI que ejecuta el mismo `install.sh`) la instala.

## Librería

Node 20.19 o posterior. Hasta que se publique como paquete, se instala desde una etiqueta de release:

```bash
npm install github:europesip/hcl-dx-compose-installer#v2.10.0
```

```js
import {generateInstall, schema, validateAnswers} from "hcl-dx-compose-installer/headless";

const r = generateInstall({
  answers: {schemaVersion: 1, preset: "all", DX_HOST: "dx.example.com", HCL_HARBOR_USER: "tu@example.com", dxcLicense: true},
  lang: "es",            // o "en": idioma del RUNBOOK y de los mensajes
  secrets: "omit",       // el valor por defecto: ver «Secretos»
});
if (!r.ok) throw new Error(r.check.err.join("\n"));
r.files;        // {"install.sh": {text, mode}, "RUNBOOK.md": {...}, ...}  sin ningún secreto: se puede subir a Git
r.secretFiles;  // {"secrets.env": {...}, "lab-base/secrets.yaml": {...}, ...}  FUERA de Git
r.zip;          // Uint8Array: la carpeta dx-install/ completa, como la descarga la página
r.check.warn;   // avisos, como en la página
```

| Función | Qué hace |
|---|---|
| `generateInstall({answers, lang, secrets})` | La carpeta. `ok` es false cuando `check.err` no está vacío (falta el host, opción no válida...) |
| `schema()` | JSON Schema de las respuestas: cada clave, su tipo, sus valores posibles y su valor por defecto. Sirve para construir un formulario, por ejemplo los parámetros de una plantilla de Backstage |
| `validateAnswers(answers, {secrets})` | Solo las comprobaciones de las respuestas (claves desconocidas, tipos, valores, secretos) |
| `VERSION`, `SCHEMA_VERSION` | Versión del instalador y del formato de las respuestas |

## Respuestas

Las respuestas son las opciones de la página web, con los mismos nombres (`src/state.js`, `DEFAULTS`). Solo `preset`
es obligatoria; cada clave que no se indique toma su valor por defecto. Una clave desconocida es un error, para que
una errata no pase desapercibida. Ejemplos: [`docs/headless-examples/`](https://github.com/europesip/hcl-dx-compose-installer/tree/main/docs/headless-examples) (`poc.json`,
`webinar.json`, `all.json`).

| Clave | Valores |
|---|---|
| `preset` | `all` (todas las etapas y extras), `webinar` (etapas 0-5 como en el webinar: `prepare.sh` + `demo.sh`), `custom` (lo que indiques) |
| `platform` | `kubernetes`, `openshift`, `poc` (k3s en una máquina) |
| `DX_HOST` | Nombre del portal (PoC: `dx-demo.127.0.0.1.nip.io` por defecto) |
| `DX_NS`, `SHARED_NS` | Namespaces de HCL DX y de las herramientas de terceros |
| `INGRESS_KIND`, `SC_RWO`, `SC_RWX`, `helm` | Ingress, clases de almacenamiento, Helm 3 o 4 |
| `lab1b`, `dir`, `db`, `lab3`, `lab3b`, `iqdb`, `iqrag`, `lab4`, `lab5`, `keycloak`, `cicd*`... | Las etapas y extras de la página |

La lista completa, con tipos y valores por defecto: `dx-installer schema`.

## Secretos

**`secrets: "omit"` (por defecto).** Las respuestas no pueden llevar ninguna credencial (`HCL_HARBOR_TOKEN`, claves de
API, contraseñas): se rechazan. La carpeta se divide para que la parte que va a Git no tenga ningún secreto:

- Las contraseñas que la instalación necesita igualmente (wpsadmin, LDAP, bases de datos, usuarios de demo) se
  **generan al azar** en cada llamada, nunca la contraseña documentada por defecto, y se escriben en
  **`secrets.env`**, junto con la clave de LiteLLM.
- `install.sh` (o `prepare.sh` y `demo.sh`) lee `secrets.env` de su propia carpeta; el RUNBOOK dice que se ejecute
  `source secrets.env` antes de copiar un comando.
- Las credenciales que no se dieron (el secreto CLI de HCL Harbor, la clave de API de la IA) se rellenan en la máquina
  que ejecuta la carpeta: `secrets.env` y los ficheros de secretos llevan `PUT-YOUR-...-HERE`, y el script se para y
  los enumera mientras quede alguno.
- `secretFiles` enumera cada fichero con un secreto (`secrets.env`, los `secrets.yaml`, el LDIF con los hashes de las
  contraseñas, las propiedades de la base de datos): guárdalos en un gestor de contraseñas u OpenBao, nunca en Git.

**`secrets: "include"`.** Las respuestas pueden llevar las credenciales, como en la página web, y la carpeta es byte a
byte la que descarga la página (salvo la fecha de generación y las sales aleatorias del LDIF). `secretFiles` sigue
diciendo qué ficheros las tienen.

## Preset `basic`: un portal de pruebas sencillo, instalado por un Job

`preset: "basic"` (solo headless) genera el **Lab 1**: DX Compose con Derby, sin directorio, sin base de datos
externa, sin IQ y sin Search. Está pensado para ejecutarse **sin intervención dentro del mismo clúster**: por ejemplo,
lo usa el plugin HCL DX de Backstage en su botón *Install a new portal › Basic*. Además de las respuestas habituales
admite:

| Clave | Qué hace |
|---|---|
| `IMAGE_PULL_SECRET` | Nombre de un Secret `kubernetes.io/dockerconfigjson` que **ya existe** en `DX_NS`, por ejemplo creado por un ExternalSecret. Ni `regcred` ni token personal de HCL: lo usan las imágenes, y `helm pull` lee sus credenciales (`--registry-config`) para bajar el chart |
| `altRegistry` + `REGISTRY` | De dónde vienen las imágenes y el chart, normalmente un **proxy caché de hclcr.io en Harbor** (p. ej. `harbor.example.com/hclcr-proxy`) |
| `BASIC_DAM` | `true` (por defecto): Lab 1 completo, con DAM, Content Composer, el procesador de imágenes y la persistencia de DAM (unos 4,8 CPU y 10,5 GiB solicitados). `false`: el portal más ligero, Web Engine con Derby, HAProxy y Ring API (unos 2,6 CPU y 5 GiB) |
| `BASIC_PG` | `true`: su propio PostgreSQL, un Cluster de CloudNativePG en `DX_NS` creado con el operador CNPG que ya está en el clúster (nunca instala uno), y la transferencia desde Derby (~15 min más). Copia antes `setup-postgres-dx.sql` en `lab-bbdd/`. `false` (por defecto): Derby |
| `BASIC_LDAP_HOST`, `BASIC_LDAP_PORT`, `BASIC_LDAP_SUFFIX`, `BASIC_LDAP_SECRET` | Un directorio que **ya existe** (no se instala OpenLDAP): host, puerto (389), DN base y un Secret que ya existe en `DX_NS` con `bindUser` y `bindPassword` (por defecto `dx-ldap-bind`, por ejemplo creado por un ExternalSecret). DX recibe el bloque LDAP nativo (tipo other) y la propiedad `preferredLanguage`, como el Lab 2A; wpsadmin sigue funcionando. Host vacío: sin LDAP |
| `TLS_ISSUER` | Un `ClusterIssuer` de cert-manager: el Ingress recibe un certificado público (Secret `dx-tls-public`); HAProxy mantiene detrás su certificado autofirmado |

Qué cambia en la carpeta:
- solo se crea el namespace `DX_NS`;
- `install.sh --cleanup` y `uninstall.sh` no tocan nada más (ningún namespace de herramientas de terceros);
- `install.sh --yes` se ejecuta sin preguntar. Cada paso escribe `━━━ [n/m] <etapa> · <id> · <título>`, fácil de
  seguir desde un log;
- `install.sh` necesita `kubectl`, `helm`, `openssl` y `curl`. La imagen del instalador los trae todos, y también el
  CLI.

Ejemplo: un Job con la imagen del instalador, las respuestas montadas desde un Secret y `secrets: "include"`, para que
la contraseña de wpsadmin sea la elegida.

```bash
node /app/bin/dx-installer.mjs generate --answers /answers/answers.json --secrets include --out /work/dx-install
/work/dx-install/install.sh --yes
```

```json
{"schemaVersion": 1, "preset": "basic", "platform": "kubernetes", "DX_NS": "dx-basic-1", "DX_HOST": "dx-basic-1.example.com",
 "INGRESS_KIND": "nginx", "SC_RWO": "longhorn", "SC_RWX": "longhorn", "altRegistry": true,
 "REGISTRY": "harbor.example.com/hclcr-proxy", "IMAGE_PULL_SECRET": "harbor-hclcr-pull", "TLS_ISSUER": "letsencrypt-prod",
 "LAB_PASSWORD": "<la contraseña de wpsadmin: solo en un Secret>"}
```

El Job instala con `helm` real (nunca con Argo CD), así que su ServiceAccount necesita permisos amplios en el clúster:
crear namespaces y todo lo que el chart de HCL crea dentro (Roles, RoleBindings, StatefulSets, PVCs...). La
documentación del plugin HCL DX de Backstage explica la ServiceAccount que usa.

## Línea de comandos

```bash
npx dx-installer generate --answers answers.json --out dx-install      # la carpeta (enumera los ficheros con secretos)
npx dx-installer generate --answers answers.json --zip dx-install.zip  # el zip, como lo descarga la página
npx dx-installer generate --answers answers.json --lang es --secrets include --out dx-install
npx dx-installer schema                                                # el JSON Schema de las respuestas
npx dx-installer --version
```

Código de salida: `0` hecho, `1` las respuestas o la carpeta tienen errores (en stderr), `2` uso incorrecto. Con
`--out`, los ficheros con secretos se escriben con permisos `600`.

## Caso de uso: Backstage «Nuevo entorno de HCL DX»

1. La plantilla pide las respuestas (su formulario se puede construir con `schema()`).
2. Una acción del scaffolder llama a `generateInstall()` y abre un merge request con `files` en un repositorio de
   entornos (no un repositorio que aplique Argo CD).
3. `secretFiles` van a OpenBao o se entregan a quien instala; nunca a Git.
4. Tras la revisión, una persona ejecuta `install.sh` con `helm` de verdad (o lo ejecuta un job manual de CI),
   siguiendo el RUNBOOK.
