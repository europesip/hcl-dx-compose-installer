<p align="center"><img src="public/europesip-logo.svg" alt="EUROPESIP" width="260"></p>

<h1 align="center">Instalador de HCL DX Compose</h1>

<p align="center"><b>De cero a un HCL DX Compose funcionando, paso a paso.</b><br>
Un instalador web guiado para pruebas de concepto y entornos de pruebas, de <a href="https://www.europesip.com">EUROPESIP</a>.</p>

<p align="center"><a href="README.md">English</a> · <b>Español</b> · <a href="docs/faq.es.md">Preguntas frecuentes</a> · <a href="docs/deploy.es.md">Docker y Helm</a> · <a href="docs/aws.es.md">AWS</a> · <a href="docs/how-it-works.es.md">Cómo funciona</a> · <a href="CHANGELOG.es.md">Versiones</a></p>

<p align="center"><img src="docs/images/welcome.es.jpg" alt="La página de bienvenida del instalador" width="860"></p>

## Qué hace

- 🧭 **Te guía pantalla a pantalla**, en español o en inglés (empieza en el idioma de tu navegador).
- ☸️ **Prepara tu entorno.** Comprueba tu clúster, o te crea uno: en tu PC (WSL2), en una máquina Linux o en AWS
  (EC2 + k3s, EKS, ROSA), con estimación de coste y borrado con un clic.
- 🚀 **Instala lo que elijas:** Todo, Personalizado o la demo **Webinar · Showroom**, en etapas claras:
  0 Pre-requisitos · 1 Base DX · 2 LDAP · 3 Base de datos externa · 4 Asistente de IA · 5 Búsqueda.
- 📦 **Te entrega una instalación lista para ejecutar:** scripts rellenos con tus valores, un RUNBOOK y, para el webinar,
  el guion del presentador en Word.

<table>
<tr>
<td width="50%"><img src="docs/images/environment.es.jpg" alt="Elige dónde crear el entorno"><br><sub><b>Tu entorno</b>: tu PC, una máquina Linux o AWS</sub></td>
<td width="50%"><img src="docs/images/aws.es.jpg" alt="Opciones de AWS con estimación de precio"><br><sub><b>AWS</b>: estimación de precio, progreso en directo, bórralo al terminar</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/images/deployment.es.jpg" alt="Despliegues rápidos"><br><sub><b>Despliegues rápidos</b>: Todo, Personalizado o Webinar</sub></td>
<td width="50%"><img src="docs/images/download.es.jpg" alt="Descarga la instalación"><br><sub><b>Descarga</b>: zip, RUNBOOK y el guion del webinar</sub></td>
</tr>
</table>

## Pon en marcha el instalador

**Opción 1 · En tu máquina Windows o Mac, con Docker**

```bash
docker run --rm -p 8080:8080 ghcr.io/europesip/hcl-dx-compose-installer:2.3.1
```

Después abre http://localhost:8080.

**Opción 2 · En un clúster Kubernetes u OpenShift, con Helm**

```bash
helm upgrade --install dx-installer oci://ghcr.io/europesip/charts/hcl-dx-compose-installer --version 2.3.1 \
  -n dx-installer --create-namespace --set ingress.enabled=true --set ingress.host=installer.example.com \
  --set auth.enabled=true --set auth.username=admin --set auth.password='S3cret!'
```

> 🔒 ¿Accesible desde fuera? Deja `auth.enabled=true`. Todas las opciones del chart y de la imagen:
> **[Docker y Helm](docs/deploy.es.md)**.

## Después, instala DX Compose

Descomprime lo que descargaste y ejecútalo en una máquina con `kubectl` y `helm` apuntando a tu clúster:

```bash
unzip dx-compose-install.zip && cd dx-install && ./install.sh     # o, para el webinar: ./prepare.sh y después ./demo.sh
```

## 🔒 Seguridad

Introducir credenciales de la nube o de otros sistemas (registro de HCL, OpenRouter, Red Hat, AWS) siempre es un riesgo,
y más en una herramienta de terceros. Lo sabemos, y por eso:

- **El código es público y gratuito** (MIT): cualquiera puede comprobar que las credenciales no se envían ni se guardan
  en ninguna parte.
- **La instalación se genera en tu navegador.** Los valores del registro, de OpenRouter y las contraseñas no salen de
  él; van a los scripts de tu zip.
- **Las credenciales de AWS y Red Hat solo van a tu propio instalador**, para la operación que pidas: nunca a disco ni
  a los logs.
- **Puedes limitar su salida a Internet:** sin las funciones de AWS, el pod (NetworkPolicy) o el contenedor no se
  conecta a nada.
- **Usa la imagen original** (`ghcr.io/europesip/hcl-dx-compose-installer`) o constrúyela desde el código.
- **Buena práctica:** usa credenciales efímeras, o rótalas al acabar la instalación.

Todo el detalle: **[Seguridad del instalador](docs/security.es.md)**.

## Preguntas frecuentes

- **¿Sirve para producción?** No: pruebas de concepto, desarrollo y pruebas.
- **¿No tienes Kubernetes?** El instalador lo crea. Lo recomendado es WSL2 en tu PC: 24 GB de RAM y 8 núcleos.
- **¿AWS cuesta dinero?** Sí, desde ~0,89 USD/hora. Bórralo desde la página al terminar.
- **¿Se envían mis credenciales a algún sitio?** No: ver [Seguridad](docs/security.es.md).

Más preguntas: **[Preguntas frecuentes](docs/faq.es.md)**.

## Saber más

| | |
|---|---|
| [Docker y Helm](docs/deploy.es.md) | Todas las opciones para ejecutar el instalador, la autenticación, qué hacer con la descarga |
| [Entornos de AWS](docs/aws.es.md) | Qué crea cada opción de AWS, su precio, cómo borrarla, ROSA y tu cuenta de Red Hat |
| [CI/CD avanzado: OpenBao](docs/openbao.es.md) | Gestor de secretos OpenBao, Argo CD y el operador de Script Applications: desbloqueo, y por qué cambiar una contraseña de DX necesita un helm upgrade |
| [Software de terceros](docs/third-party.es.md) | OpenLDAP, PostgreSQL, LiteLLM, MCP, OpenBao, Argo CD y Keycloak: las peculiaridades y trucos encontrados en el laboratorio |
| [Seguridad](docs/security.es.md) | Adónde va cada credencial, salida a Internet limitada, la imagen original, buenas prácticas |
| [Cómo funciona](docs/how-it-works.es.md) | Tus datos, el código, desarrollo y CI |
| [Laboratorios de HCL DX Compose](https://github.com/europesip/hcl-dx-compose-labs) | Las guías para aprender cada paso a mano |
| [ÓRBITA](https://github.com/europesip/orbita) | Una intranet para HCL DX Compose que el instalador puede añadir |

Las contribuciones son bienvenidas: abre un issue o un pull request.

## Licencia y contacto

[MIT](LICENSE) · [NOTICE](NOTICE). HCL, HCL Digital Experience y HCL DX Compose son marcas de HCL Technologies; este
proyecto no es un producto de HCL.

**EUROPESIP** · https://www.europesip.com · info@europesip.com
