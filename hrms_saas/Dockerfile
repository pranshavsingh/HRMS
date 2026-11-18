# ============================================================================
# Stage 1: Build React + Vite SPA
# ============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Cache package dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy project files
COPY . .

# Set production environment variable for build time
ENV NODE_ENV=production
ENV VITE_API_BASE_URL=/api

# Compile production bundle
RUN npm run build

# ============================================================================
# Stage 2: Production Nginx Server
# ============================================================================
FROM nginx:1.27-alpine AS runner

# Remove default site
RUN rm -rf /usr/share/nginx/html/*

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
