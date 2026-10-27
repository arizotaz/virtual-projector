FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci

# sources
COPY shared shared
COPY client client
COPY server server

RUN npm run build

FROM nginx:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
        supervisor \
        net-tools \
        gettext-base \
        curl \
        openssl \
        certbot \
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

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /var/www/certbot

EXPOSE 80 443
ENTRYPOINT ["/entrypoint.sh"]