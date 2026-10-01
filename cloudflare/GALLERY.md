# Avi G Gallery

The website is now a private photo gallery with a masonry photo grid, capture
timestamps, pagination, and an enlarged photo viewer. Packs, coins, rarity
labels, and trading are removed from the interface. GALLERY_ONLY=true disables
the retired game endpoints. Historical game records are preserved, not erased.

- Existing admin and member usernames/passwords still work.
- Admins see all camera uploads. Upload URL/token and the Mac app do not change.
- Members see shared photos only. New uploads are private by default.
- Photos previously approved as active cards remain shared. Admins can use
  Make private to remove them from member views, or Share with members for a
  private upload. Previously retired cards are not automatically shared.
- Admins can delete any photo explicitly, including former card photos. This
  permanently deletes that stored image; no automatic deletion is introduced.
- Invitations and member enable/disable controls remain available to admins.
- The same private Supabase bucket and fixed Cloudflare Durable Object persist
  photos and metadata through deployments. No data or bucket policy migration.
- Existing 800 MB storage and 60 MB/day photo transfer guards remain. Gallery mode
  caps authenticated API calls at 1,000 per UTC day and new shared-photo records
  at 500, in addition to the existing account-wide free-provider quotas. No paid
  plan, paid service, or automatic upgrade is enabled.

Node 22+ validation: npm test; npm run build; npm run test:runtime.
Deployment: npx wrangler deploy. Credentials and local photos stay out of Git.
