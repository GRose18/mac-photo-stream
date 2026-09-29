## Sclshi card game

The website now includes invite-only accounts, admin photo approval, daily packs,
one-of-one mythics, a daily coin wheel, private collections, and one-for-one card trading. See [GAME.md](GAME.md)
for admin setup, game rules, privacy, and free-plan limits. Camera uploads continue
to use the existing endpoint and token.

# Photo Stream — Cloudflare Workers Free + Supabase Free

Live site: https://mac-photo-stream.photo-stream-cloudflare-draft.workers.dev

Deployed and verified September 29, 2026. Synthetic live tests confirmed private
authentication, upload receipts, duplicate retries, download byte integrity,
delete, and persistence across redeployment. The actual Mac uploader was tested
with a synthetic JPEG (no camera access). The existing Render service is unchanged.
See ALTERNATE-MAC.md to switch the alternate Mac; it is not remotely reconfigured.

The private gallery runs on Workers Free. JPEGs live in the private Supabase
`photo-stream-worker` bucket, project `ghhgjogizbwzfyojxphy`. Capture timestamps,
IDs, and quota reservations live in one SQLite-backed Cloudflare Durable Object.
Both stores persist across ordinary restarts and deployments. This application
never automatically deletes images. Free hosting is not a backup or a promise of
indefinite provider retention; keep originals separately.

## Strictly free operation

Keep BOTH providers on Free. Do not activate R2 or paid add-ons. Provider limits
can interrupt service; never upgrade automatically to restore it. Application
limits add a margin but cannot control other activity in either account.

| Application guard | Limit |
|---|---:|
| Reserved storage (including unfinished uploads) | 800 MB |
| Photo count | 40,000 |
| Individual JPEG | 1 MB |
| Upload attempts per UTC day | 2,000 |
| Download attempts per UTC day | 10,000 |
| Estimated storage response transfer budget per UTC day | 60 MB |

Supabase Free includes 1 GB storage and 5 GB egress. Transfer reservations include
image bytes and 8 KB per request; any 32 UTC dates reserve at most 1.92 GB.
This is an app-local estimate, not provider metering. Direct dashboard usage,
other buckets, and other apps consume shared allowances independently.

At capacity, new uploads return 507. Daily limits return 429. Existing images are
preserved. Failed operations consume budget and interrupted uploads keep their
reservation, intentionally overcounting. Retrying the same ID and bytes is safe.

Supabase can pause inactive Free projects. Resume a paused project in its
dashboard; retain local files on errors. Workers Free also has request, CPU, and
Durable Object limits. Neither service guarantees unlimited availability.

References checked September 29, 2026:
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/durable-objects/platform/pricing/

## Deployment invariants

Use a NEW, EMPTY, PRIVATE bucket dedicated to this Worker. Bucket upload limit:
1 MB, MIME image/jpeg. No public URLs or anonymous storage policies. This Worker
must be the only writer. Never use a local/preview ledger with the production bucket.
Do not delete/reset the Durable Object database, rename its singleton
`supabase-gallery-v1`, remove its namespace, or roll back to an incompatible
ledger while bucket contents exist. Doing so loses the gallery index and storage
accounting. Back up metadata before any such migration.

Required Worker secrets: SUPABASE_SECRET_KEY, ADMIN_PASSWORD, UPLOAD_TOKEN.
The Supabase secret is privileged and belongs only on the server. Never commit
secrets or copy that key to the uploader. Browser login uses username `admin` and
ADMIN_PASSWORD over HTTPS. Uploads use the separate UPLOAD_TOKEN.

Set FREE_PLAN_SETUP_VERIFIED=true only after verifying both Free plans, the
empty private bucket, and correct secrets. Keep the flag false otherwise.

## API

POST /upload: raw JPEG, Authorization: Bearer <token>, UUID X-Photo-ID, ISO
X-Captured-At. Reuse the same ID, timestamp and bytes on retries. Success JSON
must contain stored=true plus matching id and SHA-256. A generic 200, timeout or
loading page is not confirmation. Keep separate local backups.

GET /api/images returns 20 records and a next cursor. GET /api/usage shows quotas.
GET /api/images/<id> returns an authenticated JPEG. DELETE the same URL with
X-Photo-Action: delete permanently removes that photo after explicit user action.
Tombstones prevent retries from resurrecting deliberately deleted images.

The old multipart uploader is incompatible. Do not just change its URL.

## Development

Node.js 22 or newer is required (validated with Node 24).

```
npm ci
npm test
npm run build
npm run test:runtime
```

Unit tests cover quotas, failed/retried/concurrent uploads, authentication,
deletions and the Supabase SDK adapter. The runtime smoke test uses actual local
Cloudflare Durable Object storage with mocked Supabase; it does not take photos
or contact live storage. Live verification was also completed separately.

## Existing photo migration

Four photos visible on Render on September 29, 2026 were copied without
recompression and their downloaded SHA-256 hashes verified. The old site stored
upload time only; those records are labeled "Original upload". Local originals
and migration receipts are retained in the ignored migration-backup directory.
The alternate Mac still needs the setup guide; future uploads to Render will
not automatically appear on the new site until that client is switched.
