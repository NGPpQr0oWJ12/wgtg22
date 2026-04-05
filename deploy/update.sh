#!/bin/bash

# Stop on error
set -e

APP_DIR="/var/www/wgtg22"

echo "🔄 Updating WG-TG-Bot..."

echo "📦 Deploying new files..."
# Copy all files from current directory to APP_DIR overwriting old ones
cp -r . "$APP_DIR/"

echo "📦 Updating dependencies..."
cd "$APP_DIR"
npm install --production

echo "♻️ Restarting Application..."
pm2 restart wgtg22

echo "✅ Update Complete!"
