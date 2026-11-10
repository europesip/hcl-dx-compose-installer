# DX Installer Wizard: the React page and a small Node server, with the tools that create the
# AWS environments (aws, eksctl, rosa, oc, kubectl, helm, ssh).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim
ARG TARGETARCH
ARG VERSION=dev
ARG AWS_CLI_VERSION=2.38.2
ARG EKSCTL_VERSION=0.231.0
ARG ROSA_VERSION=1.2.66
ARG OC_VERSION=4.19.50
ARG KUBECTL_VERSION=v1.35.5
ARG HELM_VERSION=v4.3.1
LABEL org.opencontainers.image.title="DX Installer Wizard" \
      org.opencontainers.image.description="Web installer for HCL DX Compose: from the environment (your cluster, a PC or AWS) to a ready-to-run installation" \
      org.opencontainers.image.source="https://github.com/europesip/hcl-dx-compose-installer" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"
RUN set -eux; \
    apt-get update; apt-get install -y --no-install-recommends ca-certificates curl unzip openssh-client python3 libnss-wrapper; \
    ln -s "$(find /usr/lib -name libnss_wrapper.so | head -1)" /usr/local/lib/libnss_wrapper.so; \
    a=$([ "$TARGETARCH" = arm64 ] && echo aarch64 || echo x86_64); g=$([ "$TARGETARCH" = arm64 ] && echo arm64 || echo amd64); \
    cd /tmp; \
    curl -fsSL --retry 8 --retry-all-errors --retry-delay 15 -o aws.zip "https://awscli.amazonaws.com/awscli-exe-linux-$a-$AWS_CLI_VERSION.zip"; unzip -q aws.zip; ./aws/install -b /usr/local/bin; rm -rf aws aws.zip; \
    curl -fsSL --retry 8 --retry-all-errors --retry-delay 15 "https://github.com/eksctl-io/eksctl/releases/download/v$EKSCTL_VERSION/eksctl_Linux_$g.tar.gz" | tar xz -C /usr/local/bin eksctl; \
    curl -fsSL --retry 8 --retry-all-errors --retry-delay 15 -o rosa.zip "https://github.com/openshift/rosa/releases/download/v$ROSA_VERSION/rosa_linux_$g.zip"; unzip -q rosa.zip rosa -d /usr/local/bin; rm rosa.zip; \
    curl -fsSL --retry 8 --retry-all-errors --retry-delay 15 "https://mirror.openshift.com/pub/openshift-v4/$a/clients/ocp/$OC_VERSION/openshift-client-linux.tar.gz" | tar xz -C /usr/local/bin oc; \
    curl -fsSL --retry 8 --retry-all-errors --retry-delay 15 -o /usr/local/bin/kubectl "https://dl.k8s.io/release/$KUBECTL_VERSION/bin/linux/$g/kubectl"; \
    curl -fsSL --retry 8 --retry-all-errors --retry-delay 15 "https://get.helm.sh/helm-$HELM_VERSION-linux-$g.tar.gz" | tar xz --strip-components=1 -C /usr/local/bin "linux-$g/helm"; \
    chmod 755 /usr/local/bin/*; \
    apt-get purge -y unzip; apt-get autoremove -y; rm -rf /var/lib/apt/lists/* /usr/local/aws-cli/v2/*/dist/awscli/examples; \
    aws --version; eksctl version; rosa version; oc version --client; kubectl version --client; helm version --short
WORKDIR /app
COPY package.json ./
COPY src/zip.js ./src/zip.js
COPY server ./server
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production PORT=8080 HOME=/tmp USER=installer WORK_DIR=/tmp/dx-installer APP_VERSION=${VERSION}
USER 1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
