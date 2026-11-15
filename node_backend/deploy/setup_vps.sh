#!/usr/bin/env bash
# ==============================================================================
# Hostinger KVM 4 Automated Production Provisioning Script for HRMS
# Supports: Ubuntu 22.04 / 24.04 LTS
# Target: 5,000 - 8,000 Users, 1,000 - 2,000 Concurrent Peak Load
# ==============================================================================

set -e

echo "=== [1/6] Updating System & Tuning OS Limits ==="
apt update && apt upgrade -y
apt install -y curl git ufw htop build-essential software-properties-common

# Increase system file descriptors for high concurrency (2000+ connections)
cat << 'EOF' > /etc/security/limits.d/hrms.conf
* soft nofile 65535
* hard nofile 65535
root soft nofile 65535
root hard nofile 65535
EOF

sysctl -w fs.file-max=2097152
sysctl -w net.core.somaxconn=4096
echo "fs.file-max=2097152" >> /etc/sysctl.conf
echo "net.core.somaxconn=4096" >> /etc/sysctl.conf

echo "=== [2/6] Installing Node.js 20 LTS & PM2 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2

echo "=== [3/6] Installing & Configuring Redis ==="
apt install -y redis-server
systemctl enable redis-server
systemctl start redis-server

echo "=== [4/6] Installing & Tuning MySQL 8.0 ==="
apt install -y mysql-server
systemctl enable mysql
systemctl start mysql

# Copy tuning config if present
if [ -f "/var/www/hrms/node_backend/deploy/mysql_tuning.cnf" ]; then
    cp /var/www/hrms/node_backend/deploy/mysql_tuning.cnf /etc/mysql/conf.d/enterprise_tuning.cnf
    systemctl restart mysql
    echo "MySQL tuned successfully."
fi

echo "=== [5/6] Installing Nginx & Certbot ==="
apt install -y nginx certbot python3-certbot-nginx
systemctl enable nginx
systemctl start nginx

echo "=== [6/6] Configuring Firewall (UFW) ==="
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "=============================================================================="
echo "Hostinger KVM 4 VPS Base Setup Complete!"
echo "Next Steps:"
echo " 1. Clone/copy codebase to /var/www/hrms"
echo " 2. In /var/www/hrms/node_backend: npm install --omit=dev"
echo " 3. Run database migrations: mysql < scripts/add_performance_indexes.sql"
echo " 4. Start PM2 cluster: pm2 start ecosystem.config.cjs --env production"
echo " 5. pm2 save && pm2 startup"
echo " 6. Setup SSL: certbot --nginx -d your-domain.com"
echo "=============================================================================="
