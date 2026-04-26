FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies in a separate layer so they are cached unless package.json changes.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN npx prisma generate

EXPOSE 3000

CMD ["node", "src/server.js"]
