FROM node:20-slim

# Prisma needs openssl + ca-certificates at runtime
RUN apt-get update -y \
    && apt-get install -y openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Generate prisma client against the right binaries
RUN npx prisma generate

# Copy the rest of the app
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Apply migrations on boot, then start
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
