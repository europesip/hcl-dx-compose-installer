#!/usr/bin/env bash
# Deletes everything ec2-create.sh created for NAME (tag dx-installer=NAME): the instance and its
# disk, the security group, the key pair and the VPC if it was created for this environment (tag dx-installer=NAME).
# Nothing else in the account is touched.
#
#   NAME=dx-compose-poc REGION=eu-west-1 ./ec2-destroy.sh
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"
need aws
check_name
whoami_aws

step "Terminating the instance(s) tagged $TAG_KEY=$NAME"
IDS=$(aws_ ec2 describe-instances --filters "Name=tag:$TAG_KEY,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopping,stopped,shutting-down" --query 'Reservations[].Instances[].InstanceId')
if [ -n "$IDS" ]; then
  aws_ ec2 terminate-instances --instance-ids $IDS >/dev/null
  log "terminating $IDS (its disk is deleted with it)"
  aws_ ec2 wait instance-terminated --instance-ids $IDS
else
  log "no instance found"
fi

step "Security group and key pair"
for sg in $(aws_ ec2 describe-security-groups --filters "Name=tag:$TAG_KEY,Values=$NAME" --query 'SecurityGroups[].GroupId'); do
  for i in 1 2 3 4 5 6; do aws_ ec2 delete-security-group --group-id "$sg" 2>/dev/null && { log "deleted $sg"; break; }; sleep 10; done
done
aws_ ec2 delete-key-pair --key-name "$NAME" >/dev/null 2>&1 && log "deleted key pair $NAME" || true

step "VPC created for this environment (an existing VPC is never deleted)"
for vpc in $(aws_ ec2 describe-vpcs --filters "Name=tag:$TAG_KEY,Values=$NAME" --query 'Vpcs[].VpcId'); do
  for igw in $(aws_ ec2 describe-internet-gateways --filters "Name=attachment.vpc-id,Values=$vpc" --query 'InternetGateways[].InternetGatewayId'); do
    aws_ ec2 detach-internet-gateway --internet-gateway-id "$igw" --vpc-id "$vpc" && aws_ ec2 delete-internet-gateway --internet-gateway-id "$igw"
  done
  for sn in $(aws_ ec2 describe-subnets --filters "Name=vpc-id,Values=$vpc" --query 'Subnets[].SubnetId'); do
    for i in 1 2 3 4 5 6; do aws_ ec2 delete-subnet --subnet-id "$sn" 2>/dev/null && break; sleep 10; done
  done
  for rt in $(aws_ ec2 describe-route-tables --filters "Name=vpc-id,Values=$vpc" --query 'RouteTables[?length(Associations[?Main==`true`])==`0`].RouteTableId'); do
    aws_ ec2 delete-route-table --route-table-id "$rt"
  done
  for i in 1 2 3 4 5 6; do aws_ ec2 delete-vpc --vpc-id "$vpc" 2>/dev/null && { log "deleted $vpc"; break; }; sleep 10; done
done

step "Checking that nothing is left"
left=$(aws_ ec2 describe-volumes --filters "Name=tag:$TAG_KEY,Values=$NAME" --query 'Volumes[].VolumeId')
[ -z "$left" ] || { log "volumes still there: $left (deleting)"; for v in $left; do aws_ ec2 delete-volume --volume-id "$v" || true; done; }
log "done: nothing tagged $TAG_KEY=$NAME is left running"
echo "::result:: {\"type\":\"ec2\",\"name\":\"$NAME\",\"deleted\":true}"
