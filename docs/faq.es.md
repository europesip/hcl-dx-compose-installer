# Instalador de HCL DX Compose · Preguntas frecuentes

[English](faq.md) · **Español** · [README](../README.es.md)

**¿Qué es?**
Un instalador web guiado para **HCL DX Compose**, de EUROPESIP. Te ayuda a preparar un entorno Kubernetes, elegir qué
instalar y descargar una instalación lista para ejecutar (scripts rellenos con tus valores y un RUNBOOK).

**¿Sirve para producción?**
No. Está pensado para **pruebas de concepto, desarrollo y entornos de pruebas**. Para producción hacen falta ajuste y
dimensionamiento; EUROPESIP y los partners de HCL lo ofrecen como servicio.

**¿Es gratuito?**
Sí, es código abierto con [licencia MIT](../LICENSE). HCL DX Compose es un producto de HCL: necesitas tu propia cuenta de
HCL para descargar sus imágenes y charts de hclcr.io.

**¿Qué necesito?**
Una cuenta de HCL con acceso a hclcr.io, un clúster Kubernetes (o unos minutos para crear uno) y, para el asistente de
IA, una clave de API de OpenRouter. Para ejecutar el propio instalador: Docker, o un clúster Kubernetes.

**No tengo Kubernetes. ¿Qué entorno elijo?**
- **Tu PC con Windows y WSL2** (recomendado): un k3s de un nodo que aprovecha al máximo tu máquina. Al menos 24 GB de RAM
  y 8 núcleos; los portátiles modernos suelen ser suficientes. Gratis.
- **Una máquina Linux**: si ya tienes un servidor Linux o una VM con al menos 24 GB de RAM y 8 núcleos.
- **AWS**: si no te importa pagarlo o quieres que el entorno sea accesible desde Internet. Una instancia EC2
  (~0,89 USD/hora), Amazon EKS (~1,08 USD/hora) o ROSA (~2 USD/hora, experimental).

**¿Cómo dejo de pagar AWS?**
Borra el entorno al terminar: desde la página (**Borrar todo ahora**) o con el script `*-destroy.sh`. Todo lo que crea el
instalador lleva la etiqueta `dx-installer=<nombre>`, y los scripts comprueban que no quede nada. Ver
[Entornos de AWS](aws.es.md).

**¿Qué es el modo Webinar · Showroom?**
Exactamente lo que muestra el webinar de EUROPESIP, en dos fases: `prepare.sh` instala todos los pre-requisitos salvo
LiteLLM y se detiene; el día de la demo, `demo.sh` ejecuta las etapas 0 a 5 (Pre-requisitos, Base DX, LDAP, Base de
datos externa, Asistente de IA, Búsqueda), mostrando cada comando y esperando a Enter. Incluye el guion del presentador
en Word.

**¿Se envían mis credenciales a algún sitio?**
La instalación se genera en tu navegador: lo que escribes en sus pasos no se envía a ningún servidor. Las claves de AWS
solo van al servidor del propio instalador (el contenedor o pod que tú ejecutas) cuando le pides crear o borrar un
entorno de AWS, y solo para esa operación. Detalle: [Cómo funciona](how-it-works.es.md).

**¿Debo proteger la página?**
Sí, si la máquina o el clúster donde lo despliegas es accesible desde fuera: activa su usuario y contraseña
(`auth.enabled=true` con Helm, `AUTH_USER` / `AUTH_PASSWORD` con Docker). Ver [Docker y Helm](deploy.es.md).

**¿Funciona con OpenShift?**
Sí: elige OpenShift para tu propio clúster, o crea un clúster ROSA en AWS (experimental).

**¿Y el asistente de configuración de los labs?**
Este instalador lo sustituye. El asistente de los [laboratorios de HCL DX Compose](https://github.com/europesip/hcl-dx-compose-labs)
está congelado; las guías de los labs siguen siendo la referencia para aprender cada paso a mano.

**¿Puedo añadir opciones, entornos o idiomas?**
Sí, las contribuciones son bienvenidas: abre un issue o un pull request. [Cómo funciona](how-it-works.es.md) explica el
código.

**¿Quién nos puede ayudar en un proyecto real?**
EUROPESIP: instalación, dimensionamiento, migración desde HCL DX tradicional, integraciones y soporte.
https://www.europesip.com · info@europesip.com
