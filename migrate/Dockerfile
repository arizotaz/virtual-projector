FROM node:22-alpine AS build
RUN mkdir -p /app/server/database

WORKDIR /app

COPY package.json /app
RUN npm install

COPY ./drizzle.config.ts better_migration.ts /app
COPY ./server/database/ /app/server/database