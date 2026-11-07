# AWS environments

**English** · [Español](aws.es.md) · [README](../README.md)

## AWS environments from your own machine

The scripts the page runs are in [`server/aws`](../server/aws). You can run them yourself with the AWS CLI
(and eksctl for EKS, rosa and oc for ROSA):

```bash
cd server/aws
NAME=dx-compose-poc REGION=eu-west-1 ./ec2-create.sh     # or eks-create.sh / rosa-create.sh
NAME=dx-compose-poc REGION=eu-west-1 ./ec2-destroy.sh    # deletes everything tagged dx-installer=NAME
```

| Script | What it creates | Approx. price (eu-west-1) |
|---|---|---|
| `ec2-create.sh` | one m6i.4xlarge (Ubuntu 24.04, 200 GB gp3) with k3s, Helm, Longhorn and the StorageClasses `dx-deploy-rwo` / `dx-deploy-rwx`, Traefik; DX at `dx-demo.<IP>.nip.io` | ~0.89 USD/hour |
| `eks-create.sh` | EKS with 2 × m6i.2xlarge in its own VPC, EBS CSI (RWO), EFS CSI and an EFS file system (RWX), ingress-nginx behind an NLB, a kubeconfig with its own token | ~1.08 USD/hour |
| `rosa-create.sh` | ROSA with hosted control planes, 2 workers, EBS and EFS (experimental) | ~2 USD/hour |

They cost money while they exist: delete them when you finish.

**Network of the EC2 instance (`VPC_MODE`).** By default (`name`) the instance goes in the VPC named `VPC_NAME` (the
name of the environment if empty). If it does not exist, a dedicated VPC is created (one public subnet and an Internet
gateway) and deleted with the environment; if it exists, it is used as it is (it needs a public subnet) and it is never
deleted. `VPC_MODE=default` uses the default VPC of the region. EKS and ROSA always create their own VPC.

**ROSA and your Red Hat account.** ROSA is managed by Red Hat, so creating and deleting the cluster needs a sign-in to
your Red Hat account (OpenShift Cluster Manager). The page and `rosa-create.sh` / `rosa-destroy.sh` accept three ways:

| Way | Variables | How to get it |
|---|---|---|
| **Service account** (recommended for automation) | `RHCS_CLIENT_ID`, `RHCS_CLIENT_SECRET` | console.redhat.com › Identity & Access Management › Service accounts; give it access to OpenShift Cluster Manager in User Access (for example, the OCM Cluster Provisioner role) |
| **Device code** | `RH_DEVICE_CODE=1` | Nothing to paste: a link and a code appear (on the page or in the output); approve them in your browser with your Red Hat account |
| **Offline token** | `RHCS_TOKEN` | console.redhat.com/openshift/token/rosa (deprecated by Red Hat in favour of service accounts, still works) |

ROSA must also be enabled once in your AWS account (AWS console › Red Hat OpenShift Service on AWS › Get started).
The ROSA path has not been tested end to end yet.
