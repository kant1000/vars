#!/usr/bin/env bash
# VARS — Paystack sandbox end-to-end test
#
# Run from repo root:
#   CUSTOMER_PASSWORD=xxx ./scripts/sandbox-test.sh
#
# Requires: curl, jq
# Sources .env automatically.

set -euo pipefail

# ── Prerequisites ─────────────────────────────────────────────────────────────
command -v jq   >/dev/null 2>&1 || { echo "ERROR: jq not found. brew install jq / apt install jq"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "ERROR: curl not found."; exit 1; }

# ── Load env ──────────────────────────────────────────────────────────────────
# shellcheck disable=SC1091
[ -f ".env" ]       && { set -a; source .env;       set +a; }
[ -f ".env.local" ] && { set -a; source .env.local; set +a; }

SUPABASE_URL="${SUPABASE_URL:-${EXPO_PUBLIC_SUPABASE_URL:-}}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}}"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
CRON_SECRET="${CRON_SECRET:-}"
VENDOR_PASSWORD="${VENDOR_PASSWORD:-${EXPO_PUBLIC_DEV_VENDOR_PASSWORD:-}}"

[ -z "$SUPABASE_URL" ]      && { echo "ERROR: SUPABASE_URL not set"; exit 1; }
[ -z "$SUPABASE_ANON_KEY" ] && { echo "ERROR: SUPABASE_ANON_KEY not set"; exit 1; }
[ -z "$SERVICE_ROLE_KEY" ]  && { echo "ERROR: SUPABASE_SERVICE_ROLE_KEY not set"; exit 1; }
[ -z "$CRON_SECRET" ]       && { echo "ERROR: CRON_SECRET not set"; exit 1; }
[ -z "$VENDOR_PASSWORD" ]   && { echo "ERROR: VENDOR_PASSWORD not set (or EXPO_PUBLIC_DEV_VENDOR_PASSWORD)"; exit 1; }

VENDOR_EMAIL="test-vendor@vars.com"
VENDOR_ID="64ecda2f-cc74-419e-b8b3-912138e02607"
CUSTOMER_EMAIL="emmanuelbty@gmail.com"
CUSTOMER_ID="2fe528ee-e481-47d1-8744-710f24d286d9"
TEMP_PASSWORD="VarsSandboxTest_$(date +%s)!"  # set temporarily, cleared after test
FN="${SUPABASE_URL}/functions/v1"
REST="${SUPABASE_URL}/rest/v1"
AUTH_ADMIN="${SUPABASE_URL}/auth/v1/admin"

# Lagos test coordinates (Victoria Island)
USER_LAT="6.4281"
USER_LNG="3.4219"

# Scheduled ~91 min from now: past the "too soon" slot check AND inside the
# 120-min gate window, so paystack-gate fires immediately without waiting.
if date --version >/dev/null 2>&1; then
  SCHEDULED_AT=$(date -u -d "+91 minutes" "+%Y-%m-%dT%H:%M:00.000Z")
else
  SCHEDULED_AT=$(date -u -v+91M "+%Y-%m-%dT%H:%M:00.000Z")
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
RESP_BODY=""
RESP_STATUS=""

fetch() {
  local url="$1"; shift
  local tmp; tmp=$(mktemp)
  RESP_STATUS=$(curl -s -o "$tmp" -w "%{http_code}" "$@" "$url")
  RESP_BODY=$(cat "$tmp"); rm -f "$tmp"
  if [ "$RESP_STATUS" -lt 200 ] || [ "$RESP_STATUS" -ge 300 ]; then
    printf "\n  \033[31mHTTP %s\033[0m\n" "$RESP_STATUS"
    echo "$RESP_BODY" | jq . 2>/dev/null || echo "$RESP_BODY"
    exit 1
  fi
}

section() { printf "\n\033[1;36m━━━ %s ━━━\033[0m\n" "$*"; }
ok()      { printf "  \033[32m✓\033[0m  %s\n" "$*"; }
info()    { printf "  %s\n" "$*"; }

# ═════════════════════════════════════════════════════════════════════════════
section "STEP 1 — Vendor sign-in"

fetch "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -d "{\"email\":\"${VENDOR_EMAIL}\",\"password\":\"${VENDOR_PASSWORD}\"}"

VENDOR_JWT=$(echo "$RESP_BODY" | jq -r '.access_token')
[ "$VENDOR_JWT" = "null" ] && { echo "ERROR: vendor sign-in failed"; echo "$RESP_BODY" | jq .; exit 1; }
ok "Vendor JWT obtained (${VENDOR_JWT:0:20}...)"

# ═════════════════════════════════════════════════════════════════════════════
section "STEP 2 — Save vendor bank account (paystack-verify-bank action=save)"

fetch "${FN}/paystack-verify-bank" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${VENDOR_JWT}" \
  -d '{
    "action":         "save",
    "account_number": "2000691736",
    "bank_code":      "50211",
    "bank_name":      "Kuda Bank",
    "account_name":   "Oluwaseyi  Ibitoye"
  }'

echo "$RESP_BODY" | jq .
SUBACCOUNT_CODE=$(echo "$RESP_BODY" | jq -r '.subaccount_code // empty')

# ═════════════════════════════════════════════════════════════════════════════
section "STEP 3 — Confirm paystack_subaccount_code in DB (service role)"

fetch "${REST}/vendors?id=eq.${VENDOR_ID}&select=paystack_subaccount_code" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"

DB_SUBACCOUNT=$(echo "$RESP_BODY" | jq -r '.[0].paystack_subaccount_code // empty')

if [ -z "$DB_SUBACCOUNT" ]; then
  echo "  ABORT: paystack_subaccount_code is null on the vendors row."
  echo "  The bank save may have failed — check edge function logs."
  exit 1
fi

ok "paystack_subaccount_code = ${DB_SUBACCOUNT}"

# ═════════════════════════════════════════════════════════════════════════════
section "STEP 4 — Customer sign-in (GitHub OAuth account — using admin temp password)"

ok "Customer user ID = ${CUSTOMER_ID}"

# Set a temporary password on the account (GitHub OAuth accounts have no password by default).
# email_confirm:true is required so Supabase allows password sign-in on an OAuth-only account.
fetch "${AUTH_ADMIN}/users/${CUSTOMER_ID}" \
  -X PUT \
  -H "Content-Type: application/json" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d "{\"password\":\"${TEMP_PASSWORD}\",\"email_confirm\":true}"
ok "Temporary password set on ${CUSTOMER_EMAIL}"

# Ensure the temp password is always cleared on exit, even if the script errors
trap 'fetch "${AUTH_ADMIN}/users/${CUSTOMER_ID}" -X PUT \
  -H "Content-Type: application/json" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -d "{\"password\":null}" 2>/dev/null || true; \
  echo "  Temp password cleared."' EXIT

# Sign in with password grant
fetch "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -d "{\"email\":\"${CUSTOMER_EMAIL}\",\"password\":\"${TEMP_PASSWORD}\"}"

CUSTOMER_JWT=$(echo "$RESP_BODY" | jq -r '.access_token')
[ "$CUSTOMER_JWT" = "null" ] && { echo "ERROR: customer sign-in failed"; echo "$RESP_BODY" | jq .; exit 1; }
ok "Customer JWT obtained"

# ═════════════════════════════════════════════════════════════════════════════
section "STEP 5 — Card verification (paystack-verify-card)"

fetch "${FN}/paystack-verify-card" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${CUSTOMER_JWT}" \
  -d '{}'

ALREADY_VERIFIED=$(echo "$RESP_BODY" | jq -r '.already_verified // false')

if [ "$ALREADY_VERIFIED" = "true" ]; then
  ok "Card already verified — skipping checkout"
else
  ACCESS_CODE=$(echo "$RESP_BODY" | jq -r '.access_code')
  CHECKOUT_URL="https://checkout.paystack.com/${ACCESS_CODE}"
  info "access_code : ${ACCESS_CODE}"
  info "checkout URL: ${CHECKOUT_URL}"
  echo ""
  printf "  \033[1;33m▶ Open the URL above in your browser NOW and complete checkout:\033[0m\n"
  printf "  \033[1;33m    Card number : 4084 0840 8408 4081\033[0m\n"
  printf "  \033[1;33m    CVV         : 408\033[0m\n"
  printf "  \033[1;33m    Expiry      : any future date\033[0m\n"
  printf "  \033[1;33m    OTP         : 123456\033[0m\n"
  printf "  \033[1;33m  Script will poll for up to 2 minutes...\033[0m\n"
  echo ""
fi

# ═════════════════════════════════════════════════════════════════════════════
section "STEP 6 — Poll for paystack_authorization_code on customer profile"

AUTH_CODE=""
for i in $(seq 1 40); do
  fetch "${REST}/profiles?id=eq.${CUSTOMER_ID}&select=paystack_authorization_code" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"

  AUTH_CODE=$(echo "$RESP_BODY" | jq -r '.[0].paystack_authorization_code // empty')

  if [ -n "$AUTH_CODE" ]; then
    ok "paystack_authorization_code = ${AUTH_CODE}"
    break
  fi

  info "Attempt ${i}/40 — not yet. Waiting 3s..."
  sleep 3
done

if [ -z "$AUTH_CODE" ]; then
  echo ""
  echo "  FAIL: paystack_authorization_code never appeared after 2 minutes."
  echo "  → Webhook never fired. Check:"
  echo "    1. Paystack dashboard → Settings → API Keys & Webhooks"
  echo "       URL must be: ${FN}/paystack-webhook"
  echo "    2. Supabase Dashboard → Edge Functions → paystack-webhook → Logs"
  exit 1
fi

# ═════════════════════════════════════════════════════════════════════════════
section "STEP 7 — Fetch active service for test vendor"

fetch "${REST}/vendor_services?vendor_id=eq.${VENDOR_ID}&is_active=eq.true&select=id,service_name,price_kobo&limit=1" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"

SERVICE_ID=$(echo "$RESP_BODY" | jq -r '.[0].id // empty')
SERVICE_NAME=$(echo "$RESP_BODY" | jq -r '.[0].service_name // empty')

if [ -z "$SERVICE_ID" ]; then
  echo "  ABORT: No active vendor_services row found for vendor ${VENDOR_ID}."
  echo "  → Add at least one service via the vendor Profile screen first."
  exit 1
fi

ok "Service: ${SERVICE_NAME} (${SERVICE_ID})"
info "scheduled_at: ${SCHEDULED_AT}  (~91 min from now — inside 120-min gate window)"

# ═════════════════════════════════════════════════════════════════════════════
section "STEP 8 — Initialize booking (paystack-initialize)"

fetch "${FN}/paystack-initialize" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${CUSTOMER_JWT}" \
  -d "{
    \"service_ids\":          [\"${SERVICE_ID}\"],
    \"scheduled_at\":         \"${SCHEDULED_AT}\",
    \"user_location_lat\":    ${USER_LAT},
    \"user_location_lng\":    ${USER_LNG},
    \"user_location_address\": \"1 Test Street, Victoria Island, Lagos\"
  }"

BOOKING_ID=$(echo "$RESP_BODY" | jq -r '.booking_id')
AUTO_ACCEPTED=$(echo "$RESP_BODY" | jq -r '.auto_accepted')
ok "booking_id    = ${BOOKING_ID}"
ok "auto_accepted = ${AUTO_ACCEPTED}"

# ═════════════════════════════════════════════════════════════════════════════
section "STEP 9 — Vendor accepts booking (paystack-capture)"

if [ "$AUTO_ACCEPTED" = "true" ]; then
  ok "Booking was auto-accepted — capture step skipped"
else
  fetch "${FN}/paystack-capture" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${VENDOR_JWT}" \
    -d "{\"booking_id\":\"${BOOKING_ID}\"}"

  CAPTURE_STATUS=$(echo "$RESP_BODY" | jq -r '.status')
  ok "status = ${CAPTURE_STATUS}"
fi

# ═════════════════════════════════════════════════════════════════════════════
section "STEP 10 — Fire gate (paystack-gate trigger_type=manual)"

fetch "${FN}/paystack-gate" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${VENDOR_JWT}" \
  -d "{\"booking_id\":\"${BOOKING_ID}\",\"trigger_type\":\"manual\"}"

echo "$RESP_BODY" | jq .
GATE_STATUS=$(echo "$RESP_BODY" | jq -r '.status // "pending"')
ok "Gate fired. response status=${GATE_STATUS}"

# ═════════════════════════════════════════════════════════════════════════════
section "STEP 11 — Poll for booking status = on_way"

BOOKING_STATUS=""
for i in $(seq 1 10); do
  fetch "${REST}/bookings?id=eq.${BOOKING_ID}&select=status" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"

  BOOKING_STATUS=$(echo "$RESP_BODY" | jq -r '.[0].status')

  if [ "$BOOKING_STATUS" = "on_way" ]; then
    ok "Booking status = on_way ✓"
    break
  fi

  info "Attempt ${i}/10 — current status: ${BOOKING_STATUS}. Waiting 3s..."
  sleep 3
done

if [ "$BOOKING_STATUS" != "on_way" ]; then
  echo ""
  echo "  FAIL: Booking never reached on_way after 30s (stuck on: ${BOOKING_STATUS})."
  echo "  → The gate charge fired but the charge.success webhook did not advance the booking."
  echo "  → Check:"
  echo "    1. Paystack dashboard → Settings → API Keys & Webhooks"
  echo "       URL must be: ${FN}/paystack-webhook"
  echo "    2. Supabase Dashboard → Edge Functions → paystack-webhook → Logs"
  exit 1
fi

# ═════════════════════════════════════════════════════════════════════════════
section "STEP 12 — Advance job status (arrived → service_rendered)"

fetch "${FN}/vendor-update-job-status" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${VENDOR_JWT}" \
  -d "{\"booking_id\":\"${BOOKING_ID}\",\"new_status\":\"arrived\"}"
ok "→ arrived"

fetch "${FN}/vendor-update-job-status" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${VENDOR_JWT}" \
  -d "{\"booking_id\":\"${BOOKING_ID}\",\"new_status\":\"service_rendered\"}"
ok "→ service_rendered"

fetch "${REST}/bookings?id=eq.${BOOKING_ID}&select=status,auto_release_at" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"
FINAL_STATUS=$(echo "$RESP_BODY" | jq -r '.[0].status')
AUTO_RELEASE_AT=$(echo "$RESP_BODY" | jq -r '.[0].auto_release_at')
ok "Final status = ${FINAL_STATUS}"

# ═════════════════════════════════════════════════════════════════════════════
section "STEP 13 — Summary"

echo ""
printf "  \033[1m%-28s\033[0m %s\n" "booking_id:"          "${BOOKING_ID}"
printf "  \033[1m%-28s\033[0m %s\n" "subaccount_code:"     "${DB_SUBACCOUNT}"
printf "  \033[1m%-28s\033[0m %s\n" "authorization_code:"  "${AUTH_CODE}"
printf "  \033[1m%-28s\033[0m %s\n" "final status:"        "${FINAL_STATUS}"
printf "  \033[1m%-28s\033[0m %s\n" "auto_release_at:"     "${AUTO_RELEASE_AT}"
echo ""
printf "  \033[1;33mNext manual steps:\033[0m\n"
echo ""
printf "  1. Paystack test dashboard → Transactions\n"
printf "     Verify the charge shows an 80/20 split to subaccount %s\n" "${DB_SUBACCOUNT}"
echo ""
printf "  2. Paystack dashboard → Settlement → Subaccounts\n"
printf "     Select %s → trigger manual settlement to push funds to the vendor's bank\n" "${DB_SUBACCOUNT}"
echo ""
printf "  3. Run paystack-settle to mark the booking completed.\n"
printf "     The cron path settles all bookings past auto_release_at (%s).\n" "${AUTO_RELEASE_AT}"
printf "     To settle immediately without waiting, use the customer confirmation path:\n"
echo ""
printf "     \033[90m# Option A — immediate (customer confirms service complete)\033[0m\n"
printf "     curl -X POST %s/paystack-settle \\\\\n" "${FN}"
printf "       -H 'Content-Type: application/json' \\\\\n"
printf "       -H 'Authorization: Bearer %s' \\\\\n" "${CUSTOMER_JWT:0:20}...  # customer JWT from step 4"
printf "       -d '{\"booking_id\":\"%s\"}'\n" "${BOOKING_ID}"
echo ""
printf "     \033[90m# Option B — cron (fires auto-release; booking must be past auto_release_at)\033[0m\n"
printf "     curl -X POST %s/paystack-settle \\\\\n" "${FN}"
printf "       -H 'Content-Type: application/json' \\\\\n"
printf "       -H 'x-vars-cron-secret: %s' \\\\\n" "${CRON_SECRET}"
printf "       -d '{}'\n"
echo ""
printf "  \033[32m✓ Sandbox test complete.\033[0m\n"
echo ""
