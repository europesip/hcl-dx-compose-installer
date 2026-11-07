# Seguridad del instalador

[English](security.md) · **Español** · [README](../README.es.md)

Introducir credenciales de acceso a la nube o a otros sistemas (el registro de HCL, OpenRouter, Red Hat, AWS…) es
**siempre un riesgo de seguridad**, y más en un producto de terceros como este asistente. En EUROPESIP somos conscientes
de ello. Por eso el código del instalador es **público y gratuito** ([MIT](../LICENSE)): cualquiera puede comprobar qué
hace con cada valor, y que nada se envía ni se guarda donde no debe.

## Adónde va cada valor

| Lo que escribes | Adónde va | ¿Se guarda? |
|---|---|---|
| Usuario y CLI secret del registro de HCL, clave de OpenRouter, contraseñas, Active Directory, Oracle | **A ninguna parte.** La instalación se genera en tu navegador y los valores se escriben en los scripts del zip que descargas | No. La página recuerda tus elecciones en tu navegador, nunca las credenciales |
| Claves de AWS, token o cuenta de servicio de Red Hat | Solo al **servidor de este instalador** (el contenedor o pod que tú ejecutas), y solo cuando le pides crear o borrar un entorno de AWS. Se las pasa al CLI de AWS / ROSA para esa operación | No. Nunca en disco ni en los logs; se enmascaran en la salida y se olvidan al terminar la operación |

Puedes comprobarlo tú mismo:
- La página se sirve con una Content-Security-Policy con `connect-src 'self'`: el navegador bloquea cualquier petición a
  un servidor que no sea el propio instalador. Las herramientas de desarrollo de tu navegador (pestaña Red) muestran
  cada petición.
- El servidor es un único fichero, [`server/index.mjs`](../server/index.mjs), y los scripts de AWS están en
  [`server/aws`](../server/aws).

## Ejecutarlo con la salida a Internet limitada

El instalador solo necesita conectarse a Internet para las funciones de AWS. Sin ellas, nada sale de él.

- **Kubernetes:** `--set aws.enabled=false --set networkPolicy.enabled=true`. La NetworkPolicy del chart no permite
  entonces **ningún tráfico de salida**: el pod no puede conectarse a ningún sitio. Con las funciones de AWS activas,
  permite solo DNS y HTTPS, SSH y 6443 (las APIs de AWS, la nueva instancia y su API de Kubernetes).
- **Docker:** `-e AWS_ENABLED=false` oculta las funciones de AWS y el servidor no abre ninguna conexión. También puedes
  bloquear el tráfico de salida del contenedor con tu cortafuegos.
- **Aún más estricto:** crea el entorno de AWS desde tu propia máquina con los [scripts](aws.es.md), y usa la página solo
  para generar la instalación.

## Usa la imagen original

Usa solo la imagen oficial, **`ghcr.io/europesip/hcl-dx-compose-installer`**, publicada por las GitHub Actions de este
repositorio. Fija una versión (`:2.0.0`) o su digest. Si lo prefieres, constrúyela tú desde el código fuente:

```bash
git clone https://github.com/europesip/hcl-dx-compose-installer.git && cd hcl-dx-compose-installer
docker build -t dx-installer . && docker run --rm -p 8080:8080 dx-installer
```

## Buena práctica: credenciales efímeras, rotadas después

| Credencial | Recomendado |
|---|---|
| **AWS** | Credenciales temporales (un session token de AWS IAM Identity Center o de `aws sts get-session-token`), o un usuario IAM creado solo para esto y borrado después |
| **Red Hat** | El código de dispositivo (no hay que pegar nada), o una cuenta de servicio creada solo para esto y borrada con el clúster |
| **OpenRouter** | Una clave solo para esta PoC, con límite de gasto, borrada al terminar |
| **Registro de HCL** | Regenera tu CLI secret en hclcr.io al terminar (y actualiza después el pull secret `regcred` del clúster) |
| **Contraseñas del lab** | Cámbialas después de la instalación, o borra el entorno al terminar la PoC |

El zip que descargas contiene las credenciales en texto plano (tiene que llevarlas para instalar): guárdalo en privado y
bórralo cuando ya no lo necesites. El guion de Word del webinar las oculta por defecto.

## Protege la página

Si el instalador es accesible desde fuera de tu máquina, activa su usuario y contraseña: `auth.enabled=true` en el chart,
o `AUTH_USER` / `AUTH_PASSWORD` en Docker. Ver [Docker y Helm](deploy.es.md).

## Avisar de un problema

¿Has encontrado un problema de seguridad? Escribe a info@europesip.com en lugar de abrir un issue público.
