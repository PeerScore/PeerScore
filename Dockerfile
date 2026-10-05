# Dev image for PeerScore (Next.js)
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Prisma schema + migrations are needed to generate the client.
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0"]
