#!/bin/bash
# TekServis Panel - VPS Kurulum Scripti (Ubuntu 22.04)
# Kullanım: bash setup.sh

set -e
echo "=== TekServis Panel Kurulumu ==="

# Node.js 20
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Docker (opsiyonel, docker-compose ile kullanmak için)
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
fi

# Bağımlılıkları yükle
cd backend && npm install --production && cd ..

# data klasörü
mkdir -p data

# PM2 ile başlat (opsiyonel, docker kullanmıyorsan)
if command -v pm2 &> /dev/null; then
  pm2 start backend/server.js --name tekservis
  pm2 save
  pm2 startup
else
  npm install -g pm2
  pm2 start backend/server.js --name tekservis
  pm2 save
  pm2 startup
fi

echo ""
echo "✓ Kurulum tamamlandı!"
echo "Panel: http://$(curl -s ifconfig.me):3001"
