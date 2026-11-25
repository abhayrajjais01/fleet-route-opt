# ─── AI Fleet Route Optimizer · React frontend (Week 16, Track B) ──────────────────────────────
# Stage 1 builds the Vite bundle with pnpm; stage 2 serves it from Nginx, which also reverse-proxies /api to the
# FastAPI backend so the browser talks to one origin (no CORS, one TLS certificate in production).

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Empty VITE_API_URL = same-origin requests to /api/v1, which Nginx forwards to the backend.
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
# Demo mode on the login page (every profile, sample data). Set to "false" for a real deployment.
ARG VITE_DEMO_MODE="true"
ENV VITE_DEMO_MODE=${VITE_DEMO_MODE}
RUN pnpm exec tsc -b && pnpm exec vite build

FROM nginx:1.27-alpine AS runtime
# Unprivileged: Nginx listens on 8080 and never runs as root.
RUN sed -i 's/^user .*;//' /etc/nginx/nginx.conf \
 && touch /var/run/nginx.pid \
 && chown -R nginx:nginx /var/cache/nginx /var/run/nginx.pid /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=4s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
