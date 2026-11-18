FROM node:22-alpine

# Set working directory
WORKDIR /app

# Install wget for healthcheck and curl
RUN apk add --no-cache wget curl

# Install production dependencies
COPY package.json package-lock.json ./
RUN npm install --omit=dev

# Copy application source
COPY . .

# Ensure directory permissions for uploads and non-root node user
RUN mkdir -p src/uploads && chown -R node:node /app

# Ensure entrypoint script is executable
RUN chmod +x /app/docker-entrypoint.sh

# Use non-root user
USER node

# Expose backend API port
EXPOSE 8000

# Environment defaults
ENV NODE_ENV=production
ENV PORT=8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8000/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "start"]
