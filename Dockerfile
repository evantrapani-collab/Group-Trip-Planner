# TripTogether — portable container image.
# Works on Render, Fly.io, Railway, a VPS, or any container host.
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

# Install deps first for better layer caching. better-sqlite3 ships prebuilt
# binaries for linux x64/arm64, so no compiler toolchain is needed.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# SQLite database lives on a mounted volume so data survives redeploys.
# Create the dir at build time so it's writable even without a disk attached
# (the app also falls back gracefully if it isn't).
RUN mkdir -p /data
ENV TRIP_DB=/data/trips.db
ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "server/index.js"]
