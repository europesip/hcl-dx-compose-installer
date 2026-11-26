# DX Installer Wizard · Errores frecuentes

[English](troubleshooting.md) · **Español** · [Preguntas frecuentes](faq.es.md) · [README](https://github.com/europesip/hcl-dx-compose-installer/blob/main/README.es.md)

Problemas que nos han comunicado los usuarios, con su causa y su solución. Para pedir ayuda, mira [el final de esta página](#pedir-ayuda).

## `--wait=legacy` o `--force-conflicts`: opción desconocida

**Causa:** la carpeta se generó para **Helm 4** (lo que viene por defecto, y lo que instala hoy `apt-get`), y la
máquina tiene **Helm 3**. `--wait=legacy` y `--force-conflicts` solo existen en Helm 4.

**Solución:** desde el instalador 2.6, los scripts adaptan las opciones solos cuando encuentran Helm 3. Con una carpeta
anterior, o si copias los comandos del RUNBOOK: usa `--wait` en lugar de `--wait=legacy` y quita `--force-conflicts`
(etapa 4, IQ). También puedes elegir Helm 3 en el instalador, o instalar Helm 4. `helm version` te dice cuál tienes.

## Todos los pods están en Running, pero el portal no responde en los puertos 80/443

Comprueba dónde falla antes de cambiar nada con el paso «Diagnosticar el acceso a DX, capa a capa» (su número está en
`./install.sh --list`, normalmente 1-7): `./install.sh --from 1-7 --to 1-7 --verify` prueba DX sin el Ingress (`kubectl port-forward`), después el controlador de Ingress, el puerto 443
y el DNS. La primera capa que falla es la que hay que revisar.

**k3s dentro de WSL, instalado como «Tu clúster» (no como el PoC en WSL2).** El caso más frecuente. k3s publica Traefik
en la IP interna de WSL (servicelb), no en `localhost`, así que con la red por defecto de WSL (NAT) **el navegador de
Windows no llega por `localhost` ni por `127.0.0.1`**, aunque desde dentro de WSL todo funcione (el paso de diagnóstico
dice OK). Opciones, de la más sencilla a la menos:

- Elige **«Mi PC con Windows (WSL2)»** en el instalador: configura Traefik (o ingress-nginx) en `127.0.0.1:80/443` de WSL, al que
  Windows llega por `localhost`, y usa `dx-demo.127.0.0.1.nip.io`.
- O activa la red en espejo de WSL: `networkingMode=mirrored` en la sección `[wsl2]` de `%USERPROFILE%\.wslconfig`, y
  después `wsl --shutdown`.
- O pon la IP de WSL (`hostname -I`, la primera) en el fichero `hosts` de Windows para tu nombre de host. Cambia cada
  vez que arranca WSL.

**Puertos 80/443 ya ocupados en Windows** (IIS, Docker Desktop, una VPN u otro proxy): `netstat -ano | findstr ":443
:80 "` en PowerShell muestra quién los tiene.

**Un clúster en la nube o en tu centro de datos:** el Service del controlador de Ingress necesita una IP externa
(`kubectl get svc -A | grep -iE 'traefik|nginx'`): un LoadBalancer del proveedor (a veces con sus propias anotaciones),
MetalLB, o el cortafuegos abierto para 80/443 hacia los nodos.

## El nombre de host no resuelve (`*.nip.io`)

Algunos routers y servidores DNS corporativos bloquean los nombres que resuelven a direcciones privadas o a `127.0.0.1`
(protección contra *DNS rebinding*), así que `dx-demo.127.0.0.1.nip.io` no resuelve. Añade el nombre al fichero `hosts`
(de Windows y, si usas también la terminal, de WSL) apuntando a la dirección del Ingress.

## HTTP 404 justo después de crear el Ingress

Normal durante unos segundos, mientras el controlador de Ingress carga la ruta nueva. La comprobación del portal lo espera.

## El navegador avisa del certificado

Es lo esperado: salvo que dieras tu propio certificado, los scripts crean uno autofirmado para tu nombre de host.

## `ImagePullBackOff` en los pods de HCL

Las imágenes de HCL vienen de `hclcr.io` con tu cuenta de HCL. Revisa el usuario y el CLI secret de HCL Harbor (pueden
caducar o regenerarse) y que la cuenta tenga acceso a DX Compose. `kubectl -n dx-demo describe pod <pod>` muestra el
error del registro.

## Una descarga falla con 502, 503 o 504

GitHub, los repositorios de Helm y los registros responden así a veces. Los scripts reintentan las descargas; si aun
así falla, continúa más tarde desde el paso: `./install.sh --from <paso>`.

## IQ no usa la dirección o la clave de LiteLLM puestas como variables de entorno

Una página de la documentación de HCL pone `LITELLM_URL` y `LITELLM_API_KEY` en `environment.pod.integrator`. El chart
vuelve a definir las dos variables después de las tuyas, así que ganan las suyas. La dirección va en
`configuration.litellm.liteLlmUrl` y la clave en el Secret `iq-litellm-api-secret`, como hace el instalador.

## Una carpeta generada antes falla con un operador o un extra más nuevo

**Causa:** la carpeta generada fija las versiones con las que se generó (BUILD-INFO.txt: `installer.version`,
`bundle.format`, `third-party charts`, `operator`). Si el clúster se actualizó después, por ejemplo a un DX Delivery
Operator más nuevo, una carpeta anterior bajaba de versión el operador (sus CRD seguían siendo las nuevas), aplicaba
tipos que ya no existían (`ScriptApplication` pasó a `DXScriptApplication` en el operador 0.3.0) y su `--cleanup` no
borraba nada cuando un tipo era desconocido.

**Qué hace la carpeta desde el formato 2** (`BUNDLE_FORMAT=2` al principio de `install.sh`):

- La cabecera de `install.sh` muestra la versión del instalador, el formato de la carpeta y los charts fijados.
- El DX Delivery Operator, OpenBao, External Secrets Operator y Argo CD **nunca bajan de versión**: si el clúster ya
  tiene un chart más nuevo (el operador se busca en todos los namespaces, porque sus CRD son de todo el clúster), el
  paso lo mantiene y lo dice.
- Antes de instalar nada, `install.sh` compara el operador del clúster con el de la carpeta. Si el clúster tiene un
  operador más nuevo que ya no sirve un tipo (o una versión de la API) que usa la carpeta, **se para al principio** y
  dice qué versiones no coinciden. El paso OP-2 comprueba lo mismo antes de aplicar el ejemplo hello.
- `--cleanup` borra, uno a uno, todos los tipos del operador que sirve el clúster, así que ningún namespace se queda en
  Terminating por un tipo desconocido.

**Solución:** genera la carpeta otra vez con el instalador actual y las mismas opciones (lo dice el mensaje) o, en un
clúster de pruebas, desinstala antes el operador más nuevo. Con una carpeta del formato 1 (sin `bundle.format` en
BUILD-INFO.txt), corrige a mano: el `--version` del paso OP-1 (o 1-6), el `kind:` de `lab-cicd/dxop-hello.yaml` y la
lista de tipos del `--cleanup` de `install.sh`.

## Pedir ayuda

Envía:

- `BUILD-INFO.txt` (en la carpeta): para qué se generó (versión del instalador, plataforma, Ingress, Helm y opciones).
  No tiene secretos.
- La salida de `support/environment-info.sh > environment-info.txt`: equipo, herramientas, clúster, Ingress y el acceso
  a DX capa a capa.
- O las dos cosas a la vez, con los datos que pide el soporte de HCL: `./install.sh --collect` (`./demo.sh --collect`
  en el webinar) genera un `.tar.gz` con los secretos enmascarados. Revísalo antes de enviarlo.
