FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/ shared/
COPY client/ client/
COPY server/ server/

# try to catch if the build failed,
# prevent bad code from showing as a successful compose
RUN npm ci \
    && npm run typecheck \
    && npm run build \
    && test -n "$(ls -A server/dist)" \
    && test -n "$(ls -A client/dist)"

FROM nginx:latest

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update && apt-get install -y --no-install-recommends \
        supervisor \
        net-tools \
        gettext-base \
        curl \
        ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev -w server && npm cache clean --force

COPY --from=build /app/server/dist server/dist

COPY --from=build /app/client/dist /app/frontend

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY site.conf /etc/nginx/conf.d/default.conf

# ensure nginx config is valid
RUN nginx -t

EXPOSE 80
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]