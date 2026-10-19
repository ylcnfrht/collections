# One image for every implementation, so each container starts from the same runtime, packages and build.
FROM node:24.12.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json tsconfig.test.json tsup.config.ts ./
COPY src ./src
RUN npm run build
COPY bench ./bench
