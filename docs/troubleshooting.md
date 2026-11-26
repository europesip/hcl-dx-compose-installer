# DX Installer Wizard · Frequent errors

**English** · [Español](troubleshooting.es.md) · [FAQ](faq.md) · [README](https://github.com/europesip/hcl-dx-compose-installer#readme)

Problems that users have reported, with their cause and fix. To ask for help, see [the end of this page](#asking-for-help).

## `--wait=legacy` or `--force-conflicts`: unknown flag

**Cause:** the folder was generated for **Helm 4** (the default, and what `apt-get` installs today), and the machine
has **Helm 3**. `--wait=legacy` and `--force-conflicts` only exist in Helm 4.

**Fix:** from installer 2.6 the scripts adapt the flags by themselves when they find Helm 3. With an older folder,
or when you copy the commands from the RUNBOOK: use `--wait` instead of `--wait=legacy` and leave out
`--force-conflicts` (stage 4, IQ). You can also choose Helm 3 in the installer, or install Helm 4. `helm version`
tells you which one you have.

## Every pod is Running, but the portal does not answer on ports 80/443

Check where it fails before changing anything with the step "Diagnose the access to DX, layer by layer" (its number is
in `./install.sh --list`, usually 1-7): `./install.sh --from 1-7 --to 1-7 --verify` tests DX without the Ingress (`kubectl port-forward`), then the Ingress controller, port 443
and the DNS. The first layer that fails is the one to look at.

**k3s inside WSL, installed as "Your cluster" (not as the WSL2 PoC).** The most frequent case. k3s publishes Traefik
on the internal IP of WSL (servicelb), not on `localhost`, so with the default WSL network (NAT) **the browser of
Windows does not reach it through `localhost` or `127.0.0.1`**, although everything works from inside WSL (the
diagnosis step says OK). Options, from simplest:

- Choose **"My Windows PC (WSL2)"** in the installer: it configures Traefik (or ingress-nginx) on `127.0.0.1:80/443` of
  WSL, which Windows reaches through `localhost`, and uses `dx-demo.127.0.0.1.nip.io`.
- Or turn on the mirrored network of WSL: `networkingMode=mirrored` under `[wsl2]` in `%USERPROFILE%\.wslconfig`,
  then `wsl --shutdown`.
- Or put the IP of WSL (`hostname -I`, the first one) in the `hosts` file of Windows for your host name. It changes
  every time WSL starts.

**Ports 80/443 already in use on Windows** (IIS, Docker Desktop, a VPN or another proxy): `netstat -ano | findstr
":443 :80 "` in PowerShell shows who has them.

**A cloud or an on-premises cluster:** the Service of the Ingress controller needs an external IP (`kubectl get svc
-A | grep -iE 'traefik|nginx'`): a LoadBalancer of the provider (sometimes with its own annotations), MetalLB, or
the firewall opened for 80/443 towards the nodes.

## The host name does not resolve (`*.nip.io`)

Some routers and corporate DNS servers block names that resolve to private addresses or to `127.0.0.1` (DNS
rebinding protection), so `dx-demo.127.0.0.1.nip.io` does not resolve. Add the name to the `hosts` file (of Windows
and, if you use the terminal too, of WSL) pointing at the address of the Ingress.

## HTTP 404 right after creating the Ingress

Normal for a few seconds while the Ingress controller loads the new route. The portal check waits for it.

## The browser warns about the certificate

Expected: unless you gave your own certificate, the scripts create a self-signed one for your host name.

## `ImagePullBackOff` in the HCL pods

The HCL images come from `hclcr.io` with your HCL account. Check the user and the CLI secret of HCL Harbor (they can
expire or be regenerated) and that the account has access to DX Compose. `kubectl -n dx-demo describe pod <pod>`
shows the error of the registry.

## A download fails with 502, 503 or 504

GitHub, Helm repositories and registries answer like that at times. The scripts retry the downloads; if it still
fails, resume later from the step: `./install.sh --from <step>`.

## IQ does not use the LiteLLM address or key set as environment variables

One page of the HCL documentation sets `LITELLM_URL` and `LITELLM_API_KEY` in `environment.pod.integrator`. The chart
defines both variables again after yours, so its own ones win. The address goes in
`configuration.litellm.liteLlmUrl` and the key in the Secret `iq-litellm-api-secret`, as the installer does.

## A folder generated earlier fails against a newer operator or extra

**Cause:** a generated folder pins the versions it was generated with (BUILD-INFO.txt: `installer.version`,
`bundle.format`, `third-party charts`, `operator`). When the cluster was upgraded afterwards, for example to a newer
DX Delivery Operator, an older folder used to downgrade the operator (its CRDs stayed newer), apply kinds that no longer
existed (`ScriptApplication` became `DXScriptApplication` in operator 0.3.0), and its `--cleanup` deleted nothing when
one kind was unknown.

**What the folder does since bundle format 2** (`BUNDLE_FORMAT=2` at the top of `install.sh`):

- The header of `install.sh` prints the installer version, the bundle format and the pinned charts.
- The DX Delivery Operator, OpenBao, External Secrets Operator and Argo CD are **never downgraded**: when the cluster
  already runs a newer chart (the operator is looked for in every namespace, because its CRDs are cluster-wide), the
  step keeps it and says so.
- Before anything is installed, `install.sh` compares the operator in the cluster with the one of the folder. If the
  cluster runs a newer operator that no longer serves a kind (or API version) the folder uses, it **stops at the
  start** and says which versions differ. Step OP-2 checks the same before it applies the hello sample.
- `--cleanup` deletes every kind of the operator that the cluster serves, one by one, so no namespace is left
  Terminating because of an unknown kind.

**Fix:** generate the folder again with the current installer and the same options (the message says so), or, for a
throw-away cluster, uninstall the newer operator first. With a folder of bundle format 1 (no `bundle.format` in
BUILD-INFO.txt), edit by hand: the `--version` of step OP-1 (or 1-6), the `kind:` of `lab-cicd/dxop-hello.yaml` and the
list of kinds in the `--cleanup` of `install.sh`.

## Asking for help

Send:

- `BUILD-INFO.txt` (in the folder): what it was generated for (installer version, platform, Ingress, Helm and
  options). It has no secrets.
- The output of `support/environment-info.sh > environment-info.txt`: workstation, tools, cluster, Ingress and the
  access to DX layer by layer.
- Or both at once, with the data HCL Support asks for: `./install.sh --collect` (`./demo.sh --collect` in the
  webinar) makes a `.tar.gz` with the secrets masked. Review it before sending it.
