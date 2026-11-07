# Entornos de AWS

[English](aws.md) · **Español** · [README](../README.es.md)

## Entornos de AWS desde tu propia máquina

Los scripts que ejecuta la página están en [`server/aws`](../server/aws). Puedes ejecutarlos tú con el AWS CLI
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

**Red de la instancia EC2 (`VPC_MODE`).** Por defecto (`name`) la instancia va en la VPC llamada `VPC_NAME` (el nombre
del entorno si se deja vacío). Si no existe, se crea una VPC dedicada (una subred pública y un Internet gateway) que se
borra con el entorno; si existe, se usa tal cual (necesita una subred pública) y nunca se borra. `VPC_MODE=default` usa
la VPC por defecto de la región. EKS y ROSA siempre crean su propia VPC.

**ROSA y tu cuenta de Red Hat.** ROSA lo gestiona Red Hat, así que crear y borrar el clúster requiere entrar en tu cuenta
de Red Hat (OpenShift Cluster Manager). La página y `rosa-create.sh` / `rosa-destroy.sh` admiten tres formas:

| Forma | Variables | Cómo conseguirla |
|---|---|---|
| **Cuenta de servicio** (recomendada para automatizar) | `RHCS_CLIENT_ID`, `RHCS_CLIENT_SECRET` | console.redhat.com › Identity & Access Management › Service accounts; dale acceso a OpenShift Cluster Manager en User Access (por ejemplo, el rol OCM Cluster Provisioner) |
| **Código de dispositivo** | `RH_DEVICE_CODE=1` | Sin pegar nada: aparecen un enlace y un código (en la página o en la salida); apruébalos en tu navegador con tu cuenta de Red Hat |
| **Token offline** | `RHCS_TOKEN` | console.redhat.com/openshift/token/rosa (obsoleto para Red Hat en favor de las cuentas de servicio, sigue funcionando) |

Además, ROSA tiene que estar habilitado una vez en tu cuenta de AWS (consola de AWS › Red Hat OpenShift Service on AWS ›
Get started). La vía de ROSA aún no se ha probado de principio a fin.
