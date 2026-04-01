#!/bin/bash
# ─────────────────────────────────────────────────────────────
# deploy.sh — Sany Adventures one-command deploy script
# Run from your laptop: bash deploy.sh "Your commit message"
#
# SETUP: edit the three variables below before first use
# ─────────────────────────────────────────────────────────────

VM_IP="YOUR_VM_PUBLIC_IP"        # e.g. 129.153.45.67
VM_USER="ubuntu"                  # Oracle Cloud default user
SSH_KEY="$HOME/.ssh/id_rsa"       # path to your private key

# ── Derived paths ────────────────────────────────────────────
REMOTE="/home/ubuntu/sanyadventures"
COMMIT_MSG="${1:-Update $(date '+%Y-%m-%d %H:%M')}"
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no $VM_USER@$VM_IP"

echo ""
echo "  Sany Adventures Deploy"
echo "  Target: $VM_USER@$VM_IP"
echo "  Commit: $COMMIT_MSG"
echo ""

# ── 1. Commit and push ───────────────────────────────────────
echo "[ 1 / 4 ] Pushing to GitHub..."
git add .
git commit -m "$COMMIT_MSG" 2>/dev/null || echo "  (nothing new to commit)"
git push origin main

# ── 2. Pull on VPS ───────────────────────────────────────────
echo "[ 2 / 4 ] Pulling latest code on VPS..."
$SSH "cd $REMOTE && git pull origin main"

# ── 3. Restart backend ───────────────────────────────────────
echo "[ 3 / 4 ] Restarting backend (zero-downtime)..."
$SSH "
  cd $REMOTE/backend
  npm install --omit=dev --silent
  npm run migrate
  pm2 reload sany-adventures-api --update-env
"

# ── 4. Rebuild frontend ──────────────────────────────────────
echo "[ 4 / 4 ] Rebuilding frontend..."
$SSH "
  cd $REMOTE/frontend
  npm install --silent
  npm run build
  sudo cp -r build/* /var/www/html/
"

echo ""
echo "  Deploy complete  https://$VM_IP"
echo ""
