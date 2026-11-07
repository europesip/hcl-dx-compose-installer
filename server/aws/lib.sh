# Shared helpers of the AWS scripts of the HCL DX Compose Installer.
# The scripts run in the installer pod (the web page starts them and shows their output) or on
# your own machine with the AWS CLI. The credentials always come from the standard AWS variables
# (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, optional AWS_SESSION_TOKEN) or your AWS profile.
#
# Output protocol read by the web page (plain text for a person reading the terminal too):
#   ::step:: <text>      a new phase starts (the page moves its progress bar)
#   ::result:: <json>    the final result (kubeconfig path, host name, storage classes...)
set -Eeuo pipefail

: "${NAME:=dx-compose-poc}"
: "${REGION:=${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-west-1}}}"
: "${OUT:=$PWD/aws-$NAME}"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION" AWS_PAGER=""
TAG_KEY=dx-installer
mkdir -p "$OUT"

step(){ echo "::step:: $*"; }
log(){ echo "  $*"; }
die(){ echo "ERROR: $*" >&2; exit 1; }
need(){ for c in "$@"; do command -v "$c" >/dev/null 2>&1 || die "missing tool: $c"; done; }
aws_(){ aws --region "$REGION" --output text "$@"; }
tags(){ echo "ResourceType=$1,Tags=[{Key=$TAG_KEY,Value=$NAME},{Key=Name,Value=$NAME}]"; }

check_name(){
  [[ "$NAME" =~ ^[a-z][a-z0-9-]{1,30}[a-z0-9]$ ]] || die "NAME must be 3-32 lower case letters, digits and hyphens: $NAME"
}

whoami_aws(){
  step "Checking the AWS credentials"
  local id; id=$(aws_ sts get-caller-identity --query '[Account,Arn]') || die "the AWS credentials are not valid"
  log "account and identity: $id"
  log "region: $REGION"
}
