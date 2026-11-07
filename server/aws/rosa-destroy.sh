#!/usr/bin/env bash
# EXPERIMENTAL. Deletes the ROSA HCP cluster NAME and what rosa-create.sh created for it: volumes,
# EFS, the cluster, operator roles, OIDC configuration, the network stack and the account roles.
#
#   RHCS_CLIENT_ID=... RHCS_CLIENT_SECRET=... NAME=dx-rosa REGION=eu-west-1 ./rosa-destroy.sh  (or RHCS_TOKEN / RH_DEVICE_CODE=1)
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"
need aws rosa
check_name
whoami_aws
rh_login

if rosa describe cluster -c "$NAME" >/dev/null 2>&1; then
  if [ -f "$OUT/kubeconfig" ] && command -v oc >/dev/null; then
    step "Freeing the volumes of the installation"
    export KUBECONFIG="$OUT/kubeconfig"
    for ns in $(oc get ns -o jsonpath='{.items[*].metadata.name}' 2>/dev/null); do
      case "$ns" in default|kube-*|openshift*) continue ;; esac
      oc delete ns "$ns" --wait=false >/dev/null 2>&1 || true
    done
    for i in $(seq 1 60); do n=$(oc get pv --no-headers 2>/dev/null | wc -l); [ "$n" = 0 ] && break; sleep 10; done
  fi
  step "Deleting the cluster (~10 min)"
  rosa delete cluster -c "$NAME" -y --watch 2>&1 | tail -3 | sed 's/^/  /'
fi

step "EFS, roles, OIDC and network"
for FS in $(aws_ efs describe-file-systems --query "FileSystems[?Tags[?Key=='$TAG_KEY' && Value=='$NAME']].FileSystemId"); do
  for mt in $(aws_ efs describe-mount-targets --file-system-id "$FS" --query 'MountTargets[].MountTargetId'); do aws_ efs delete-mount-target --mount-target-id "$mt"; done
  until [ "$(aws_ efs describe-mount-targets --file-system-id "$FS" --query 'length(MountTargets)')" = 0 ]; do sleep 10; done
  aws_ efs delete-file-system --file-system-id "$FS" && log "deleted $FS"
done
for sg in $(aws_ ec2 describe-security-groups --filters "Name=group-name,Values=$NAME-efs" --query 'SecurityGroups[].GroupId'); do
  for i in $(seq 1 12); do aws_ ec2 delete-security-group --group-id "$sg" 2>/dev/null && break; sleep 10; done
done
aws_ iam detach-role-policy --role-name "$NAME-efs-csi" --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEFSCSIDriverPolicy 2>/dev/null || true
aws_ iam delete-role --role-name "$NAME-efs-csi" 2>/dev/null || true
rosa delete operator-roles --prefix "$NAME" --mode auto -y 2>&1 | tail -1 | sed 's/^/  /' || true
[ -f "$OUT/oidc-config-id" ] && rosa delete oidc-config --oidc-config-id "$(cat "$OUT/oidc-config-id")" --mode auto -y 2>&1 | tail -1 | sed 's/^/  /' || true
aws_ cloudformation delete-stack --stack-name "$NAME-network" 2>/dev/null && aws_ cloudformation wait stack-delete-complete --stack-name "$NAME-network" || true
rosa delete account-roles --prefix "$NAME" --hosted-cp --mode auto -y 2>&1 | tail -1 | sed 's/^/  /' || true
log "done"
echo "::result:: {\"type\":\"rosa\",\"name\":\"$NAME\",\"deleted\":true}"
