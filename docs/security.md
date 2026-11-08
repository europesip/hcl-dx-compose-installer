# Security of the installer

**English** · [Español](security.es.md) · [README](../README.md)

Typing access credentials for the cloud or other systems (the HCL registry, OpenRouter, Red Hat, AWS…) is **always a
security risk**, all the more in a third-party product such as this wizard. At EUROPESIP we are aware of it. That is
why the code of the installer is **public and free** ([MIT](../LICENSE)): anyone can check what it does with each
value, and that nothing is sent or stored anywhere it should not be.

## Where each value goes

| What you type | Where it goes | Stored? |
|---|---|---|
| HCL registry user and CLI secret, OpenRouter key, passwords, Active Directory, Oracle | **Nowhere.** The installation is generated in your browser and the values are written into the scripts of the zip you download | No. The page remembers your choices in your browser, never the credentials |
| The same credentials with **Use the secrets manager (OpenBao)** | **Not typed in the installer** (only the Harbor user). The operator enters them in OpenBao or when `install.sh` asks; External Secrets Operator creates the Kubernetes Secrets. See [Advanced CI/CD: OpenBao](openbao.md) | In OpenBao, inside your cluster |
| AWS keys, Red Hat token or service account | Only to the **server of this installer** (the container or pod you run), and only when you ask it to create or delete an AWS environment. It passes them to the AWS / ROSA CLI for that operation | No. Never on disk or in the logs; they are masked in the output and forgotten when the operation ends |

You can check it yourself:
- The page is served with a Content-Security-Policy with `connect-src 'self'`: the browser blocks any request to a
  server other than the installer itself. Your browser's developer tools (Network tab) show every request.
- The server is one file, [`server/index.mjs`](../server/index.mjs), and the AWS scripts are in
  [`server/aws`](../server/aws).

## Run it with limited outbound access

The installer only needs to connect to the Internet for the AWS functions. Without them, nothing leaves it.

- **Kubernetes:** `--set aws.enabled=false --set networkPolicy.enabled=true`. The NetworkPolicy of the chart then allows
  **no outbound traffic at all**: the pod cannot connect anywhere. With the AWS functions on, it allows only DNS and
  HTTPS, SSH and 6443 (the AWS APIs, the new instance and its Kubernetes API).
- **Docker:** `-e AWS_ENABLED=false` hides the AWS functions and the server never makes a connection. You can also
  block the outbound traffic of the container with your firewall.
- **Even stricter:** create the AWS environment from your own machine with the [scripts](aws.md), and use the page
  only to generate the installation.

## Use the original image

Use only the official image, **`ghcr.io/europesip/hcl-dx-compose-installer`**, published by the GitHub Actions of this
repository. Pin a version (`:2.3.1`) or its digest. If you prefer, build it yourself from the source code:

```bash
git clone https://github.com/europesip/hcl-dx-compose-installer.git && cd hcl-dx-compose-installer
docker build -t dx-installer . && docker run --rm -p 8080:8080 dx-installer
```

## Good practice: ephemeral credentials, rotated afterwards

| Credential | Recommended |
|---|---|
| **AWS** | Temporary credentials (a session token from AWS IAM Identity Center or `aws sts get-session-token`), or an IAM user created only for this and deleted afterwards |
| **Red Hat** | The device code (nothing to paste), or a service account created only for this and deleted with the cluster |
| **OpenRouter** | A key only for this PoC, with a spending limit, deleted when you finish |
| **HCL registry** | Regenerate your CLI secret at hclcr.io when you finish (then update the `regcred` pull secret of the cluster) |
| **Lab passwords** | Change them after the installation, or delete the environment when the PoC ends |

The zip you download contains the credentials in plain text (it has to, to install): keep it private and delete it
when you no longer need it. The Word script of the webinar hides them by default.

## Protect the page

If the installer can be reached from outside your machine, turn on its user and password: `auth.enabled=true` in the
chart, or `AUTH_USER` / `AUTH_PASSWORD` in Docker. See [Docker and Helm](deploy.md).

## Report a problem

Found a security problem? Write to info@europesip.com rather than opening a public issue.
