# Durable photo storage with Supabase

Photos are stored in a private Supabase Storage bucket. IDs, file locations, upload timestamps and optional capture timestamps are stored in Postgres. Render restarts do not clear either. There is no automatic retention deletion or 20-photo cap. The public gallery shows 50 photos per page and provides older/newer navigation. Only password-authorized deletion removes a cloud photo; copies on Macs remain.

## Project already provisioned

- Name: Mac Photo Stream
- Project ref: `oonjtysmqptgcgqkftwr`
- Organization: The Powerwashing Pros (Free plan)
- Bucket: `photo-stream` (private)
- Table: `public.photos` (RLS enabled; only service_role has access)
- Migration: `supabase/migrations/20260928190523_durable_photo_storage.sql`

## Connect Render before deploying

In the existing service's Environment settings, set:

- `SUPABASE_URL`: `https://oonjtysmqptgcgqkftwr.supabase.co`
- `SUPABASE_SECRET_KEY`: a server-side secret key from Supabase Project Settings > API Keys. A legacy service_role key also works. Never use this key in the browser or commit it.
- `ADMIN_PASSWORD`: your private password for deleting photos.

Use Node 22 or 24 (package.json declares the supported range), build with `npm ci`, and start with `npm start`. Missing Supabase credentials intentionally prevent startup: the server never silently falls back to temporary memory. PHOTO_STORAGE_DIR is no longer needed. No Render disk is required.

## Uploads and timestamps

Existing clients continue to send multipart `image` to POST `/upload`. JPEG, PNG and WebP are accepted up to 6 MB. The database records the upload time. Clients can optionally add a `captured_at` field containing an ISO date with timezone to preserve the actual capture time. The gallery labels which timestamp is displayed. This implementation is for photos, not video uploads.

GET `/api/images` returns an array; `X-Next-Cursor` gives the next page's `before` query parameter. URLs are signed for one hour, refreshed when the gallery polls. The gallery is public, matching the previous website; the bucket and database are not directly public.

## Retention and free limits

The app never automatically deletes older photos. Free Supabase capacity is finite (currently 1 GB file storage, 500 MB database, and bandwidth limits). New uploads can fail at provider limits; local copies should be retained. Free projects may pause after inactivity. A free service is not an unlimited archive or a substitute for backups. See https://supabase.com/pricing.

## Verification and recovery

Run `npm test` with Node 22+. After adding server credentials, upload a photo, note its ID and timestamps, restart/redeploy Render, and verify the same record and image remain. Check missing/wrong passwords cannot delete photos.

If an object upload succeeds but saving its metadata fails, the server retains the object rather than deleting it on an ambiguous error. Its object path is logged for manual recovery; an administrator can insert the missing metadata after checking whether the row already exists. If explicit deletion removes an object but database deletion fails, retry the deletion to finish removing its row.

Old in-memory photos must be downloaded before replacing the old server. Previously lost photos cannot be recovered from Render; re-upload local Mac copies. This setup does not automatically import local archives.
