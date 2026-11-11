# ── Stage 1: Build Frontend ─────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Relative path enables frontend to call backend on the same origin automatically
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Stage 2: Build Backend ──────────────────────────
FROM node:22-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# ── Stage 3: Production Runtime ─────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8000

# Install production dependencies only
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy compiled backend & frontend assets
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/src/db/schema.sql ./backend/dist/db/schema.sql
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Ensure data directory exists for SQLite
RUN mkdir -p /app/backend/data

EXPOSE 8000

WORKDIR /app/backend
CMD ["node", "dist/index.js"]

