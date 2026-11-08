# HCL DX Compose Installer · FAQ

**English** · [Español](faq.es.md) · [README](../README.md)

**What is it?**
A guided web installer for **HCL DX Compose** by EUROPESIP. It helps you get a Kubernetes environment ready, choose
what to install, and download an installation ready to run (scripts filled in with your values and a RUNBOOK).

**Is it for production?**
No. It is meant for **proofs of concept, development and test environments**. For production, tuning and sizing
are needed; EUROPESIP and HCL partners offer that as a service.

**Is it free?**
Yes, open source under the [MIT licence](../LICENSE). HCL DX Compose itself is an HCL product: you need your own HCL
account to download its images and charts from hclcr.io.

**What do I need?**
An HCL account with access to hclcr.io, a Kubernetes cluster (or a few minutes to create one) and, for the AI
assistant, an OpenRouter API key. To run the installer itself: Docker, or a Kubernetes cluster.

**I don't have Kubernetes. Which environment should I choose?**
- **Your Windows PC with WSL2** (recommended): a single-node k3s that makes the most of your machine. At least 24 GB of
  RAM and 8 cores; modern laptops are usually enough. Free.
- **A Linux machine**: if you already have a Linux server or VM with at least 24 GB of RAM and 8 cores.
- **AWS**: if you don't mind paying for it or want the environment reachable from the Internet. A single EC2 instance
  (~0.89 USD/hour), Amazon EKS (~1.08 USD/hour) or ROSA (~2 USD/hour, experimental).

**How do I stop paying for AWS?**
Delete the environment when you finish: from the page (**Delete everything now**) or with the `*-destroy.sh` script.
Everything the installer creates carries the tag `dx-installer=<name>`, and the scripts check that nothing is left.
See [AWS environments](aws.md).

**What is the Webinar · Showroom mode?**
Exactly what the EUROPESIP webinar shows, in two phases: `prepare.sh` installs every prerequisite except LiteLLM and
stops; on the day, `demo.sh` runs stages 0 to 5 (Prerequisites, Base DX, LDAP, External database, AI Assistant,
Search), showing each command and waiting for Enter. It comes with the presenter's script in Word.

**Are my credentials sent anywhere?**
The installation is generated in your browser: what you type in its steps is not sent to any server. AWS keys go
only to the installer's own server (the container or pod you run) when you ask it to create or delete an AWS
environment, and only for that operation, never to disk or logs. The code is public so that you can check it, and
without the AWS functions the installer can run with no outbound access at all. Details: [Security](security.md).

**How do I use it more safely?**
Use the original EUROPESIP image (or build it from the source), turn on its authentication if it is reachable from
outside, and use ephemeral credentials (AWS session tokens, a Red Hat device code, an OpenRouter key with a limit) or
rotate them when the installation is done. See [Security](security.md).

**Should I protect the page?**
Yes, if the machine or cluster where you deploy it can be reached from outside: turn on its user and password
(`auth.enabled=true` with Helm, `AUTH_USER` / `AUTH_PASSWORD` with Docker). See [Docker and Helm](deploy.md).

**Does it work with OpenShift?**
Yes: choose OpenShift for your own cluster, or create a ROSA cluster on AWS (experimental).

**What about the configuration wizard of the labs?**
This installer replaces it. The wizard of the [HCL DX Compose labs](https://github.com/europesip/hcl-dx-compose-labs)
is frozen; the labs guides are still the reference to learn every step by hand.

**Can I keep the passwords out of the zip?**
Yes: in the Custom deployment, choose OpenBao in *Advanced CI/CD*, then *Use the secrets manager* on the credentials
page. Only your Harbor user is asked; the operator enters the secrets in OpenBao. See [Advanced CI/CD: OpenBao](openbao.md)
(also how to unseal it after a restart, and why a DX password change needs a `helm upgrade`).

**How much CPU and memory do I need?**
The HCL requirement (~8 CPU, ~14 GiB) covers only the HCL software. The prerequisites (OpenLDAP, PostgreSQL, LiteLLM) and
the extras (Keycloak, OpenBao, Argo CD, ÓRBITA...) add to it: the installer shows the estimate as you choose the options,
and RUNBOOK.md repeats it. Everything together asks for about 9.3 CPU and 20.6 GiB (look for ~13 CPU and ~27 GiB free).

**Can I use my own image registry (Harbor, Quay...) instead of HCL Harbor?**
Yes: on the credentials page, *Use another image registry*. Usual in air-gapped environments, where the security team
controls and scans every image. The registry must already hold a copy of the HCL images and charts with the same names
and paths as in hclcr.io (or proxy / mirror hclcr.io); otherwise change the image paths in the custom values before
installing. The third-party images (OpenLDAP, PostgreSQL, LiteLLM...) still come from their public registries.

**Can DX users sign in with Keycloak?**
Yes: *Keycloak* in the advanced section of the Custom deployment (it needs the OpenLDAP of stage 2, not OpenBao). What
we had to do to make it work: [Third-party software](third-party.md).

**Can I add options, environments or languages?**
Yes, contributions are welcome: open an issue or a pull request. [How it works](how-it-works.md) explains the code.

**Who can help us with a real project?**
EUROPESIP: installation, sizing, migration from the traditional HCL DX, integrations and support.
https://www.europesip.com · info@europesip.com
