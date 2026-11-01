FROM mcr.microsoft.com/playwright:v1.64.1-resolute AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.64.1-resolute

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER pwuser
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
