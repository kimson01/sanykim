# Sany Adventures — Complete Setup & Hosting Guide

---

## Part 1 — Project structure

```
sanyadventures/
├── backend/
│   ├── config/          db.js · migrate.js · seed.js · reset.js
│   ├── controllers/     authController · adminController · eventController
│   │                    orderController · paymentController · ticketController
│   ├── middleware/       auth.js · validate.js · upload.js
│   ├── routes/          auth · events · orders · tickets · admin · payments · uploads
│   ├── utils/           confirmOrderHelper · mailer · pdfTicket · reminderJob
│   ├── ecosystem.config.js   PM2 cluster config
│   ├── server.js
│   └── package.json
└── frontend/
    ├── public/index.html     HTML shell + all CSS (no stylesheet files)
    └── src/
        ├── api/client.js     Axios + every API call
        ├── context/          AuthContext
        ├── components/       Sidebar · Logo · UI kit
        └── pages/            admin · organizer · user · public · auth
```

---

## Part 2 — Local development (Windows / Mac / Linux)

### Prerequisites

| Tool        | Version | Download |
|-------------|---------|----------|
| Node.js     | 18+     | https://nodejs.org |
| PostgreSQL  | 14+     | https://www.postgresql.org/download (or use Neon free cloud) |

Verify:
```bash
node --version    # v18.x or higher
npm --version     # 9.x or higher
```

### Step 1 — Backend setup

```bash
cd sanyadventures/backend

# 1. Copy env file
copy .env.example .env          # Windows
cp .env.example .env             # Mac / Linux

# 2. Fill in .env (see Part 3 below for every variable)

# 3. Install dependencies
npm install

# 4. Create database tables
npm run migrate

# 5. Seed demo data (optional but recommended)
npm run seed

# 6. Start development server
npm run dev
# → API running on http://localhost:5000
```

Test the API:
```bash
curl http://localhost:5000/health
# {"status":"ok","env":"development",...}
```

### Step 2 — Frontend setup

```bash
cd sanyadventures/frontend

# 1. Copy env file
copy .env.example .env
cp .env.example .env

# 2. The default REACT_APP_API_URL=http://localhost:5000/api is correct for local dev

# 3. Install dependencies
npm install

# 4. Start dev server
npm start
# → App running on http://localhost:3000
```

Open http://localhost:3000 — the site is running.

### Demo accounts (after npm run seed)

| Role             | Email                       | Password        |
|------------------|-----------------------------|-----------------|
| Admin            | admin@sanyadventures.com        | Admin@1234      |
| Organizer (live) | james@nairobievents.com     | Organizer@123   |
| Organizer (pend.)| amina@techkenya.com         | Organizer@123   |
| User / Attendee  | alice@gmail.com             | User@1234       |

---

## Part 3 — Environment variables reference

### backend/.env

```env
# ── Server ────────────────────────────────────────────────────
PORT=5000
NODE_ENV=development          # change to production on VPS

# ── Database ──────────────────────────────────────────────────
# Option A — Cloud Postgres (Neon, Supabase, Railway Postgres)
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Option B — Local / self-hosted Postgres (comment out DATABASE_URL)
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=sanyadventures
# DB_USER=postgres
# DB_PASSWORD=your_password
# DB_SSL=false

# ── Performance (tuned per server) ───────────────────────────
DB_POOL_MAX=10                # connections per PM2 worker
DB_POOL_MIN=2
DB_STATEMENT_TIMEOUT=15000    # kill queries > 15 seconds

# ── JWT ───────────────────────────────────────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=CHANGE_THIS_TO_A_LONG_RANDOM_STRING
JWT_EXPIRES_IN=7d

# ── Admin seed account ────────────────────────────────────────
ADMIN_EMAIL=admin@sanyadventures.com
ADMIN_PASSWORD=Admin@1234
ADMIN_NAME=Super Admin

# ── M-PESA Daraja ─────────────────────────────────────────────
MPESA_ENV=sandbox              # change to production for real payments
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=174379
MPESA_PASSKEY=
MPESA_CALLBACK_URL=https://api.sanyadventures.com/api/payments/mpesa/callback

# ── File uploads ──────────────────────────────────────────────
UPLOAD_DIR=uploads
MAX_FILE_SIZE_MB=5

# ── CORS ──────────────────────────────────────────────────────
CLIENT_URL=http://localhost:3000    # change to your frontend URL

# ── Email / SMTP ──────────────────────────────────────────────
# Brevo (free 300/day): smtp-relay.brevo.com port 587
# Gmail app password:   smtp.gmail.com port 587
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_smtp_password
SMTP_FROM="Sany Adventures <no-reply@sanyadventures.com>"
```

### frontend/.env

```env
REACT_APP_API_URL=http://localhost:5000/api   # local dev
# REACT_APP_API_URL=https://api.sanyadventures.com/api   # production
```

---

## Part 4 — Free VPS hosting (Oracle Cloud Free Tier)

Oracle Cloud's Always Free tier gives you:
- 2 × ARM64 VMs with 1 OCPU + 6 GB RAM (never expires)
- 200 GB total storage
- No credit card required beyond sign-up

This is enough to run the full Sany Adventures stack indefinitely at zero cost.

### 4.1 — Create a free Oracle Cloud account

1. Go to https://cloud.oracle.com and click **Start for free**
2. Fill in your details — use your real name and valid phone number
3. You need a credit card for identity verification (nothing is charged)
4. Select **Home Region: UK South (London)** or **EU Frankfurt** (closest to Kenya with good latency)
5. Wait for the account to be created (can take up to 24 hours)

### 4.2 — Create a free VM

1. In the Oracle Cloud Console, go to **Compute → Instances → Create Instance**
2. Name it `sany-adventures`
3. Under **Shape**: click **Change Shape** → Select **Ampere** → **VM.Standard.A1.Flex**
   - Set OCPU: **2**, RAM: **12 GB** (free allowance)
4. Under **Image**: Select **Ubuntu 22.04** (Canonical)
5. Under **Networking**: make sure a public IP is assigned
6. Under **SSH Keys**: Upload your public key or generate one
   - On Windows: use PuTTYgen or `ssh-keygen` in PowerShell
   - Save the private key — you'll need it to connect
7. Click **Create**

Wait 2 minutes for the instance to start. Note the **Public IP address**.

### 4.3 — Open firewall ports

In Oracle Console → **Virtual Cloud Networks** → your VCN → **Security Lists** → **Ingress Rules**, add:

| Protocol | Port  | Source        | Notes              |
|----------|-------|---------------|--------------------|
| TCP      | 22    | 0.0.0.0/0     | SSH                |
| TCP      | 80    | 0.0.0.0/0     | HTTP               |
| TCP      | 443   | 0.0.0.0/0     | HTTPS              |

Also run on the VM itself (Oracle has an OS-level firewall too):
```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### 4.4 — Connect to your VM

```bash
# Replace with your actual public IP and key path
ssh -i ~/.ssh/id_rsa ubuntu@YOUR_VM_PUBLIC_IP
```

### 4.5 — Install required software on the VM

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version    # v20.x
npm --version     # 10.x

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Nginx (web server / reverse proxy)
sudo apt install -y nginx

# Install PM2 (process manager — keeps Node running)
sudo npm install -g pm2

# Install certbot for free HTTPS
sudo apt install -y certbot python3-certbot-nginx

# Verify
nginx -v
pm2 --version
psql --version
```

### 4.6 — Create the database

```bash
# Switch to postgres user
sudo -u postgres psql

# Inside psql:
CREATE DATABASE sanyadventures;
CREATE USER sanyadventures_user WITH ENCRYPTED PASSWORD 'choose_a_strong_password';
GRANT ALL PRIVILEGES ON DATABASE sanyadventures TO sanyadventures_user;
\q
```

### 4.7 — Upload the project to the VM

**Option A — Upload directly with scp** (simplest):
```bash
# On your local machine, from the folder containing sanyadventures/
scp -i ~/.ssh/id_rsa -r sanyadventures ubuntu@YOUR_VM_IP:/home/ubuntu/
```

**Option B — Use GitHub** (recommended for updates):
```bash
# On your local machine: push to GitHub
git init sanyadventures && cd sanyadventures
git add . && git commit -m "initial"
git remote add origin https://github.com/YOUR_USERNAME/sany-adventures.git
git push -u origin main

# On the VM:
git clone https://github.com/YOUR_USERNAME/sany-adventures.git /home/ubuntu/sanyadventures
```

### 4.8 — Configure the backend

```bash
cd /home/ubuntu/sanyadventures/backend

# Install dependencies
npm install --omit=dev

# Create the .env file
nano .env
```

Paste this into nano, filling in your values:
```env
PORT=5000
NODE_ENV=production
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sanyadventures
DB_USER=sanyadventures_user
DB_PASSWORD=your_db_password
DB_SSL=false
DB_POOL_MAX=10
DB_POOL_MIN=2
DB_STATEMENT_TIMEOUT=15000
JWT_SECRET=PASTE_YOUR_LONG_RANDOM_STRING_HERE
JWT_EXPIRES_IN=7d
ADMIN_EMAIL=admin@sanyadventures.com
ADMIN_PASSWORD=Change_This_Password_123
ADMIN_NAME=Super Admin
MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=174379
MPESA_PASSKEY=
MPESA_CALLBACK_URL=https://api.sanyadventures.com/api/payments/mpesa/callback
CLIENT_URL=https://sanyadventures.com
UPLOAD_DIR=uploads
MAX_FILE_SIZE_MB=5
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_smtp_key
SMTP_FROM="Sany Adventures <no-reply@sanyadventures.com>"
```

Save: `Ctrl+O`, Enter, `Ctrl+X`

```bash
# Create uploads directory
mkdir -p uploads

# Run migrations
npm run migrate

# Seed initial data (first time only)
npm run seed

# Create logs directory for PM2
mkdir -p logs

# Start with PM2 in cluster mode
pm2 start ecosystem.config.js --env production

# Make PM2 auto-start on server reboot
pm2 save
pm2 startup    # copy and run the command it outputs
```

Check it works:
```bash
curl http://localhost:5000/health
# {"status":"ok","env":"production",...}
```

### 4.9 — Build and deploy the frontend

```bash
cd /home/ubuntu/sanyadventures/frontend

# Create .env for production build
echo "REACT_APP_API_URL=https://YOUR_DOMAIN_OR_IP/api" > .env

# Install dependencies
npm install

# Build (creates frontend/build/ folder)
npm run build

# Copy build output to Nginx's web root
sudo cp -r build/* /var/www/html/
```

### 4.10 — Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/sanyadventures
```

Paste this configuration:
```nginx
# ── HTTP: redirect all traffic to HTTPS ─────────────────────────
server {
    listen 80;
    server_name sanyadventures.com www.sanyadventures.com;
    return 301 https://$server_name$request_uri;
}

# ── HTTPS: main site ─────────────────────────────────────────────
server {
    listen 443 ssl http2;
    server_name sanyadventures.com www.sanyadventures.com;

    # SSL certificates (filled in by certbot after Step 4.11)
    # ssl_certificate     /etc/letsencrypt/live/sanyadventures.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/sanyadventures.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # ── API: proxy to Node.js ──────────────────────────────────
    location /api/ {
        proxy_pass         http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 30s;
        proxy_connect_timeout 5s;
        client_max_body_size 15M;
    }

    # ── Health check ───────────────────────────────────────────
    location /health {
        proxy_pass http://localhost:5000;
        access_log off;
    }

    # ── Uploaded banner images ─────────────────────────────────
    location /uploads/ {
        alias /home/ubuntu/sanyadventures/backend/uploads/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # ── React frontend (SPA) ───────────────────────────────────
    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets from the React build
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/sanyadventures /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test the config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

Your site is now accessible at `http://YOUR_VM_IP` even without a domain.

### 4.11 — Free HTTPS with Let's Encrypt (requires a domain)

If you have a domain (e.g. sanyadventures.com), point its A record to your VM IP, then:

```bash
sudo certbot --nginx -d sanyadventures.com -d www.sanyadventures.com
```

Certbot automatically configures Nginx and renews the certificate every 90 days.

If you don't have a domain yet, the site still works over HTTP at your IP address. Add the domain later and run certbot then.

---

## Part 5 — Updating the project after changes

This is the workflow for pushing updates from your Windows laptop to the VPS.

### If using GitHub (recommended)

```bash
# On your laptop — after making changes:
git add .
git commit -m "describe your changes"
git push origin main

# On the VPS — pull and redeploy:
cd /home/ubuntu/sanyadventures
git pull origin main

# Restart the backend (zero-downtime rolling restart)
cd backend
npm install --omit=dev      # only needed if package.json changed
pm2 reload sany-adventures-api  # zero-downtime restart

# Rebuild and redeploy the frontend (only if frontend files changed)
cd ../frontend
npm install                  # only if package.json changed
npm run build
sudo cp -r build/* /var/www/html/

echo "Deploy complete"
```

### If uploading directly with scp

```bash
# Upload only the changed files
# Backend file change:
scp -i ~/.ssh/id_rsa backend/controllers/eventController.js \
    ubuntu@YOUR_IP:/home/ubuntu/sanyadventures/backend/controllers/

# Frontend change (must rebuild):
scp -i ~/.ssh/id_rsa -r frontend/src ubuntu@YOUR_IP:/home/ubuntu/sanyadventures/frontend/
ssh -i ~/.ssh/id_rsa ubuntu@YOUR_IP \
    "cd /home/ubuntu/sanyadventures/frontend && npm run build && sudo cp -r build/* /var/www/html/"

# Restart backend if backend files changed:
ssh -i ~/.ssh/id_rsa ubuntu@YOUR_IP "pm2 reload sany-adventures-api"
```

### One-command deploy script (save as deploy.sh on your laptop)

```bash
#!/bin/bash
# deploy.sh — run from your laptop after making changes

VM_IP="YOUR_VM_PUBLIC_IP"
VM_USER="ubuntu"
KEY="~/.ssh/id_rsa"
REMOTE="/home/ubuntu/sanyadventures"

echo "→ Pushing to GitHub..."
git add .
git commit -m "${1:-Update}" 2>/dev/null
git push origin main

echo "→ Pulling on VPS..."
ssh -i $KEY $VM_USER@$VM_IP "cd $REMOTE && git pull origin main"

echo "→ Restarting backend..."
ssh -i $KEY $VM_USER@$VM_IP "cd $REMOTE/backend && npm install --omit=dev && pm2 reload sany-adventures-api"

echo "→ Rebuilding frontend..."
ssh -i $KEY $VM_USER@$VM_IP "cd $REMOTE/frontend && npm install && npm run build && sudo cp -r build/* /var/www/html/"

echo "✓ Deploy complete"
```

Run it with: `bash deploy.sh "Added new feature"`

---

## Part 6 — Running on your phone (local network)

While your laptop is running the dev servers:

1. Open **cmd** and run `ipconfig` — find your **IPv4 Address** (e.g. `192.168.1.45`)
2. In `frontend/.env`: `REACT_APP_API_URL=http://192.168.1.45:5000/api`
3. In `backend/.env`: `CLIENT_URL=http://192.168.1.45:3000`
4. Restart both servers
5. On your phone: open `http://192.168.1.45:3000`

Your phone must be on the same WiFi network as your laptop.

---

## Part 7 — Changing your branding

All branding references are in predictable places. Here's every file to change:

### 1. Platform name

| File | What to change |
|------|---------------|
| `frontend/public/index.html` | `<title>Sany Adventures…</title>` on line 4 |
| `frontend/public/index.html` | `brand: 'Sany Adventures'` in the health check |
| `frontend/src/components/ui/Logo.js` | The `Sany` text in the SVG logo component |
| `backend/package.json` | `"name"` and `"description"` fields |
| `backend/server.js` | `brand: 'Sany Adventures'` in the /health response |
| `backend/config/seed.js` | `platform_name` setting value |
| `backend/.env` | `ADMIN_EMAIL`, `SMTP_FROM` |

### 2. Logo colours

The logo is a pure SVG component in `frontend/src/components/ui/Logo.js`. Change the fill colour (`#22c55e` = green) to any hex colour.

### 3. Brand colours (the whole theme)

All colours are CSS variables at the top of `frontend/public/index.html`. The key ones:

```css
--accent:      #22c55e;   /* primary green  — buttons, links, active states */
--accent-dim:  rgba(34,197,94,0.12);   /* green background tints */
--accent2:     #f97316;   /* orange — secondary colour, organizer highlights */
--danger:      #ef4444;   /* red — errors, cancel, sold out */
```

Change `--accent` to your brand colour (e.g. `#7c3aed` for purple, `#0ea5e9` for blue) and the entire interface updates automatically.

### 4. M-PESA callback URL

When you register on Safaricom Daraja, set the callback URL to:
```
https://YOUR_DOMAIN/api/payments/mpesa/callback
```
Update `MPESA_CALLBACK_URL` in your production `.env`.

---

## Part 8 — Database management

### Backup (run on VPS)
```bash
# Full backup
pg_dump sanyadventures > backup_$(date +%Y%m%d).sql

# Restore from backup
psql sanyadventures < backup_20250315.sql
```

### View tables
```bash
sudo -u postgres psql sanyadventures
\dt            # list all tables
\d users       # describe users table
SELECT * FROM platform_settings;
\q
```

### Run migrations on existing database (safe, never loses data)
```bash
cd /home/ubuntu/sanyadventures/backend
npm run migrate
# Uses ALTER TABLE IF NOT EXISTS — safe to run any number of times
```

### Reset everything (development only — destroys all data)
```bash
npm run reset
```

---

## Part 9 — Monitoring

```bash
# Live PM2 dashboard — CPU, RAM, request count per worker
pm2 monit

# View logs
pm2 logs sany-adventures-api          # tail all logs
pm2 logs sany-adventures-api --lines 100  # last 100 lines
pm2 logs sany-adventures-api --err    # error logs only

# Check Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Restart everything after a server reboot
pm2 resurrect    # restores the last saved PM2 state

# Scale up to use all CPU cores (zero downtime)
pm2 scale sany-adventures-api max
```

---

## Part 10 — Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `502 Bad Gateway` | PM2 process not running | `pm2 start ecosystem.config.js --env production` |
| `ECONNREFUSED` to DB | PostgreSQL not running | `sudo systemctl start postgresql` |
| `password authentication failed` | Wrong DB password in .env | `nano backend/.env` and fix `DB_PASSWORD` |
| Port 80/443 blocked | Oracle firewall | Add ingress rules in Oracle VCN security list |
| React app shows blank white page | `REACT_APP_API_URL` wrong or missing | Check `frontend/.env` and rebuild |
| M-PESA callback fails | URL not public HTTPS | Ensure your domain has SSL and `MPESA_CALLBACK_URL` is correct |
| `relation does not exist` | Migrations not run | `npm run migrate` |
| Icons not showing | Lucide CDN blocked | Check internet connection on server; icons work on client side |
| Build fails on VPS (low RAM) | Swap space needed | `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |

