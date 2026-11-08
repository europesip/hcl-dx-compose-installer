# CI/CD avanzado: OpenBao, Argo CD y el operador de Script Applications

[English](openbao.md) · **Español** · [README](../README.es.md)

En el despliegue **Personalizado**, la sección *CI/CD avanzado* añade tres herramientas opcionales. Vienen
desactivadas y **aún no están disponibles en OpenShift**, porque no se han probado lo suficiente allí. No forman
parte de la instalación de DX.

| Herramienta | Para qué sirve |
|---|---|
| **OpenBao** (gestor de secretos) + External Secrets Operator | Guarda las contraseñas y claves de la instalación; nadie las escribe en ficheros |
| **Argo CD** (GitOps) | Mantiene el clúster igual que un repositorio Git, con historial y vuelta atrás |
| **Keycloak** (inicio de sesión único) | Los usuarios de DX entran en la página de Keycloak con su cuenta del OpenLDAP (SSO, doble factor si lo activas); independiente de OpenBao. Sus peculiaridades: [Software de terceros](third-party.es.md) |
| **Operador de Script Applications** (EUROPESIP, opcional) | Despliega Script Applications, páginas, ficheros del DAM y bases de datos desde recursos de Kubernetes y los mantiene en DX ([repositorio](https://github.com/europesip/hcl-dx-scriptapp-operator)) |

Las tres van en el mismo namespace que el resto de herramientas compartidas (OpenLDAP, PostgreSQL…): `dx-shared`
por defecto, aunque puedes elegir otro. El zip las deja en `lab-cicd/`, e `install.sh` las instala como pasos
extra de la etapa 0 (OpenBao, Argo CD) y de la etapa 1 (el operador, cuando DX ya funciona).

## OpenBao en pocas palabras

[OpenBao](https://openbao.org) es la versión de código abierto de HashiCorp Vault, de la Linux Foundation, con
licencia MPL 2.0. Tiene la misma API, el mismo CLI y los mismos conceptos, así que todo lo de aquí vale también para
un HashiCorp Vault que ya tengas. Lo elegimos frente a Vault porque Vault dejó de ser software libre (licencia BSL
desde 2023).

```
 operador ──(interfaz o install.sh)──► OpenBao  KV  dx/<namespace de DX>/{registry, wpsadmin, ai, tls, pg-*, ...}
                                          │  Kubernetes auth, rol eso-<namespace de DX>: solo lectura, solo esa ruta
                                          ▼
                External Secrets Operator ──► los Secrets de Kubernetes que usan DX y las dependencias (cada 5 min)
```

### Usar el gestor de secretos

En la página de credenciales, con OpenBao elegido, marca **Usar el gestor de secretos (OpenBao)**. Entonces **solo
se pide tu usuario de HCL Harbor**, que decide si se puede incluir el script de tablas de PostgreSQL. En el zip no
se escribe nada secreto:

- Cada `secrets.yaml` contiene `ExternalSecret`s con los mismos nombres, tipos y etiquetas que antes, y External
  Secrets Operator crea los Secrets desde OpenBao. Lo mismo ocurre con las properties de base de datos del Web
  Engine, el certificado de HAProxy y los certificados de OpenSearch.
- Los comandos que necesitan un valor al ejecutarse (el login en el registro, las comprobaciones opcionales) lo
  leen de OpenBao con `obv <ruta> <clave>`.

**Los secretos externos** los da de alta el operador:

| OpenBao (`dx/<namespace de DX>/…`) | Qué es |
|---|---|
| `registry` `password` | secreto CLI de HCL Harbor |
| `wpsadmin` `password` | administrador de DX |
| `demo-users` `password` | usuarios de demo del OpenLDAP (Enter = el mismo que wpsadmin) |
| `ai` `key` | clave de OpenRouter, Bedrock o Anthropic |
| `ad` `bindPassword` / `oracle` `password` | solo si usas Active Directory / Oracle |

**Los secretos internos** se generan al azar dentro de OpenBao:
- el administrador del LDAP;
- los usuarios de PostgreSQL (`pg-superuser`, `pg-dxuser`, `pg-iquser`);
- la clave maestra de LiteLLM;
- el certificado de HAProxy (autofirmado, salvo que des tus ficheros);
- la CA y los certificados de OpenSearch (`search-certs`).

El paso **C-2** (`lab-cicd/openbao-secrets.sh`) pide de forma oculta los secretos externos que falten, o los toma
de las variables de entorno que aparecen al principio del script. Solo añade lo que falta, así que volver a
ejecutarlo no cambia nada. Para darlos de alta antes desde la interfaz:

```bash
kubectl -n dx-shared port-forward svc/openbao 8200:8200
# http://localhost:8200/ui · método "Username" · usuario operador · contraseña en lab-cicd/openbao/operador.password
```

### Las claves de desbloqueo

La primera vez, `install.sh` inicializa OpenBao y escribe **las 5 claves de desbloqueo y el token raíz** en
`lab-cicd/openbao/openbao-init.txt` (carpeta con permisos 700, fichero con 600). **Guarda ese fichero en lugar
seguro:** sin 3 de las 5 claves, los datos de OpenBao no se pueden recuperar. En un entorno real, reparte las
claves entre varias personas y revoca el token raíz una vez configurado (`bao token revoke`).

### Si el pod de OpenBao se reinicia: desbloquearlo

OpenBao guarda sus datos cifrados y no almacena la clave en ningún sitio. Por eso, **cada vez que su pod se
reinicia** (reinicio de un nodo, una actualización…) arranca *sellado*. Mientras está sellado, External Secrets
Operator no puede refrescar los Secrets; los que ya existen siguen funcionando. Se desbloquea con 3 de las 5 claves:

```bash
./lab-cicd/openbao-unseal.sh                 # desde la carpeta de la instalación
OPENBAO_DIR=/lugar/seguro ./lab-cicd/openbao-unseal.sh   # si las claves están en otro sitio
kubectl -n dx-shared get pod openbao-0       # 1/1 Ready cuando está desbloqueado
```

A mano equivale a ejecutar `bao operator unseal` tres veces en el pod, con tres claves distintas. En producción,
usa **auto-unseal** con un KMS o HSM (AWS KMS, Azure Key Vault, GCP KMS, PKCS#11) o el sello transit de otro
OpenBao, para que se desbloquee solo.

### Cambiar una contraseña de DX: hace falta un helm upgrade

Al cambiar un valor en OpenBao, External Secrets Operator actualiza el Secret de Kubernetes en 5 minutos como
máximo, o al momento con `kubectl -n <ns> annotate externalsecret <nombre> force-sync=$(date +%s) --overwrite`.
**En la mayoría de las dependencias eso basta.** Por ejemplo, CloudNativePG aplica solo una contraseña nueva de
PostgreSQL gracias a la etiqueta `cnpg.io/reload`.

**HCL DX funciona distinto.** El chart de DX no usa tu Secret directamente: en cada `helm install` o
`helm upgrade` lo **copia** (con `lookup` de Helm) a un Secret suyo, `<release>-web-engine-wps`. El Web Engine lee
esa copia al arrancar y fija con ella la contraseña de wpsadmin. Por eso, para cambiar la contraseña de wpsadmin:

1. Cámbiala en OpenBao: desde la interfaz, o con `bao kv patch -mount=dx dx-demo/wpsadmin password=-` como `operador`.
2. Vuelve a ejecutar el `helm upgrade` de DX: el mismo comando que el último paso de DX de `install.sh`
   (`./install.sh --list`). Así se copia el valor nuevo.
3. Reinicia el Web Engine: `kubectl -n <namespace de DX> rollout restart sts/<release>-web-engine` (unos 5
   minutos). La contraseña antigua deja de funcionar.

Lo probamos en CF239: después de los pasos 2 y 3, la contraseña nueva funciona y la antigua no. Lo mismo vale para
todos los secretos de DX que el chart copia (LTPA, DAM, búsqueda remota…). Una herramienta como Stakater Reloader
podría hacer el paso 3, pero no el 2. Además, cambiar una contraseña en OpenBao no la cambia en el sistema que la
usa (el directorio LDAP, Oracle, el proveedor de IA): cámbiala primero allí.

### Desinstalar

`./install.sh --cleanup` borra DX y las dependencias, pero **conserva las herramientas de CI/CD**: OpenBao guarda
los secretos, y con ellos una instalación nueva arranca directamente. `./install.sh --cleanup --all` también las
borra, incluidos los datos de OpenBao.

### OpenBao ya instalado

Elige **Ya instalado** cuando lo creó una instalación anterior de este instalador en el mismo namespace.
`install.sh` se salta el `helm install` y lo reutiliza. Necesita la carpeta `openbao/` de aquella instalación:
cópiala en `lab-cicd/openbao/` o indica dónde está con `OPENBAO_DIR`.

## Argo CD

Argo CD 3.6.1 (chart `oci://ghcr.io/argoproj/argo-helm/argo-cd` 10.15.0) se instala con los health checks de los
recursos del operador. Así muestra cada DXScriptApplication, DXPage, DXTheme, DXDamCollection o DXDatabase como Healthy,
Progressing o Degraded, según lo que el operador ve dentro de DX. No se crea ninguna Application: apúntalo a tu
propio repositorio.

```bash
kubectl -n dx-shared port-forward svc/argocd-server 8080:443          # https://localhost:8080, usuario admin
kubectl -n dx-shared get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo
```

## Operador de Script Applications

El operador (chart `oci://ghcr.io/europesip/charts/hcl-dx-scriptapp-operator` 0.1.1) se instala cuando DX ya
funciona. Para comprobarlo, `install.sh` despliega además el ejemplo **hello** en una página («DXOP Hola»):
`lab-cicd/dxop-hello.yaml`. Su imagen incluye HCL DXClient, así que hay que aceptar su licencia en la página de
credenciales. Su manual y sus ejemplos están en
[su repositorio](https://github.com/europesip/hcl-dx-scriptapp-operator).
