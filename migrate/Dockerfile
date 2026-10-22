FROM node:22-alpine AS build
RUN mkdir -p /app

WORKDIR /app

COPY ./drizzle.config.ts package.json better_migration.ts /app

RUN mkdir -p /app/server/database
COPY ./server/database/schema.ts ./server/database/init_db.ts /app/server/database

RUN npm install