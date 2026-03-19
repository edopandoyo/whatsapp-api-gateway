# ============================================================
# Dockerfile — WebWA Gateway Frontend
# Multi-stage: Build React/Vite → Serve dengan Nginx
# ============================================================

# ---- Stage 1: Build ----
FROM node:20-alpine AS builder



WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source & build
COPY . .
# Argumen build untuk inject env vars saat build time
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_BASE_URL

RUN npm run build

# ---- Stage 2: Serve ----
FROM nginx:stable-alpine AS runner

RUN apk add --no-cache curl

# Hapus config Nginx default
RUN rm -rf /etc/nginx/conf.d/*

# Copy config Nginx custom
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy hasil build dari stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
