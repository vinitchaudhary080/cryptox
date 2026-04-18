#!/bin/bash
# Local DB fix — adds password reset columns + push_subscriptions table.
# Run once after pulling latest code on a local dev machine:
#   bash backend/scripts/fix-local-db.sh
#
# Uses `prisma db execute` which connects using the SAME DATABASE_URL your
# backend uses — if Prisma can connect, so can this script.

set -e
cd "$(dirname "$0")/.."

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AlgoPulse — Local DB sync"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Using DATABASE_URL from backend/.env"
echo ""

# Prisma db execute is resilient to weird passwords, special chars, etc.
# because it uses Prisma's internal connection logic.
echo "━━ 1. Probe DB connection ━━"
if ! npx prisma db execute --stdin <<< "SELECT 1;" > /dev/null 2>&1; then
  echo "❌ Cannot reach database via DATABASE_URL in backend/.env"
  echo "   Check:"
  echo "   - Postgres service is running (brew services list)"
  echo "   - backend/.env DATABASE_URL is correct"
  exit 1
fi
echo "✓ Connected"
echo ""

echo "━━ 2. Add missing columns (idempotent) ━━"
npx prisma db execute --stdin <<'SQL'
ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetOtp" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetOtpExpiry" TIMESTAMP(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetOtpAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetTokenHash" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetTokenExpiry" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "push_subscriptions_userId_endpoint_key" UNIQUE("userId", endpoint),
  CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
);
SQL
echo "✓ Schema applied"
echo ""

echo "━━ 3. Verify reset% columns exist ━━"
OUTPUT=$(npx prisma db execute --stdin <<< "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name LIKE 'reset%';" 2>&1)
echo "$OUTPUT"
if ! echo "$OUTPUT" | grep -q "resetOtp"; then
  echo ""
  echo "⚠️  reset% columns didn't appear — something odd with your Postgres."
  echo "   Paste this output to chat."
  exit 1
fi
echo "✓ Columns present"
echo ""

echo "━━ 4. Regenerate Prisma client (fresh types) ━━"
rm -rf node_modules/.prisma
npx prisma generate > /dev/null 2>&1
echo "✓ Regenerated"
echo ""

echo "━━ 5. Rebuild dist ━━"
rm -rf dist
npm run build > /dev/null
echo "✓ Built"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅  Local DB is now in sync."
echo "  Next: npm run dev"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
