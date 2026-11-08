# Advanced CI/CD: OpenBao, Argo CD and the Script Application operator

**English** · [Español](openbao.es.md) · [README](../README.md)

In the **Custom** deployment, the *Advanced CI/CD* section adds three optional tools. They are off by default and
are **not available on OpenShift yet**, because they have not been tested enough there. They are not part of the
DX installation itself.

| Tool | What it is for |
|---|---|
| **OpenBao** (secrets manager) + External Secrets Operator | Keeps the passwords and keys of the installation; nobody writes them in files |
| **Argo CD** (GitOps) | Keeps the cluster equal to a Git repository, with history and rollback |
| **Keycloak** (single sign-on) | DX users sign in on the Keycloak page with their OpenLDAP account (SSO, two-factor if you enable it); independent of OpenBao. Its peculiarities: [Third-party software](third-party.md#keycloak-2682-official-operator--stage-0-extra-dx-layer-from-stage-2) |
| **Script Application operator** (EUROPESIP, optional) | Deploys Script Applications, pages, DAM files and databases from Kubernetes resources and keeps them in DX ([repository](https://github.com/europesip/hcl-dx-scriptapp-operator)) |

All three go in the same namespace as the other shared tools (OpenLDAP, PostgreSQL…), `dx-shared` by default.
You can choose another one. The zip puts them in `lab-cicd/`, and `install.sh` installs them as extra steps of
stage 0 (OpenBao, Argo CD) and stage 1 (the operator, once DX is running).

## OpenBao in a nutshell

[OpenBao](https://openbao.org) is the open-source fork of HashiCorp Vault, run by the Linux Foundation under the
MPL 2.0 licence. It has the same API, CLI and concepts, so everything here also works with a HashiCorp Vault you
already have. We chose it over Vault because Vault is no longer open source (BSL licence since 2023).

```
 operator ──(UI or install.sh)──► OpenBao  KV  dx/<DX namespace>/{registry, wpsadmin, ai, tls, pg-*, ...}
                                     │  Kubernetes auth, role eso-<DX namespace>: read-only, only that path
                                     ▼
              External Secrets Operator ──► the Kubernetes Secrets DX and the dependencies use (refreshed every 5 min)
```

### Use the secrets manager

On the credentials page, with OpenBao selected, tick **Use the secrets manager (OpenBao)**. Then **only your HCL
Harbor user is asked**: it decides whether the PostgreSQL table script can be included. Nothing secret is written
in the zip:

- Each `secrets.yaml` holds `ExternalSecret`s with the same names, types and labels as before. External Secrets
  Operator creates the Secrets from OpenBao. The Web Engine database properties, the HAProxy certificate and the
  OpenSearch certificates are handled the same way.
- A command that needs a value while it runs (the registry login, the optional checks) reads it from OpenBao with
  `obv <path> <key>`.

**External secrets** are entered by the operator:

| OpenBao (`dx/<DX namespace>/…`) | What |
|---|---|
| `registry` `password` | HCL Harbor CLI secret |
| `wpsadmin` `password` | DX administrator |
| `demo-users` `password` | demo users of the OpenLDAP (Enter = the same as wpsadmin) |
| `ai` `key` | OpenRouter, Bedrock or Anthropic key |
| `ad` `bindPassword` / `oracle` `password` | only if you use Active Directory / Oracle |

**Internal secrets** are generated at random inside OpenBao:
- the LDAP administrator;
- the PostgreSQL users (`pg-superuser`, `pg-dxuser`, `pg-iquser`);
- the LiteLLM master key;
- the HAProxy certificate (self-signed, unless you gave your own files);
- the OpenSearch CA and certificates (`search-certs`).

Step **C-2** (`lab-cicd/openbao-secrets.sh`) asks for the external secrets that are missing, with hidden input,
or takes them from the environment variables listed at the top of the script. It only adds what is missing:
running it again changes nothing. To enter them beforehand in the UI instead:

```bash
kubectl -n dx-shared port-forward svc/openbao 8200:8200
# http://localhost:8200/ui · method "Username" · user operador · password in lab-cicd/openbao/operador.password
```

### The unseal keys

The first time, `install.sh` initialises OpenBao. It writes the **5 unseal keys and the root token** to
`lab-cicd/openbao/openbao-init.txt` (folder mode 700, file mode 600). **Keep that file somewhere safe:** without 3
of the 5 keys, the data in OpenBao cannot be recovered. In a real environment, split the keys among several
people and revoke the root token once it is set up (`bao token revoke`).

### When the OpenBao pod restarts: unseal it

OpenBao keeps its data encrypted, and the key is not stored anywhere. So **after every restart of its pod** (a
node reboot, an upgrade…) it starts *sealed*. While it is sealed, External Secrets Operator cannot refresh the
Secrets; the Secrets that already exist keep working. Unseal it with 3 of the 5 keys:

```bash
./lab-cicd/openbao-unseal.sh                 # from the installation folder
OPENBAO_DIR=/safe/place ./lab-cicd/openbao-unseal.sh   # if the keys are somewhere else
kubectl -n dx-shared get pod openbao-0       # 1/1 Ready once unsealed
```

By hand, it is the same as running `bao operator unseal` three times in the pod, with three different keys. In
production, use **auto-unseal** with a KMS or HSM (AWS KMS, Azure Key Vault, GCP KMS, PKCS#11) or the transit seal of
another OpenBao, so that it unseals itself.

### Changing a DX password: it needs a helm upgrade

When you change a value in OpenBao, External Secrets Operator updates the Kubernetes Secret within 5 minutes (or
straight away: `kubectl -n <ns> annotate externalsecret <name> force-sync=$(date +%s) --overwrite`). **For most
of the dependencies that is enough.** For example, CloudNativePG applies a new PostgreSQL password by itself,
thanks to the `cnpg.io/reload` label.

**HCL DX is different.** The DX chart does not use your Secret directly. During `helm install` or `helm upgrade`,
it **copies** it (Helm `lookup`) into its own Secret: `web-engine-secret` becomes `<release>-web-engine-wps`. The
Web Engine reads that copy when it starts and sets the wpsadmin password to it. So, to change the wpsadmin password:

1. Change it in OpenBao: UI, or `bao kv patch -mount=dx dx-demo/wpsadmin password=-` as `operador`.
2. Run the DX `helm upgrade` again: the same command as the last DX step of `install.sh` (`./install.sh --list`).
   This copies the new value.
3. Restart the Web Engine: `kubectl -n <DX namespace> rollout restart sts/<release>-web-engine` (about 5 minutes).
   The old password stops working.

We tested it on CF239: after steps 2 and 3, the new password works and the old one does not. The same applies to
every DX secret the chart copies (LTPA, DAM, remote search…). A tool such as Stakater Reloader could do step 3,
but not step 2. Also note that changing a password in OpenBao does not change it in the system that uses it (the
LDAP directory, Oracle, the AI provider): change it there first.

### Uninstall

`./install.sh --cleanup` deletes DX and the dependencies but **keeps the CI/CD tools**: OpenBao holds the
secrets, and with them a new installation starts straight away. `./install.sh --cleanup --all` removes them too,
including the OpenBao data.

### OpenBao already installed

Choose **Already installed** when an earlier installation from this installer created it in the same namespace.
`install.sh` skips the Helm install and reuses it. It needs the `openbao/` folder of that installation (copy it
to `lab-cicd/openbao/`, or set `OPENBAO_DIR`).

## Argo CD

Argo CD 3.6.1 (chart `oci://ghcr.io/argoproj/argo-helm/argo-cd` 10.15.0) is installed with the health checks of
the operator resources. It shows each ScriptApplication, DXPage, DAMCollection or PostgresDatabase as Healthy,
Progressing or Degraded, depending on what the operator sees inside DX. No Application is created: point it at
your own repository.

```bash
kubectl -n dx-shared port-forward svc/argocd-server 8080:443          # https://localhost:8080, user admin
kubectl -n dx-shared get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo
```

## Script Application operator

The operator (chart `oci://ghcr.io/europesip/charts/hcl-dx-scriptapp-operator` 0.1.1) is installed once DX is
running. To check it, `install.sh` also deploys the **hello** sample on a page ("DXOP Hello"):
`lab-cicd/dxop-hello.yaml`. Its image includes HCL DXClient, so you must accept the DXClient licence on the
credentials page. Its user guide and examples are in
[its repository](https://github.com/europesip/hcl-dx-scriptapp-operator).
