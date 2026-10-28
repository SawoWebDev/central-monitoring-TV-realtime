# Backend image: Node.js + only the production libraries + our src/ folder.
# Secrets are NOT baked in: docker-compose passes backend/.env to the container when it starts.
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install libraries first (this layer is cached until package-lock.json changes)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Run as the non-root "node" user that the official image provides
USER node

EXPOSE 4000
CMD ["node", "src/server.js"]
