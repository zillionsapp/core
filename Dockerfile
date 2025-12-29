# Build Stage
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production Stage
FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.env.example ./.env

RUN npm install --omit=dev

# Install PM2 globally
RUN npm install -g pm2

# Create logs directory
RUN mkdir -p logs

CMD ["pm2-runtime", "dist/src/index.js"]
