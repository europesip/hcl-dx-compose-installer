#!/usr/bin/env bash
# Creates ONE EC2 instance with k3s, Longhorn and the StorageClasses dx-deploy-rwo / dx-deploy-rwx,
# ready for the HCL DX Compose installation. Everything it creates carries the tag dx-installer=NAME,
# so ec2-destroy.sh finds and deletes it.
#
#   NAME=dx-compose-poc REGION=eu-west-1 ./ec2-create.sh
#
# Variables: NAME, REGION, INSTANCE_TYPE (m6i.4xlarge), DISK_GB (200), ALLOWED_CIDR (comma-separated CIDRs that
# can use SSH and the Kubernetes API; the public IP of the machine that runs this script is always added),
# VPC_MODE (name: the VPC named VPC_NAME, by default NAME, created if it does not exist and then deleted with the
# environment; default: the default VPC of the region), OUT (folder for the SSH key and the kubeconfig).
# It costs money while it exists: delete it with ec2-destroy.sh when you finish.
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"
: "${INSTANCE_TYPE:=m6i.4xlarge}"
: "${DISK_GB:=200}"
: "${K3S_VERSION:=v1.35.5+k3s1}"
: "${HELM_VERSION:=v4.3.1}"
: "${LONGHORN_VERSION:=1.12.1}"
: "${VPC_MODE:=name}"          # name: the VPC with the tag Name=VPC_NAME (created if it does not exist) | default: the default VPC
: "${VPC_NAME:=$NAME}"
: "${VPC_CIDR:=10.100.0.0/16}" # only for a new VPC; never inside 10.42.0.0/16 or 10.43.0.0/16 (pods and services of k3s)
case "$VPC_MODE" in name|default) ;; *) die "VPC_MODE must be name or default";; esac
[[ "$VPC_NAME" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || die "invalid VPC_NAME: $VPC_NAME"
[[ "$VPC_CIDR" =~ ^10\.4[23]\. ]] && die "VPC_CIDR $VPC_CIDR overlaps the pod (10.42.0.0/16) or service (10.43.0.0/16) network of k3s"
need aws ssh curl python3
check_name
whoami_aws

# SSH and the Kubernetes API: the CIDRs in ALLOWED_CIDR (comma-separated, e.g. your PC) plus the public IP of the
# machine that runs this script, which needs SSH to finish the setup and read the kubeconfig.
ip=$(curl -s --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]')
[[ "$ip" =~ ^[0-9.]+$ ]] || die "cannot find the public IP of this machine"
CIDRS=$(echo "${ALLOWED_CIDR:-},$ip/32" | tr ',' '\n' | sed '/^$/d' | sort -u)
for c in $CIDRS; do [[ "$c" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$ ]] || die "invalid CIDR: $c"; done
RANGES=$(for c in $CIDRS; do printf '{CidrIp=%s},' "$c"; done | sed 's/,$//')
ALLOWED_CIDR=$(echo $CIDRS | tr ' ' ',')

step "Checking that $NAME does not exist yet"
existing=$(aws_ ec2 describe-instances --filters "Name=tag:$TAG_KEY,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopping,stopped" --query 'Reservations[].Instances[].InstanceId')
[ -z "$existing" ] || die "there is already an instance tagged $TAG_KEY=$NAME ($existing): delete it first (ec2-destroy.sh) or use another NAME"

if [ "$VPC_MODE" = default ]; then
  step "Network: the default VPC and a security group"
  VPC=$(aws_ ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId')
  [ -n "$VPC" ] && [ "$VPC" != None ] || die "the region $REGION has no default VPC: choose a VPC by name (VPC_MODE=name) or create the default one (aws ec2 create-default-vpc)"
  SUBNET=$(aws_ ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" Name=default-for-az,Values=true --query 'Subnets[0].SubnetId')
else
  step "Network: VPC $VPC_NAME and a security group"
  VPC=$(aws_ ec2 describe-vpcs --filters "Name=tag:Name,Values=$VPC_NAME" --query 'Vpcs[0].VpcId')
  if [ -z "$VPC" ] || [ "$VPC" = None ]; then
    # A new VPC for this environment: one public subnet with an Internet gateway. It carries the tag
    # dx-installer=NAME, so ec2-destroy.sh deletes it with the instance.
    log "the VPC $VPC_NAME does not exist: creating it ($VPC_CIDR)"
    VPC=$(aws_ ec2 create-vpc --cidr-block "$VPC_CIDR" --query Vpc.VpcId \
          --tag-specifications "ResourceType=vpc,Tags=[{Key=$TAG_KEY,Value=$NAME},{Key=Name,Value=$VPC_NAME}]")
    aws_ ec2 wait vpc-available --vpc-ids "$VPC"
    aws_ ec2 modify-vpc-attribute --vpc-id "$VPC" --enable-dns-hostnames '{"Value":true}'
    IGW=$(aws_ ec2 create-internet-gateway --tag-specifications "$(tags internet-gateway)" --query InternetGateway.InternetGatewayId)
    aws_ ec2 attach-internet-gateway --internet-gateway-id "$IGW" --vpc-id "$VPC"
    AZ=$(aws_ ec2 describe-availability-zones --filters Name=state,Values=available --query 'AvailabilityZones[0].ZoneName')
    SUBNET=$(aws_ ec2 create-subnet --vpc-id "$VPC" --cidr-block "${VPC_CIDR%.*/*}.0/24" --availability-zone "$AZ" \
             --tag-specifications "$(tags subnet)" --query Subnet.SubnetId)
    aws_ ec2 modify-subnet-attribute --subnet-id "$SUBNET" --map-public-ip-on-launch
    RT=$(aws_ ec2 create-route-table --vpc-id "$VPC" --tag-specifications "$(tags route-table)" --query RouteTable.RouteTableId)
    aws_ ec2 create-route --route-table-id "$RT" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW" >/dev/null
    aws_ ec2 associate-route-table --route-table-id "$RT" --subnet-id "$SUBNET" >/dev/null
  else
    # An existing VPC (it is never deleted by ec2-destroy.sh): a subnet whose route table goes to an Internet gateway
    log "using the existing VPC $VPC_NAME ($VPC)"
    aws_ ec2 describe-internet-gateways --filters "Name=attachment.vpc-id,Values=$VPC" --query 'InternetGateways[0].InternetGatewayId' | grep -q '^igw-' \
      || die "the VPC $VPC_NAME has no Internet gateway: the instance needs one (and a public subnet)"
    SUBNET=""
    for rt in $(aws_ ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC" "Name=route.gateway-id,Values=igw-*" --query 'RouteTables[].RouteTableId'); do
      SUBNET=$(aws_ ec2 describe-route-tables --route-table-ids "$rt" --query 'RouteTables[0].Associations[?SubnetId!=`null`].SubnetId | [0]')
      [ -n "$SUBNET" ] && [ "$SUBNET" != None ] && break
      # the main route table also serves the subnets without an explicit association
      if [ "$(aws_ ec2 describe-route-tables --route-table-ids "$rt" --query 'RouteTables[0].Associations[?Main==`true`] | length(@)')" != 0 ]; then
        SUBNET=$(aws_ ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC" --query 'Subnets[0].SubnetId'); break
      fi
    done
    [ -n "$SUBNET" ] && [ "$SUBNET" != None ] || die "the VPC $VPC_NAME has no public subnet (a route 0.0.0.0/0 to the Internet gateway)"
  fi
fi
SG=$(aws_ ec2 describe-security-groups --filters Name=vpc-id,Values="$VPC" Name=group-name,Values="$NAME" --query 'SecurityGroups[0].GroupId')
if [ -z "$SG" ] || [ "$SG" = None ]; then
  SG=$(aws_ ec2 create-security-group --group-name "$NAME" --description "HCL DX Compose PoC ($NAME)" --vpc-id "$VPC" \
        --tag-specifications "$(tags security-group)" --query GroupId)
  aws_ ec2 authorize-security-group-ingress --group-id "$SG" --ip-permissions \
    "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[$RANGES]" \
    "IpProtocol=tcp,FromPort=6443,ToPort=6443,IpRanges=[$RANGES]" \
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
