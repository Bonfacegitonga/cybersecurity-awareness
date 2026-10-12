# Node 22.13+ is required for the built-in node:sqlite module.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies from the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application source (.env and data/ are excluded via .dockerignore).
COPY . .

# SQLite lives here; keep it on a volume. Owned by the unprivileged node user.
ENV PORT=3000 \
    DB_PATH=/app/data/attendance.db
RUN mkdir -p /app/data && chown -R node:node /app

EXPOSE 3000
USER node

# Exec form so the Node process is PID 1 and receives SIGTERM for clean shutdown.
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
