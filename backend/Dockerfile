# build context = รากของ repo (cmtk-monitoring/) เพราะ image นี้เสิร์ฟ frontend ด้วย
# ไม่มี nginx ตาม docs/04 §3 — express.static ทำหน้าที่แทน

# ── frontend build ─────────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /web
ENV npm_config_registry=https://registry.npmmirror.com
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── backend build ──────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
ENV npm_config_registry=https://registry.npmmirror.com
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# ── runtime ────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV STATIC_DIR=/app/public
ENV npm_config_registry=https://registry.npmmirror.com

COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=web /web/dist ./public

USER node
EXPOSE 3000

# healthcheck ถามของจริง — /api/health เช็ค DB ให้แล้ว
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tsconfig rootDir = "." จึงได้ dist/src/... ไม่ใช่ dist/...
CMD ["node", "dist/src/server.js"]
