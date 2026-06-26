# Solana Wallet Tracker

Self-hosted Solana wallet tracker with GitHub Pages frontend and Cloudflare tunnel backend.

## What It Does

- Tracks multiple Solana wallets
- Classifies transactions: **buy**, **sell**, **transfer_in**, **transfer_out**, **internal_transfer**
- Filters spam using Jupiter token verification + USD value threshold
- Background worker polls every minute via Helius API
- Password-protected with 30-day JWT cookie

## Architecture

- **Frontend:** React + Vite → GitHub Pages
- **Backend:** Node/Express + PostgreSQL → PM2 + Cloudflare tunnel
- **Solana data:** Helius API (free tier)
- **Token legitimacy:** Jupiter API

---

## Manual Setup Steps

### 1. Create GitHub Repo

```bash
cd ~/Projects/solana-wallet-tracker
git init
git add .
git commit -m "Initial commit"
# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/solana-wallet-tracker.git
git push -u origin main
```

### 2. Enable GitHub Pages

1. Go to repo Settings → Pages
2. Source: GitHub Actions
3. The `.github/workflows/deploy.yml` will handle deployments

### 3. Create PostgreSQL Database

```bash
# Add psql to PATH if needed
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

# Create database
psql postgresql://localhost:5432/postgres -c "CREATE DATABASE solana_tracker;"

# Run migrations
cd ~/Projects/solana-wallet-tracker/backend
npm install
npm run migrate
```

### 4. Get Helius API Key

1. Go to https://helius.xyz
2. Sign up (free tier: 10 requests/second)
3. Create an API key

### 5. Configure Environment

```bash
cd ~/Projects/solana-wallet-tracker/backend
cp .env.example .env
# Edit .env with your values:
# - APP_PASSWORD (strong password)
# - JWT_SECRET (random string)
# - HELIUS_API_KEY (from step 4)
# - FRONTEND_URL (your GitHub Pages URL)
```

### 6. Build & Start Backend

```bash
cd ~/Projects/solana-wallet-tracker/backend
npm install
npm run build

# Create logs directory
mkdir -p ~/Projects/solana-wallet-tracker/logs

# Start with PM2
cd ~/Projects/solana-wallet-tracker
pm2 start pm2.config.js
pm2 save
```

### 7. Create Cloudflare Tunnel

```bash
# Create tunnel
cloudflared tunnel create solana-wallet-tracker

# Get the tunnel UUID from output, then create config:
mkdir -p ~/.cloudflared
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: YOUR_TUNNEL_UUID
credentials-file: /Users/dominiksoczewka/.cloudflared/YOUR_TUNNEL_UUID.json

ingress:
  - hostname: solana-tracker.vileen.pl
    service: http://localhost:3004
  - service: http_status:404
```

Create LaunchAgent `~/Library/LaunchAgents/com.cloudflared.solana-wallet-tracker.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cloudflared.solana-wallet-tracker</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/cloudflared</string>
        <string>tunnel</string>
        <string>run</string>
        <string>solana-wallet-tracker</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/cloudflared-solana-tracker.out</string>
    <key>StandardErrorPath</key>
    <string>/tmp/cloudflared-solana-tracker.err</string>
</dict>
</plist>
```

Load it:
```bash
launchctl load ~/Library/LaunchAgents/com.cloudflared.solana-wallet-tracker.plist
```

### 8. Configure DNS in Cloudflare Dashboard

1. Go to Cloudflare dashboard → Zero Trust → Tunnels
2. Find your tunnel → Add public hostname
3. Domain: `solana-tracker.vileen.pl` (or your domain)
4. Service: `http://localhost:3004`

### 9. Update Frontend API URL

In `frontend/src/api/client.ts`, update the API URL or set it via environment:

```bash
# Add to GitHub repo secrets (Settings -> Secrets -> Actions)
VITE_API_URL=https://solana-tracker.vileen.pl
```

Or hardcode it in the file for now.

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/login | No | Login with password |
| POST | /api/auth/logout | No | Clear cookie |
| GET | /api/auth/check | Yes | Check session |
| GET | /api/wallets | Yes | List wallets |
| POST | /api/wallets | Yes | Add wallet |
| DELETE | /api/wallets/:id | Yes | Remove wallet |
| GET | /api/transactions | Yes | List transactions |
| GET | /api/transactions/stats | Yes | Transaction stats |

---

## Database Schema

### wallets
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Wallet ID |
| address | VARCHAR(44) | Solana address |
| label | VARCHAR(255) | Human-readable label |
| last_signature | VARCHAR(100) | Last processed tx |
| is_active | BOOLEAN | Enable/disable |

### transactions
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Tx ID |
| signature | VARCHAR(100) | Solana signature |
| type | ENUM | buy/sell/transfer_in/transfer_out/internal_transfer |
| token_mint | VARCHAR(44) | Token mint address |
| amount | NUMERIC | Token amount |
| usd_value | NUMERIC | USD value at time |
| is_spam | BOOLEAN | Filtered out |

---

## Spam Detection

A transaction is marked spam if:
1. Token not found in Jupiter registry AND value tiny
2. Jupiter score < 20
3. USD value < $0.01

---

## Transaction Classification

- **Buy:** You send SOL/USDC/token → receive another token (swap)
- **Sell:** You send token → receive SOL/USDC (swap)
- **Transfer In:** Single token received
- **Transfer Out:** Single token sent
- **Internal Transfer:** Between two tracked wallets
