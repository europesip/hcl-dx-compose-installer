#!/usr/bin/env bash
# Creates ONE EC2 instance with k3s, Longhorn and the StorageClasses dx-deploy-rwo / dx-deploy-rwx,
# ready for the HCL DX Compose installation. Everything it creates carries the tag dx-installer=NAME,
# so ec2-destroy.sh finds and deletes it.
#
#   NAME=dx-compose-poc REGION=eu-west-1 ./ec2-create.sh
#
# Variables: NAME, REGION, INSTANCE_TYPE (m6i.4xlarge), DISK_GB (200), ALLOWED_CIDR (who can use
# SSH and the Kubernetes API; by default the public IP of the machine that runs this script),
# OUT (folder for the SSH key and the kubeconfig).
# It costs money while it exists: delete it with ec2-destroy.sh when you finish.
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"
: "${INSTANCE_TYPE:=m6i.4xlarge}"
: "${DISK_GB:=200}"
: "${K3S_VERSION:=v1.35.5+k3s1}"
: "${HELM_VERSION:=v4.3.1}"
: "${LONGHORN_VERSION:=1.12.1}"
need aws ssh curl python3
check_name
whoami_aws

if [ -z "${ALLOWED_CIDR:-}" ]; then
  ip=$(curl -s --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]')
  [[ "$ip" =~ ^[0-9.]+$ ]] || die "cannot find your public IP: set ALLOWED_CIDR"
  ALLOWED_CIDR="$ip/32"
fi

step "Checking that $NAME does not exist yet"
existing=$(aws_ ec2 describe-instances --filters "Name=tag:$TAG_KEY,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopping,stopped" --query 'Reservations[].Instances[].InstanceId')
[ -z "$existing" ] || die "there is already an instance tagged $TAG_KEY=$NAME ($existing): delete it first (ec2-destroy.sh) or use another NAME"

step "Network: default VPC and a security group"
VPC=$(aws_ ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId')
[ -n "$VPC" ] && [ "$VPC" != None ] || die "the region $REGION has no default VPC: create one (aws ec2 create-default-vpc) or use another region"
SUBNET=$(aws_ ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" Name=default-for-az,Values=true --query 'Subnets[0].SubnetId')
SG=$(aws_ ec2 describe-security-groups --filters Name=vpc-id,Values="$VPC" Name=group-name,Values="$NAME" --query 'SecurityGroups[0].GroupId')
if [ -z "$SG" ] || [ "$SG" = None ]; then
  SG=$(aws_ ec2 create-security-group --group-name "$NAME" --description "HCL DX Compose PoC ($NAME)" --vpc-id "$VPC" \
        --tag-specifications "$(tags security-group)" --query GroupId)
  aws_ ec2 authorize-security-group-ingress --group-id "$SG" --ip-permissions \
    "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$ALLOWED_CIDR,Description=SSH}]" \
    "IpProtocol=tcp,FromPort=6443,ToPort=6443,IpRanges=[{CidrIp=$ALLOWED_CIDR,Description=Kubernetes API}]" \
    "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description=HTTP}]" \
    "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0,Description=HTTPS DX}]" >/dev/null
fi
log "VPC $VPC · subnet $SUBNET · security group $SG (SSH and API from $ALLOWED_CIDR)"

step "SSH key pair"
KEY="$OUT/$NAME.pem"
aws_ ec2 delete-key-pair --key-name "$NAME" >/dev/null 2>&1 || true
aws_ ec2 create-key-pair --key-name "$NAME" --key-type ed25519 --tag-specifications "$(tags key-pair)" --query KeyMaterial > "$KEY"
chmod 600 "$KEY"
log "private key: $KEY"

step "Launching the $INSTANCE_TYPE instance (Ubuntu 24.04, $DISK_GB GB gp3)"
AMI=$(aws_ ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id --query Parameter.Value)
UD="$OUT/userdata.sh"
sed -e "s/__K3S_VERSION__/$K3S_VERSION/" -e "s/__HELM_VERSION__/$HELM_VERSION/" -e "s/__LONGHORN_VERSION__/$LONGHORN_VERSION/" "$DIR/ec2-userdata.sh" > "$UD"
IID=$(aws_ ec2 run-instances --image-id "$AMI" --instance-type "$INSTANCE_TYPE" --key-name "$NAME" \
  --subnet-id "$SUBNET" --security-group-ids "$SG" --associate-public-ip-address \
  --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$DISK_GB,VolumeType=gp3,DeleteOnTermination=true}" \
  --metadata-options HttpTokens=required,HttpEndpoint=enabled \
  --tag-specifications "$(tags instance)" "$(tags volume)" \
  --user-data "file://$UD" --query 'Instances[0].InstanceId')
log "instance $IID (AMI $AMI)"
aws_ ec2 wait instance-running --instance-ids "$IID"
IP=$(aws_ ec2 describe-instances --instance-ids "$IID" --query 'Reservations[0].Instances[0].PublicIpAddress')
log "public IP $IP"

step "Installing k3s, Helm and Longhorn on the instance (~6 min)"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -o LogLevel=ERROR "ubuntu@$IP")
for i in $(seq 1 60); do "${SSH[@]}" true 2>/dev/null && break; sleep 10; done
"${SSH[@]}" true || die "cannot reach the instance by SSH ($IP) from here"
seen=0
for i in $(seq 1 120); do
  n=$("${SSH[@]}" "sudo wc -l < /var/log/dx-installer-setup.log 2>/dev/null || echo 0")
  if [ "${n:-0}" -gt "$seen" ]; then "${SSH[@]}" "sudo sed -n '$((seen+1)),${n}p' /var/log/dx-installer-setup.log" | grep -E '^== |ERROR|error:' | sed 's/^/  /' || true; seen=$n; fi
  "${SSH[@]}" "test -f /var/lib/dx-installer/ready" && break
  if "${SSH[@]}" "cloud-init status 2>/dev/null | grep -q error"; then
    "${SSH[@]}" "sudo tail -30 /var/log/dx-installer-setup.log"; die "the instance setup failed (see the log above)"
  fi
  sleep 15
done
"${SSH[@]}" "test -f /var/lib/dx-installer/ready" || die "the instance setup did not finish in 30 minutes"

step "kubeconfig"
KC="$OUT/kubeconfig"
"${SSH[@]}" "sudo cat /etc/rancher/k3s/k3s.yaml" | sed -e "s#https://127.0.0.1:6443#https://$IP:6443#" -e "s/: default$/: $NAME/" > "$KC"
chmod 600 "$KC"
KUBECONFIG="$KC" kubectl get nodes 2>/dev/null | sed 's/^/  /' || log "(kubectl not found here: the kubeconfig is in $KC)"

HOST="dx-demo.$IP.nip.io"
cat > "$OUT/README.txt" <<EOF
HCL DX Compose PoC on EC2 ($NAME, $REGION)
  instance      : $IID ($INSTANCE_TYPE), public IP $IP
  kubeconfig    : export KUBECONFIG=$KC
  SSH           : ssh -i $KEY ubuntu@$IP   (kubectl and helm are installed on the instance)
  DX host name  : $HOST  (nip.io resolves it to $IP)
  Ingress class : traefik  ·  StorageClasses: dx-deploy-rwo / dx-deploy-rwx (Longhorn)
It costs money while it exists. Delete everything with:
  NAME=$NAME REGION=$REGION ./ec2-destroy.sh
EOF
cat "$OUT/README.txt" | sed 's/^/  /'
python3 - "$NAME" "$REGION" "$IID" "$IP" "$HOST" "$KC" "$KEY" "$INSTANCE_TYPE" <<'EOF'
import json, sys
n, r, i, ip, h, kc, key, t = sys.argv[1:]
print("::result:: " + json.dumps({"type": "ec2", "name": n, "region": r, "instanceId": i, "publicIp": ip, "instanceType": t,
  "dxHost": h, "ingress": "traefik", "scRwo": "dx-deploy-rwo", "scRwx": "dx-deploy-rwx", "platform": "kubernetes",
  "kubeconfig": kc, "sshKey": key, "ssh": f"ssh -i {key.split('/')[-1]} ubuntu@{ip}"}))
EOF
