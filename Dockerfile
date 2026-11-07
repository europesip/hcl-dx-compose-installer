# HCL DX Compose Installer: a static React app served by an unprivileged nginx.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine
ARG VERSION=dev
LABEL org.opencontainers.image.title="HCL DX Compose Installer" \
      org.opencontainers.image.description="Web installer for HCL DX Compose and the EUROPESIP labs: generates the installation in the browser" \
      org.opencontainers.image.source="https://github.com/europesip/hcl-dx-compose-installer" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${VERSION}"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
