#!/usr/bin/env bash
# Deletes everything ec2-create.sh created for NAME (tag dx-installer=NAME): the instance and its
# disk, the security group and the key pair. Nothing else in the account is touched.
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

step "Checking that nothing is left"
left=$(aws_ ec2 describe-volumes --filters "Name=tag:$TAG_KEY,Values=$NAME" --query 'Volumes[].VolumeId')
[ -z "$left" ] || { log "volumes still there: $left (deleting)"; for v in $left; do aws_ ec2 delete-volume --volume-id "$v" || true; done; }
log "done: nothing tagged $TAG_KEY=$NAME is left running"
echo "::result:: {\"type\":\"ec2\",\"name\":\"$NAME\",\"deleted\":true}"
