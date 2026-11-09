#!/usr/bin/env bash
# scripts/github-labels.sh · creates (or updates) the labels of the work model described in docs/workflow.md.
# Usage: scripts/github-labels.sh [owner/repo]   (default: europesip/hcl-dx-compose-installer). Needs gh with repo scope.
set -euo pipefail
R="${1:-europesip/hcl-dx-compose-installer}"
l(){ gh label create "$1" -R "$R" --color "$2" --description "$3" --force; }
# Type
l bug            CF222E "Something does not behave as it should"
l tech-debt      E36209 "A shortcut taken on purpose, to be paid back"
l enhancement    1A7F37 "A new capability, option or use case"
l blocked        6F42C1 "Depends on another task or on something external"
l documentation  0075CA "Documentation or architecture"
# Area
l area:wizard    BF8700 "Area: web wizard (pages, texts, i18n)"
l area:engine    0969DA "Area: engine (generated steps, values, commands)"
l area:bundle    0E8A8A "Area: generated folder (install.sh, bundle, scripts, guides)"
l area:cicd      BF3989 "Area: advanced CI/CD (OpenBao, Argo CD, operator, Keycloak)"
l area:packaging 5B6CFF "Area: image, Helm chart and CI of the installer"
l infra:aws      FF9900 "Changes in the AWS backend (EC2, EKS, ROSA)"
# Priority
l P1 B60205 "High priority"
l P2 FBCA04 "Medium priority"
l P3 A2EEEF "Low priority"
