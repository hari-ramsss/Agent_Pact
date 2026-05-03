FROM node:20-slim

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY scripts ./scripts
COPY packages ./packages

CMD ["npx", "tsx", "scripts/arbitrator/index.ts"]
