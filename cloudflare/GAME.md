# Sclshi club

The website root is now the Sclshi game. Sign in as `admin` with the existing
website password for Headquarters. Camera clients and their upload token do not
change. The old gallery remains at `/legacy` for compatibility.

## Launch your club

1. Sign in as admin. The Photo inbox contains all camera uploads privately.
2. Give a photo a title, choose Common/Rare/Epic/Mythic, and click Approve as card.
   Keep at least one Common card active so packs cannot sell out entirely.
3. Open Invitations, enter a guest label, and create a link. Copy it immediately;
   only its hash is stored. Send it privately to one guest. It expires in 7 days
   and can create exactly one account. Members subsequently sign in normally.
4. Create a separate invitation/account for yourself to play. Admin accounts
   manage the site but do not consume daily rewards.

## Game rules

- One free card and one free wheel spin per member per UTC calendar day.
- UTC midnight reset, visible countdown. Retries return the saved reward.
- Common/Rare/Epic can repeat. Every Mythic card design has one lifetime copy.
- Rarity weights: Common 75, Rare 18, Epic 6, Mythic 1, renormalized over available
  rarities. Cards within a rarity are equally likely. Live odds appear in the UI.
- Wheel: eight equally likely slots: 10, 25, 15, 50, 10, 100, 20, 250 coins.
  Coins are saved to an account, have no cash value, and cannot yet be spent.
- Owned repeats aggregate as a copy count. A card records capture time and the
  member's first serial. Titles and rarities are locked after issuance.
- Retiring a card removes it from future packs; owners keep it. A collectible's
  source photo cannot be deleted through the gallery. Unreleased private photos
  retain the existing explicit delete action.

## Persistence and privacy

The existing fixed SQLite Durable Object holds members, invitation hashes,
password hashes, card catalog, balances, and ownership. Its transaction boundary
serializes issuance and prevents simultaneous mythic duplication. The private
Supabase bucket holds the original image objects; cards reference them without
making extra cloud copies. Worker redeployments keep the same object ID/bindings.
No Supabase schema or bucket policy is changed.

The public page is a login shell with no photo metadata. Private inbox endpoints
require admin authentication. Card image endpoints require ownership or admin
access. Member passwords use salted PBKDF2-SHA256 (100,000 iterations). Seven-day
sessions use HMAC-signed Secure/HttpOnly/SameSite=Strict cookies. Disabling a member
invalidates their sessions; re-enabling requires another login. Admin password
rotation invalidates all signed sessions. A logout replaces the local cookie with a signed-out marker so cached legacy
Basic credentials cannot immediately sign the browser back in.
Existing Basic admin authentication remains supported for scripts and `/legacy`.
An explicit game session takes precedence over cached Basic credentials. There is no self-service password recovery in this beta.

All mutations require a same-origin custom-header request, invitations are random
256-bit one-use secrets sent in URL fragments, and login attempts are throttled.
Secrets never enter client HTML or Git. Do not share the upload token with players.

## Free-plan limits

No paid services/plans are enabled. Existing 800 MB / 40,000-photo storage,
2,000 daily photo writes, 10,000 photo reads, and 60 MB daily transfer guards stay.
The game also stops at 100 members, 500 card designs, 200 pending invitations,
2,500 daily game API requests, and 500 daily authentication attempts. Per-IP hash
buckets cap attempts at 15 per 15 minutes (shared networks can share a bucket).
The bounded catalog and request limit constrain ledger reads and writes; actual
provider quotas are account-wide and can still be reached by other applications.
Free-plan exhaustion may interrupt service; these limits do not promise unlimited
free traffic. Requests stop rather than upgrading or deleting photos. Review
Cloudflare and Supabase usage before expanding the beta.

## Validation and deployment

Use Node 22 or newer:

```sh
npm test
npm run build
npm run test:runtime
npx wrangler deploy
```

Tests cover upload compatibility, quotas, invitation reuse/expiry, authentication,
member isolation, CSRF, simultaneous issuance, mythic uniqueness, daily retry
idempotency, coin persistence, and retirement. Runtime smoke uses a local
Cloudflare emulator and fake storage; it never uploads test cards to production.
Browser checks use local synthetic images and accounts. Both camera upload
clients and existing private photos require no migration.

## Trading

Players can post one-card-for-one-card offers in Trading. Posting an offer is
permission for any member who owns the requested card to accept it. Acceptance
shows an explicit confirmation and atomically swaps one copy of each card.
Copies remain in their owners' collections until acceptance; no escrow or coins
are involved. Ownership and account status are checked again when accepting.
Only the maker can cancel an open offer. Competing acceptance requests and retries
cannot duplicate a card, including a mythic. Retired collectible cards may trade.

The board shows offered card images to signed-in members; the rest of a player's
collection remains private. Approved card titles/rarities are listed as request
choices. Limits: five open offers per member, 100 open offers total, and the most
recent 100 closed offers retained globally. Old trade history is pruned; owned
cards and coin balances are never pruned. Non-mythic cards use copy counts rather
than promising individually tracked serial numbers.
