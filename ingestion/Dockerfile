# ── build ──────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
ENV npm_config_registry=https://registry.npmmirror.com
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── runtime ────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV npm_config_registry=https://registry.npmmirror.com

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# ไม่รันเป็น root — บอร์ดใช้ rootless docker อยู่แล้ว แต่ในคอนเทนเนอร์ก็ไม่ควรเป็น root
USER node

# ไม่เปิดพอร์ต ไม่มี HEALTHCHECK — process เดียวไม่มี endpoint ให้ถาม เช็คที่เขียวตลอดแย่กว่าไม่มี
# tsconfig rootDir = "." จึงได้ dist/src/... ไม่ใช่ dist/...

CMD ["node", "dist/src/index.js"]
