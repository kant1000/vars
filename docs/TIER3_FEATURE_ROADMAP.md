# VARS Mobile — Tier 3 Feature Roadmap

> These three features require non-trivial backend design before any mobile code is written.
> Each section defines the problem clearly, the required schema/infra work, the mobile implementation
> plan, and the open questions that must be answered before work begins.

---

## 1. In-App Messaging (Vendor ↔ Customer)

### Problem

There is currently no channel for vendors and customers to communicate after a booking is placed. The only contact mechanism is phone number, which is locked behind the 15-minute pre-arrival reveal. This creates friction for:
- Customers needing to clarify access or location details
- Vendors confirming service specifics or running late
- Rescheduling negotiations (currently a structured suggest/accept flow, not free-form)

This is table stakes for a service marketplace. Airbnb, Fiverr, TaskRabbit, and Fresha all have in-app messaging.

### Backend design required first

**New table: `messages`**
```sql
create table messages (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  sender_id   uuid not null references auth.users(id),
  body        text not null check (char_length(body) between 1 and 1000),
  sent_at     timestamptz not null default now(),
  read_at     timestamptz
);

-- Index for conversation retrieval
create index messages_booking_sent on messages(booking_id, sent_at);

-- RLS: only sender and recipient (vendor + customer) of the booking can see messages
alter table messages enable row level security;

create policy "booking_parties_read" on messages
  for select using (
    exists (
      select 1 from bookings b
      where b.id = messages.booking_id
        and (b.user_id = auth.uid() or b.vendor_id = auth.uid())
    )
  );

create policy "booking_parties_insert" on messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from bookings b
      where b.id = booking_id
        and (b.user_id = auth.uid() or b.vendor_id = auth.uid())
    )
  );
```

**Supabase Realtime:**
Realtime must be enabled on the `messages` table. Messages are delivered via `supabase.channel('messages:booking-{id}')` Postgres changes subscription.

**Push notifications:**
A new edge function `send-message-notification` triggered by a Postgres function/trigger (or called from the client after insert) to send a push notification to the other party. Reuse the existing notifications infrastructure in `supabase/functions/_shared/notifications.ts`.

**Message context window:**
Open question — should messages be scoped to individual bookings (thread per booking) or to vendor-customer pairs (one thread per relationship, across all bookings)? The per-booking model is simpler and maps to how the rest of the app is structured. Recommended: start per-booking.

**Rate limiting:**
The `messages` table insert should be rate-limited to prevent spam. Consider a database trigger or edge function check: max 30 messages per sender per hour per booking.

### Mobile implementation plan

Only begin mobile work once the table, RLS policies, and edge function are deployed and tested.

**New screen: `app/chat/[bookingId].tsx`**
- Accessible from: booking detail screen (customer) and schedule bottom sheet (vendor)
- Shows: message bubbles in chronological order, sender name on vendor messages, "You" on own messages
- Input: single-line text input with send button, 1000-char limit mirroring DB constraint
- Read receipts: mark messages as read on screen mount / focus
- Realtime: `supabase.channel()` subscription updates the list in place without re-fetch

**UI approach:**
Do NOT use `react-native-gifted-chat`. Build a custom chat UI on top of a `FlatList` (inverted). The message rendering is simple (text bubbles + timestamps). The complexity is all in the Supabase Realtime subscription and notification delivery, not the UI.

**Tab badge:**
Add unread message count to the Bookings and Schedule tabs when there are unread messages. The unread count is a `count` query on `messages WHERE read_at IS NULL AND sender_id != auth.uid() AND booking_id IN (active bookings)`.

### Open questions before starting

1. **Scope of messaging:** Only during active bookings (pending → service_rendered), or also after completion (e.g. for re-booking)?
2. **Message persistence:** How long are messages retained? Probably at least 90 days.
3. **Moderation:** Are messages reviewed? VARS team needs read access. Add an admin-facing messages view.
4. **Content filtering:** The `sanitize()` function used on access details fields blocks phone numbers and email addresses. Should the same apply to messages? Probably yes, to discourage off-platform transactions.

---

## 2. Vendor Search — Fix Client-Side Filtering

### Problem

The Discover screen (`app/(tabs)/index.tsx`, lines 84–115) calls the `get_nearby_vendors` RPC with no text search parameter. Name filtering happens client-side after the RPC returns:

```ts
// Lines 104-107 — client-side filter on already-paginated results
const filtered = query.trim()
  ? results.filter((v) => v.full_name.toLowerCase().includes(query.toLowerCase()))
  : results;
```

This means:
- The RPC returns at most 20 vendors (the `lim` parameter)
- The client filters those 20 by name
- If the matching vendor is at position 21 in the database, the user sees nothing
- Pagination (`hasMore`, `offsetRef`) is based on unfiltered results, so loading more doesn't help

This is a product bug, not a cosmetic issue. Users searching by vendor name get silently wrong results.

### Backend design required

Add a `search_query` parameter to the `get_nearby_vendors` Postgres function:

```sql
-- Add optional text search to the existing RPC
-- The function currently orders by distance. With search, it should:
-- 1. Filter by name similarity (trigram or ilike) if a query is provided
-- 2. Otherwise return distance-ordered results as today

-- Requires pg_trgm extension
create extension if not exists pg_trgm;

-- Add GIN index on vendors.full_name for trigram search
create index vendors_full_name_trgm on vendors using gin (full_name gin_trgm_ops);
```

The function signature changes from:
```sql
get_nearby_vendors(lat, lng, category_slug, radius_km, lim, ofst)
```
to:
```sql
get_nearby_vendors(lat, lng, category_slug, radius_km, lim, ofst, search_query text default null)
```

When `search_query` is provided, filter with `full_name ilike '%' || search_query || '%'` (or trigram similarity for fuzzy matching). Order by: exact match first, then partial match, then distance.

**Also consider:** Services search — searching by service name (e.g. "fade", "cornrows") rather than vendor name. This requires joining `vendor_services` and `services` in the RPC, or a separate `search_vendors_by_service` RPC.

### Mobile implementation plan

After the RPC is updated and re-typed via `generate_typescript_types`:

1. Remove the client-side filter at lines 104-107 of `app/(tabs)/index.tsx`
2. Pass `search_query: query || null` as a parameter to `supabase.rpc('get_nearby_vendors', {...})`
3. Remove the `searchTimeout` debounce ref — the debounce stays but now calls RPC instead of filtering
4. Reset pagination (`offsetRef.current = 0`) on every new search, same as category changes

**Files touched:** `app/(tabs)/index.tsx` only.

### Open questions before starting

1. **Fuzzy vs exact match:** Does "fade" match "low fade barbing"? ilike handles this. Trigram handles typos too ("feyd" → "fade"). What tolerance level is right?
2. **Service search:** Is searching by service name in scope for this iteration?
3. **Analytics:** Once PostHog is live (Tier 1), instrument search queries before changing RPC behaviour so you have a baseline of what users are currently searching for.

---

## 3. Vendor Portfolio Gallery

### Problem

The vendor detail / booking flow (`app/booking/[vendorId].tsx`) shows no portfolio photos. Customers cannot see the vendor's previous work before booking. For a grooming/beauty service app, this is a significant trust and conversion gap — portfolio quality is the primary signal customers use to choose between vendors.

The portfolio photos exist in Supabase Storage (uploaded during vendor onboarding at `step-3-portfolio.tsx`) and are referenced in the `vendor_portfolio_photos` table. They are simply never displayed to consumers.

### Backend design required

Verify the existing `vendor_portfolio_photos` table structure. The `get_nearby_vendors` RPC currently returns the vendor feed cards but likely does not include portfolio photo URLs.

Two options:
- **Option A:** Add a `portfolio_preview_urls` array (first 3 photos) to the `get_nearby_vendors` RPC return type and pre-populate `VendorCard` with a small photo strip.
- **Option B:** Fetch portfolio photos in the booking/vendor detail screen as a separate query (simpler, no RPC change).

Option B is recommended to start — no backend change required beyond confirming the table schema and storage bucket policies.

Check:
```sql
-- Confirm table exists and schema
select * from vendor_portfolio_photos limit 5;

-- Confirm storage bucket is public or accessible
select * from storage.buckets where name = 'vendor-portfolio';
```

If the storage bucket is set to `public`, photo URLs can be constructed directly. If it requires signed URLs, an authenticated query via the Supabase client is needed on the detail screen.

### Mobile implementation plan

**Phase 1: Gallery on vendor detail screen** (no RPC change needed)

Fetch photos in `app/booking/[vendorId].tsx` (or `app/vendor/[id].tsx`) on mount:
```ts
const { data } = await supabase
  .from('vendor_portfolio_photos')
  .select('id, storage_path, caption')
  .eq('vendor_id', vendorId)
  .order('created_at', { ascending: false })
  .limit(12);
```

Render as a horizontal `FlatList` of tappable thumbnails above the service list. On tap, open a full-screen image viewer (lightbox).

**For the image viewer:** Use `expo-image` (already installed) in a `Modal` with `pinch-to-zoom` via `react-native-gesture-handler` (already installed). No new library needed.

**Phase 2: Portfolio preview on VendorCard** (requires RPC or denormalized column)

Add a `portfolio_preview` column to `vendors` (JSON array of 3 photo URLs, maintained by a trigger when portfolio photos are added/removed), then surface it in `VendorCard` as a small horizontal thumbnail strip. This increases booking intent on the Discover screen.

**Files touched:**
- Phase 1: `app/booking/[vendorId].tsx` and/or `app/vendor/[id].tsx`
- Phase 2: `supabase/migrations/` (new column + trigger), `packages/shared/src/database.types.ts` regeneration, `app/(tabs)/index.tsx` VendorCard props

### Open questions before starting

1. **Photo consent screen:** `app/consent/[photoId].tsx` exists — is portfolio photo display gated by client consent? If so, what is the display logic?
2. **Storage bucket visibility:** Are portfolio photos in a public bucket or authenticated-only? Determines URL construction approach.
3. **Photo order:** Is there a defined display order for portfolio photos, or is `created_at desc` the right default?
4. **Minimum photos to show section:** Should the portfolio section be hidden if the vendor has 0 photos (to avoid empty state on all legacy vendor profiles during rollout)?

---

## Implementation Order Recommendation

If bandwidth allows, tackle in this order:

1. **Vendor portfolio gallery (Phase 1)** — highest conversion impact, potentially no backend changes needed. Can be validated quickly once storage bucket policy is confirmed.

2. **Vendor search fix** — a product correctness bug. Should happen before significant user growth so early users don't form a bad habit of working around it.

3. **In-app messaging** — most complex, most backend design. Do not start until portfolio and search are shipped. Requires a product decision on scope before any code is written.

---

*Last updated: 2026-05-28*
