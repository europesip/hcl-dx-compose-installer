#!/usr/bin/env bash
# Deletes the EKS cluster NAME and everything eks-create.sh created for it: the volumes of the
# installation (EBS disks), the load balancer, the EFS file system, the node group, the VPC and the
# NAT gateway. Nothing else in the account is touched.
#
#   NAME=dx-compose-eks REGION=eu-west-1 ./eks-destroy.sh
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"
need aws eksctl kubectl helm
check_name
whoami_aws

if aws_ eks describe-cluster --name "$NAME" >/dev/null 2>&1; then
  step "Freeing the volumes and the load balancer of the cluster"
  export KUBECONFIG="$OUT/kubeconfig-destroy"
  aws eks update-kubeconfig --name "$NAME" --region "$REGION" --kubeconfig "$KUBECONFIG" >/dev/null
  # Workloads first, so that the volumes can be released, then every PVC (their EBS disks and EFS
  # access points are deleted by the CSI drivers), then the load balancer of ingress-nginx.
  for ns in $(kubectl get ns -o jsonpath='{.items[*].metadata.name}'); do
    case "$ns" in kube-system|kube-public|kube-node-lease|default) continue ;; esac
    for r in $(helm list -n "$ns" -q 2>/dev/null); do [ "$r" = ingress-nginx ] && continue; log "helm uninstall $r -n $ns"; helm uninstall "$r" -n "$ns" --wait --timeout 10m >/dev/null 2>&1 || true; done
  done
  kubectl delete clusters.postgresql.cnpg.io -A --all --wait=true --timeout=5m >/dev/null 2>&1 || true
  # Deleting the namespaces deletes their PVCs: the CSI drivers then delete the EBS disks and EFS access points
  for ns in $(kubectl get ns -o jsonpath='{.items[*].metadata.name}'); do
    case "$ns" in kube-system|kube-public|kube-node-lease|default|ingress-nginx) continue ;; esac
    kubectl delete ns "$ns" --wait=false >/dev/null 2>&1 || true
  done
  kubectl delete pvc -n default --all --wait=false >/dev/null 2>&1 || true
  for i in $(seq 1 60); do
    n=$(kubectl get pv --no-headers 2>/dev/null | wc -l)
    [ "$n" = 0 ] && break; [ $((i % 6)) = 1 ] && log "$n volumes still being deleted"; sleep 10
  done
  helm uninstall ingress-nginx -n ingress-nginx --wait --timeout 10m >/dev/null 2>&1 || true
  kubectl -n ingress-nginx delete svc --all --wait=true >/dev/null 2>&1 || true
else
  log "the EKS cluster $NAME does not exist (cleaning what may be left)"
fi

step "EFS file system"
for FS in $(aws_ efs describe-file-systems --query "FileSystems[?Tags[?Key=='$TAG_KEY' && Value=='$NAME']].FileSystemId"); do
  for mt in $(aws_ efs describe-mount-targets --file-system-id "$FS" --query 'MountTargets[].MountTargetId'); do aws_ efs delete-mount-target --mount-target-id "$mt"; done
  until [ "$(aws_ efs describe-mount-targets --file-system-id "$FS" --query 'length(MountTargets)')" = 0 ]; do sleep 10; done
  aws_ efs delete-file-system --file-system-id "$FS" && log "deleted $FS"
done
for sg in $(aws_ ec2 describe-security-groups --filters "Name=group-name,Values=$NAME-efs" --query 'SecurityGroups[].GroupId'); do
  for i in $(seq 1 12); do aws_ ec2 delete-security-group --group-id "$sg" 2>/dev/null && { log "deleted $sg"; break; }; sleep 10; done
done

if aws_ eks describe-cluster --name "$NAME" >/dev/null 2>&1; then
  step "Deleting the cluster, node group and VPC with eksctl (~10-15 min)"
  eksctl delete cluster --name "$NAME" --region "$REGION" --wait --disable-nodegroup-eviction 2>&1 | sed -u 's/^/  /'
fi

step "Checking that nothing is left"
for lb in $(aws_ elbv2 describe-load-balancers --query 'LoadBalancers[].LoadBalancerArn'); do
  if aws_ elbv2 describe-tags --resource-arns "$lb" --query "TagDescriptions[0].Tags[?Key=='$TAG_KEY' && Value=='$NAME'].Value" | grep -q .; then
    log "load balancer left: $lb (deleting)"; aws_ elbv2 delete-load-balancer --load-balancer-arn "$lb" || true
  fi
done
vols=$(aws_ ec2 describe-volumes --filters "Name=tag:$TAG_KEY,Values=$NAME" --query 'Volumes[].VolumeId')
for v in $vols; do log "disk left: $v (deleting)"; aws_ ec2 delete-volume --volume-id "$v" || true; done
stacks=$(aws_ cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE DELETE_FAILED --query "StackSummaries[?starts_with(StackName, 'eksctl-$NAME-')].StackName")
[ -z "$stacks" ] || log "WARNING: CloudFormation stacks still there: $stacks (delete them in the console)"
log "done"
echo "::result:: {\"type\":\"eks\",\"name\":\"$NAME\",\"deleted\":true}"
