#!/usr/bin/env bash
# EXPERIMENTAL (not tested end to end: it needs a Red Hat account with ROSA enabled in your AWS
# account). Creates a Red Hat OpenShift Service on AWS cluster with hosted control planes (ROSA HCP)
# ready for HCL DX Compose:
#   - its own VPC (rosa create network, a CloudFormation stack), account and operator roles, OIDC;
#   - NODES x NODE_TYPE workers;
#   - StorageClass dx-deploy-rwo (EBS gp3) and dx-deploy-rwx (EFS, AWS EFS CSI Driver Operator);
#   - a cluster-admin user and a kubeconfig.
#
#   RHCS_CLIENT_ID=... RHCS_CLIENT_SECRET=... NAME=dx-rosa ./rosa-create.sh   (a Red Hat service account)
#   RHCS_TOKEN=<offline token> NAME=dx-rosa ./rosa-create.sh                    (console.redhat.com/openshift/token/rosa)
#   RH_DEVICE_CODE=1 NAME=dx-rosa ./rosa-create.sh                              (approve a code in your browser)
#
# It costs money while it exists (ROSA service fee per hour and per worker vCPU, EC2, NAT gateways,
# load balancers, disks, EFS): delete it with rosa-destroy.sh when you finish.
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"
: "${NODE_TYPE:=m6i.2xlarge}"
: "${NODES:=2}"
need aws rosa oc python3
check_name
whoami_aws
rh_login
rosa whoami 2>&1 | grep -E "OCM Account (Email|Username)|AWS Account ID" | sed 's/^/  /' || true
rosa verify quota --region "$REGION" 2>&1 | tail -1 | sed 's/^/  /'
if rosa describe cluster -c "$NAME" >/dev/null 2>&1; then die "the ROSA cluster $NAME already exists"; fi

step "Account roles and OIDC configuration"
rosa create account-roles --hosted-cp --prefix "$NAME" --mode auto -y 2>&1 | tail -2 | sed 's/^/  /'
ACCOUNT=$(aws_ sts get-caller-identity --query Account)
INSTALLER_ROLE="arn:aws:iam::$ACCOUNT:role/$NAME-HCP-ROSA-Installer-Role"
OIDC=$(rosa create oidc-config --mode auto --managed -y -o json | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
log "OIDC configuration $OIDC"
echo "$OIDC" > "$OUT/oidc-config-id"

step "Network (CloudFormation stack $NAME-network, ~5 min)"
rosa create network rosa-quickstart-default-vpc --param Region="$REGION" --param Name="$NAME-network" \
  --param AvailabilityZoneCount=1 --param VpcCidr=10.0.0.0/16 2>&1 | tail -3 | sed 's/^/  /'
SUBNETS=$(aws_ cloudformation describe-stacks --stack-name "$NAME-network" \
  --query "Stacks[0].Outputs[?OutputKey=='PrivateSubnets' || OutputKey=='PublicSubnets'].OutputValue" | tr '\t' ',')
[ -n "$SUBNETS" ] || die "no subnets in the outputs of the stack $NAME-network"
log "subnets $SUBNETS"

step "Operator roles"
rosa create operator-roles --hosted-cp --prefix "$NAME" --oidc-config-id "$OIDC" --installer-role-arn "$INSTALLER_ROLE" --mode auto -y 2>&1 | tail -2 | sed 's/^/  /'

step "Creating the ROSA HCP cluster (~15 min)"
rosa create cluster --cluster-name "$NAME" --sts --hosted-cp --mode auto --region "$REGION" -y \
  --oidc-config-id "$OIDC" --operator-roles-prefix "$NAME" --subnet-ids "$SUBNETS" \
  --compute-machine-type "$NODE_TYPE" --replicas "$NODES" --tags "$TAG_KEY:$NAME" 2>&1 | tail -5 | sed 's/^/  /'
rosa logs install -c "$NAME" --watch 2>&1 | grep -iE "ready|error|install" | tail -5 | sed 's/^/  /' || true
until rosa describe cluster -c "$NAME" -o json | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin)["state"]=="ready" else 1)'; do sleep 30; done

step "Administrator user and kubeconfig"
ADMIN=$(rosa create admin -c "$NAME" -o json)
U=$(echo "$ADMIN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["username"])')
P=$(echo "$ADMIN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["password"])')
API=$(rosa describe cluster -c "$NAME" -o json | python3 -c 'import json,sys; print(json.load(sys.stdin)["api"]["url"])')
KC="$OUT/kubeconfig"
for i in $(seq 1 40); do KUBECONFIG="$KC" oc login "$API" -u "$U" -p "$P" --insecure-skip-tls-verify=true >/dev/null 2>&1 && break; sleep 30; done
export KUBECONFIG="$KC"
oc whoami >/dev/null || die "cannot log in to $API yet: run 'rosa describe cluster -c $NAME' and try again"
chmod 600 "$KC"
printf 'username: %s\npassword: %s\napi: %s\n' "$U" "$P" "$API" > "$OUT/cluster-admin.txt"; chmod 600 "$OUT/cluster-admin.txt"

step "EFS for the ReadWriteMany volumes (AWS EFS CSI Driver Operator)"
OIDC_EP=$(rosa describe cluster -c "$NAME" -o json | python3 -c 'import json,sys; print(json.load(sys.stdin)["aws"]["sts"]["oidc_endpoint_url"].replace("https://",""))')
cat > "$OUT/efs-trust.json" <<EOF
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Federated":"arn:aws:iam::$ACCOUNT:oidc-provider/$OIDC_EP"},
 "Action":"sts:AssumeRoleWithWebIdentity","Condition":{"StringEquals":{"$OIDC_EP:sub":[
 "system:serviceaccount:openshift-cluster-csi-drivers:aws-efs-csi-driver-operator",
 "system:serviceaccount:openshift-cluster-csi-drivers:aws-efs-csi-driver-controller-sa"]}}}]}
EOF
aws_ iam create-role --role-name "$NAME-efs-csi" --assume-role-policy-document "file://$OUT/efs-trust.json" --tags "Key=$TAG_KEY,Value=$NAME" >/dev/null
aws_ iam attach-role-policy --role-name "$NAME-efs-csi" --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEFSCSIDriverPolicy
oc apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata: {name: aws-efs-cloud-credentials, namespace: openshift-cluster-csi-drivers}
stringData:
  credentials: |
    [default]
    sts_regional_endpoints = regional
    role_arn = arn:aws:iam::$ACCOUNT:role/$NAME-efs-csi
    web_identity_token_file = /var/run/secrets/openshift/serviceaccount/token
---
apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata: {name: openshift-cluster-csi-drivers, namespace: openshift-cluster-csi-drivers}
spec: {upgradeStrategy: Default}
---
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata: {name: aws-efs-csi-driver-operator, namespace: openshift-cluster-csi-drivers}
spec: {channel: stable, name: aws-efs-csi-driver-operator, source: redhat-operators, sourceNamespace: openshift-marketplace}
EOF
until oc get crd clustercsidrivers.operator.openshift.io >/dev/null 2>&1 && oc -n openshift-cluster-csi-drivers get deploy aws-efs-csi-driver-operator >/dev/null 2>&1; do sleep 15; done
oc apply -f - <<'EOF'
apiVersion: operator.openshift.io/v1
kind: ClusterCSIDriver
metadata: {name: efs.csi.aws.com}
spec: {managementState: Managed}
EOF
VPC=$(aws_ cloudformation describe-stacks --stack-name "$NAME-network" --query "Stacks[0].Outputs[?OutputKey=='VPCId'].OutputValue")
CIDR=$(aws_ ec2 describe-vpcs --vpc-ids "$VPC" --query 'Vpcs[0].CidrBlock')
EFS_SG=$(aws_ ec2 create-security-group --group-name "$NAME-efs" --description "EFS for $NAME" --vpc-id "$VPC" --tag-specifications "$(tags security-group)" --query GroupId)
aws_ ec2 authorize-security-group-ingress --group-id "$EFS_SG" --protocol tcp --port 2049 --cidr "$CIDR" >/dev/null
FS=$(aws_ efs create-file-system --encrypted --throughput-mode elastic --tags "Key=$TAG_KEY,Value=$NAME" "Key=Name,Value=$NAME" --query FileSystemId)
until [ "$(aws_ efs describe-file-systems --file-system-id "$FS" --query 'FileSystems[0].LifeCycleState')" = available ]; do sleep 5; done
PRIV=$(aws_ cloudformation describe-stacks --stack-name "$NAME-network" --query "Stacks[0].Outputs[?OutputKey=='PrivateSubnets'].OutputValue" | tr ',' ' ')
for sn in $PRIV; do aws_ efs create-mount-target --file-system-id "$FS" --subnet-id "$sn" --security-groups "$EFS_SG" >/dev/null; done
oc apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata: {name: dx-deploy-rwo, labels: {app: dx-installer}}
provisioner: ebs.csi.aws.com
parameters: {type: gp3, encrypted: "true"}
reclaimPolicy: Delete
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
---
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata: {name: dx-deploy-rwx, labels: {app: dx-installer}}
provisioner: efs.csi.aws.com
parameters: {provisioningMode: efs-ap, fileSystemId: $FS, directoryPerms: "775", uid: "1000", gid: "1001", basePath: /dx}
reclaimPolicy: Delete
volumeBindingMode: Immediate
EOF

HOST="dx-demo.$(oc get ingresscontroller default -n openshift-ingress-operator -o jsonpath='{.status.domain}')"
cat > "$OUT/README.txt" <<EOF
HCL DX Compose on ROSA HCP ($NAME, $REGION) · experimental
  kubeconfig    : export KUBECONFIG=$KC   (cluster-admin: $OUT/cluster-admin.txt)
  console       : $(rosa describe cluster -c "$NAME" -o json | python3 -c 'import json,sys; print(json.load(sys.stdin)["console"]["url"])')
  DX host name  : $HOST  (the default router of the cluster)
  Platform      : openshift  ·  StorageClasses: dx-deploy-rwo (EBS gp3) / dx-deploy-rwx (EFS $FS)
It costs money while it exists. Delete everything with:
  RHCS_CLIENT_ID=... RHCS_CLIENT_SECRET=... NAME=$NAME REGION=$REGION ./rosa-destroy.sh   (or RHCS_TOKEN / RH_DEVICE_CODE=1)
EOF
sed 's/^/  /' "$OUT/README.txt"
python3 - "$NAME" "$REGION" "$HOST" "$KC" "$FS" <<'EOF'
import json, sys
n, r, h, kc, fs = sys.argv[1:]
print("::result:: " + json.dumps({"type": "rosa", "name": n, "region": r, "dxHost": h, "platform": "openshift",
  "scRwo": "dx-deploy-rwo", "scRwx": "dx-deploy-rwx", "efs": fs, "kubeconfig": kc}))
EOF
