#!/bin/bash
set -e

echo "🚀 Solana Wallet Tracker Setup"
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required. Install it first."; exit 1; }
command -v psql >/dev/null 2>&1 || { echo "❌ psql is required. Run: brew install libpq"; exit 1; }

# Create database
echo "📦 Creating database..."
psql postgresql://localhost:5432/postgres -c "CREATE DATABASE solana_tracker;" 2>/dev/null || echo "  Database already exists"

# Setup backend
echo ""
echo "🔧 Installing backend dependencies..."
cd backend
npm install

# Build backend
echo ""
echo "🏗️  Building backend..."
npm run build

# Run migrations
echo ""
echo "🗄️  Running database migrations..."
npm run migrate

cd ..

# Setup frontend
echo ""
echo "🎨 Installing frontend dependencies..."
cd frontend
npm install

cd ..

# Create logs directory
mkdir -p logs

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit backend/.env with your settings"
echo "2. Get a Helius API key from https://helius.xyz"
echo "3. Create a GitHub repo and push this code"
echo "4. Create a Cloudflare tunnel (see README.md)"
echo "5. Start the backend: pm2 start pm2.config.js"
echo ""
