# ============================================================
# Dockerfile — WebWA Gateway Backend
# Node.js 20 + Chromium untuk whatsapp-web.js (Puppeteer)
# ============================================================

FROM node:20-bookworm-slim AS base

# --- Install Chromium & dependencies yang dibutuhkan Puppeteer ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-sandbox \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Beritahu Puppeteer untuk pakai Chromium sistem (bukan download sendiri)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# --- Install dependencies ---
COPY package*.json ./
RUN npm ci --only=production

# --- Copy source code ---
COPY . .

# --- Buat folder untuk session WA ---
RUN mkdir -p .wwebjs_auth && chmod 777 .wwebjs_auth

# Port yang di-expose
EXPOSE 3000

# Jalankan sebagai user non-root untuk keamanan
RUN groupadd -r appuser && useradd -r -g appuser appuser \
    && chown -R appuser:appuser /app
USER appuser

CMD ["node", "src/server.js"]
