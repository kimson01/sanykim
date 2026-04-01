# Sany Adventures — Scaling & Production Guide

## Current capacity (single instance, no changes)

| RAM | Concurrent users | Notes |
|-----|-----------------|-------|
| 512MB | 80–150 | Railway/Render free tier |
| 1GB | 200–350 | Comfortable headroom |

## After the performance improvements in this release

| RAM | Concurrent users | What changed |
|-----|-----------------|--------------|
| 512MB | 300–500 | Auth cache + compression |
| 1GB | 600–900 | Same, more headroom |

## With PM2 cluster mode (recommended for production)

```bash
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 save && pm2 startup
```

| Server cores | Concurrent users | Monthly cost (Hetzner/DigitalOcean) |
|-------------|-----------------|--------------------------------------|
| 2 cores / 2GB | 1,200–1,800 | ~$6–10/month |
| 4 cores / 8GB | 3,000–4,500 | ~$20–24/month |
| 8 cores / 16GB | 6,000–9,000 | ~$48–56/month |

## Database limits (the real bottleneck)

PostgreSQL connections are finite. The pool is configured per worker:

```
Total DB connections = DB_POOL_MAX × number of PM2 workers
```

| Provider | Max connections | Workers supported |
|----------|----------------|-------------------|
| Neon free | 100 | ~5 workers at pool=20 |
| Neon Pro | 1,000 | ~50 workers |
| Supabase free | 60 | ~3 workers at pool=20 |
| Self-hosted PostgreSQL + PgBouncer | Unlimited | Any |

**For events with 5,000+ concurrent buyers** (e.g., Afrobeats Night):
1. Upgrade to Neon Pro ($19/month) before the event
2. Add a read replica for analytics/reporting queries
3. Use PgBouncer connection pooler between the app and Postgres

## Load balancer setup (3+ servers)

Use Nginx as a load balancer in front of multiple servers:

```nginx
upstream sany_backend {
    least_conn;                          # route to least-loaded worker
    server 10.0.0.1:5000 weight=1;
    server 10.0.0.2:5000 weight=1;
    server 10.0.0.3:5000 weight=1;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name api.sanyadventures.com;

    location / {
        proxy_pass         http://sany_backend;
        proxy_http_version 1.1;
        proxy_set_header   Connection "";
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }

    # Health check endpoint for load balancer
    location /health {
        proxy_pass http://sany_backend;
        access_log off;
    }
}
```

**Note on JWT auth cache**: The user cache is per-process (in-memory). Across
multiple servers, disabling a user may take up to 60 seconds to propagate on
other machines. This is acceptable for most use cases. If you need immediate
propagation, replace the Map with a shared Redis cache.

## What to do before a high-traffic event

1. **24 hours before**: upgrade DB plan, run `npm run migrate` for new indexes
2. **2 hours before**: scale PM2 workers (`pm2 scale sany-adventures-api 8`)
3. **During**: watch `pm2 monit` for memory/CPU and DB connection count
4. **After**: scale back down to save costs

## Recommended production stack (Kenya, East Africa)

| Component | Service | Monthly cost |
|-----------|---------|-------------|
| API servers | Hetzner Cloud CX31 (2 vCPU, 8GB) | €8.49/month |
| Database | Neon Pro (PostgreSQL) | $19/month |
| Frontend | Vercel (auto CDN) | Free |
| File storage | Cloudinary (banner images) | Free up to 25GB |
| Email | Brevo (formerly Sendinblue) | Free up to 300/day |
| Monitoring | Better Uptime (free) | Free |
| **Total** | | ~**$35/month** |

Vercel's CDN serves the React frontend from edge nodes in Johannesburg,
which means Kenyan users get sub-100ms page loads without a local CDN.

## Environment variables for production

```env
NODE_ENV=production
PORT=5000
PM2_INSTANCES=max          # one worker per CPU core
DB_POOL_MAX=5              # × instances = total connections
DB_POOL_MIN=1
DB_STATEMENT_TIMEOUT=15000 # kill queries > 15 seconds
```
