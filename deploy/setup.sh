#!/bin/bash

# Stop on error
set -e

echo "🚀 Starting WG-TG-Bot Setup..."

# 1. Update & Install Dependencies
echo "📦 Installing system dependencies..."
sudo apt update
sudo apt install -y curl git unzip

# Install Node.js 22.x
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# Install PM2
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

echo "📂 Setup is running in current directory: $(pwd)"

# 2. Collect Credentials
echo ""
echo "🔑 Enter Credentials to configure your Bot:"

read -p "Telegram Bot Token: " TG_TOKEN
TG_TOKEN=$(echo "$TG_TOKEN" | xargs)
read -p "Admin IDs (comma separated): " ADMIN_IDS
ADMIN_IDS=$(echo "$ADMIN_IDS" | xargs)
read -p "WG-Easy URL (e.g., http://10.0.0.1:51821): " WG_URL
WG_URL=$(echo "$WG_URL" | xargs)
read -p "WG-Easy Password: " WG_PASS
WG_PASS=$(echo "$WG_PASS" | xargs)

# 3. Generate .env
echo "📝 Generating .env file..."
cat > ".env" <<EOL
TELEGRAM_BOT_TOKEN=$TG_TOKEN
ADMIN_IDS=$ADMIN_IDS
WG_EASY_URL=$WG_URL
WG_EASY_PASSWORD=$WG_PASS
EOL

# 4. Install App Dependencies
echo "📦 Installing npm dependencies..."
npm install

# 5. Start with PM2
echo "🚀 Starting App with PM2 (ecosystem.config.js)..."
pm2 delete wgtg22 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "✅ Setup Complete!"
echo "Bot is now running in PM2."
echo "Check logs anytime with: pm2 logs wgtg22"
