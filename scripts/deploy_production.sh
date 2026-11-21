#!/bin/bash
set -e

echo "=========================================="
echo " Starting HRMS Production Deployment"
echo " Date: $(date)"
echo "=========================================="

REPO_DIR="/opt/hrms"
COOLIFY_SERVICE_DIR="/data/coolify/services/ehsnii5o1kasm2kjbbhmjrqz"

if [ ! -d "$REPO_DIR" ]; then
  echo "Error: Directory $REPO_DIR does not exist on this server."
  exit 1
fi

cd "$REPO_DIR"

echo "1. Fetching latest commits from origin/main..."
git fetch origin main
git reset --hard origin/main

echo "2. Building backend and worker Docker images..."
docker build -t hrms-production-backend:latest ./node_backend
docker tag hrms-production-backend:latest hrms-production-worker:latest

echo "3. Building React + Vite frontend Docker image..."
docker build -t hrms-production-frontend:latest ./hrms_saas

echo "4. Recreating running production containers..."
cd "$COOLIFY_SERVICE_DIR"
docker compose up -d --force-recreate backend worker frontend

echo "=========================================="
echo " ✅ HRMS Production Deployed Successfully!"
echo " Date: $(date)"
echo "=========================================="
