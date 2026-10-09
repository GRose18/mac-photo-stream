# Photo Stream

A self-hosted, authenticated photo gallery built with Cloudflare Workers and private Supabase Storage. This guide recreates the gallery using your own accounts and a manually selected photo.

**Status:** the original hosted website was removed on October 6, 2026. Its old URL is not a demo or upload destination. Publishing this README does not restore that deployment.

## Choose the right source

The Cloudflare implementation is on [`codex/durable-photo-storage`](https://github.com/GRose18/mac-photo-stream/tree/codex/durable-photo-storage/cloudflare), not the legacy Node server on `main`. This guide was checked against commit `9bd77b8`.

That published version includes admin/member sign-in, invitations, explicit photo sharing, pagination, and media storage. Later experiments such as Download all, automatic sharing of all photos, and the gallery quota fix are **not included in that commit**.

## Architecture

- A Cloudflare Worker serves the website, verifies credentials, and handles uploads and downloads.
- A SQLite-backed Durable Object stores the gallery index, member records, and quota accounting.
- A private Supabase bucket stores the media bytes. Browsers access media through authenticated Worker routes.

Both metadata and media are needed to preserve the gallery. Keep independent backups of originals and metadata; a bucket alone is not a complete backup.

## Requirements

- Git, Node.js 22 or newer, npm, and Python 3 for the optional manual upload example.
- Your own Cloudflare account with Workers and SQLite-backed Durable Objects available.
- Your own Supabase project and a new, empty, private bucket dedicated to this deployment.
- Photos you own or have permission to upload and share.

Review the current [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/), [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), and [Supabase plan allowances](https://supabase.com/pricing). Application limits are not a guarantee of free hosting or a substitute for provider usage monitoring.

## 1. Get the gallery

```bash
git clone --branch codex/durable-photo-storage https://github.com/GRose18/mac-photo-stream.git
cd mac-photo-stream
# Optional: reproduce the exact version described here.
git checkout 9bd77b8
cd cloudflare
npm ci
```

Do all following npm and Wrangler commands from `cloudflare/`.

## 2. Prepare private storage

In your Supabase dashboard, create an empty bucket, for example `my-photo-stream`. Leave public access disabled, restrict files to `image/jpeg` and `video/mp4`, and set a 1 MB file-size limit. See [Creating buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets).

Use a separate bucket for each deployment. Do not connect a fresh local or preview metadata database to a production bucket. The Worker must be the only writer so its accounting stays consistent.

Obtain your project URL and server-side secret key. The key is privileged: store it only as a Worker secret, never in Git, browser code, or a capture client. Do not add anonymous bucket access policies.

## 3. Configure your Worker

Edit `wrangler.jsonc` before running any deployment command:

| Field | Your value |
| --- | --- |
| `name` | A unique Worker name, such as `my-photo-gallery` |
| `account_id` | Your Cloudflare account ID |
| `vars.SUPABASE_URL` | Your Supabase project URL |
| `vars.SUPABASE_BUCKET` | Your new private bucket name |
| `vars.FREE_PLAN_SETUP_VERIFIED` | `"false"` during setup |
| `vars.GALLERY_ONLY` | `"true"` |

Keep the `main`, Durable Object bindings, and migrations intact. Replace the original author's account and project values; do not deploy using them. Once you have real data, do not remove the Durable Object namespace, reset its database, or change its singleton identity without a migration and backups.

## 4. Validate and deploy

```bash
npm test
npm run build
npm run test:runtime
npx wrangler login
npx wrangler deploy
```

The initial deployment intentionally stays unavailable while setup is unverified. Add three secrets through Wrangler's prompts:

```bash
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put UPLOAD_TOKEN
```

Use distinct, randomly generated values for the administrator password and upload token, and save them in a password manager. The uploader needs only the upload token. See [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

After verifying the selected plans, private empty bucket, and secrets, change `FREE_PLAN_SETUP_VERIFIED` to `"true"` and run:

```bash
npx wrangler deploy
```

Open the HTTPS URL Wrangler prints. Sign in with username `admin` and your `ADMIN_PASSWORD`. There is no shared default password.

## 5. Upload a selected photo

This example uploads an existing JPEG under 1 MB; it does not access a camera, microphone, or screen. Run it from a terminal with Python 3. Enter your own deployed URL, upload token, and JPEG path when prompted. The token is entered without echoing or putting it in shell history.

```bash
python3 - <<'PY'
import datetime, getpass, hashlib, json, pathlib, urllib.request, uuid
base = input('Your Worker HTTPS URL: ').strip().rstrip('/')
if not base.startswith('https://'):
    raise SystemExit('Use your deployed HTTPS URL.')
token = getpass.getpass('Upload token: ')
path = pathlib.Path(input('JPEG path: ').strip()).expanduser()
data = path.read_bytes()
if not 4 <= len(data) <= 1_000_000 or not data.startswith(b'\xff\xd8'):
    raise SystemExit('Choose a JPEG no larger than 1,000,000 bytes.')
photo_id = str(uuid.uuid4())
# File modification time is an estimate, not verified camera/EXIF capture time.
timestamp = datetime.datetime.fromtimestamp(
    path.stat().st_mtime, datetime.timezone.utc
).isoformat().replace('+00:00', 'Z')
request = urllib.request.Request(base + '/upload', data=data, method='POST', headers={
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'image/jpeg',
    'X-Photo-ID': photo_id,
    'X-Captured-At': timestamp,
})
with urllib.request.urlopen(request, timeout=60) as response:
    receipt = json.load(response)
if (receipt.get('stored') is not True or receipt.get('id') != photo_id
        or receipt.get('sha256') != hashlib.sha256(data).hexdigest()):
    raise SystemExit('Storage receipt did not match. Keep the original.')
print('Verified upload:', photo_id)
PY
```

Refresh the gallery to see the upload. Keep the original even after success. If an upload times out, check whether it arrived before rerunning this example: each run generates a new ID and may create a duplicate. An automated retry must reuse the same ID, timestamp, and bytes.

## Members and sharing

Create an invitation using the admin interface, then have the intended member sign up. In the documented version, new uploads are private to the admin until explicitly shared. Members see shared items; anonymous visitors cannot access media. Use the admin member controls to disable access and revoke unused invitations when needed.

## Limits and troubleshooting

The documented commit sets these application limits:

| Guard | Limit |
| --- | ---: |
| Reserved media storage | 800 MB |
| Stored objects | 40,000 |
| Individual upload | 1 MB |
| Daily storage writes | 2,000 |
| Daily media reads | 10,000 |
| Daily estimated storage transfer | 60 MB |
| Gallery/auth API requests in gallery mode | 1,000/day |

Daily counters reset by UTC date. Transfer accounting includes uploads, downloads, and request overhead; the gallery itself consumes resources while viewing media. Failed operations may retain reservations intentionally.

- **401:** check sign-in, disabled-member status, or the upload token.
- **429 / daily transfer budget:** wait for the next UTC day. Reloading does not reset usage. Check provider allowances before increasing limits.
- **429 / daily game safety limit:** the published commit still applies its historical API quota to gallery requests; the later fix is not in this revision.
- **507:** storage or object capacity was reached. Back up data and manage it deliberately.
- **503 / not configured:** verify secrets, setup flag, project availability, and private bucket configuration.

## Capture features and consent

The repository also contains experimental native capture and live-streaming code. This walkthrough does not install or launch those clients. Historical clients may start capture automatically and hide application controls; they are not a suitable default for a shared-computer installation.

A consent-based client should require explicit local opt-in, show persistent capture status and a Stop control, and use normal macOS camera, microphone, and screen-recording permissions. Keep system recording indicators visible. Obtain permission from everyone whose private activity or voice would be captured.

## Stop or remove your deployment

Stop any uploading clients first. To remove your own Worker, run the following from its configured `cloudflare/` directory and verify the name in the confirmation prompt:

```bash
npx wrangler delete
```

Removing the Worker is not a complete media-erasure operation. Manage Supabase bucket contents separately through your own project, and back up needed metadata before deleting Cloudflare resources. Deleting the website does not uninstall native clients.
