# Build your own private photo website

This guide takes you from **“I have never made a website”** to **“I can sign in and upload a photo to my own website.”** Follow the steps in order. You do not need to write the code yourself: the complete website and server are in the [`starter`](starter/) folder.

You will get:

- Your own website address ending in `workers.dev`.
- A sign-in page with a name, colors, and welcome message you can change.
- A button to choose and upload photos from your device.
- A private library for each account: Alice sees Alice’s photos, Bob sees Bob’s.

This beginner starter is a **new, simpler gallery**, not the old Sclshi capture app. It does not automatically take photos, record sound, share screens, create a public album, or give all members access to the same photos. It accepts JPEG, PNG, and WebP images up to 1 MB each. It does not include video, bulk downloads, or website deletion controls.

**The original hosted Photo Stream website was deleted. These instructions create a new website in your own accounts.** The old implementation is documented separately in [the historical guide](docs/legacy-gallery.md).

## The two services, in plain English

Think of your website as a small photo shop:

| Piece | Its job |
| --- | --- |
| **Cloudflare** | Opens the shop on the internet and runs the server code. |
| **Supabase Authentication** | Checks who is signing in. |
| **Supabase Storage** | Holds the photos in a locked cupboard. |
| **Storage policies** | Decide which person may open which drawer. |
| **HTML** | The words and structure visitors see. |
| **CSS** | The colors, spacing, and appearance. |
| **JavaScript** | Makes the buttons work. |

When you sign in, Cloudflare asks Supabase to check your email and password. When you upload, Cloudflare sends the image to your own user-ID folder in Supabase. Both the server and Supabase’s storage policies restrict reads to that folder.

You do **not** need to buy a domain, rent a traditional server, set up DNS, install the old Mac app, or turn on a camera.

## Before you begin

Have these ready:

1. A computer with an internet connection. The commands below work in macOS Terminal or Windows PowerShell.
2. An email address you can check.
3. A password manager or another secure place for your passwords.
4. A small test photo you are allowed to upload. Use JPEG, PNG, or WebP, under **1,000,000 bytes**. A small screenshot saved as PNG works.

Start with the free plans if they meet your needs. Free plans have limits; this guide does not promise unlimited storage, traffic, or availability. Do not enable a paid upgrade just to make an error disappear. Check [Supabase pricing](https://supabase.com/pricing) and [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/) before making billing decisions.

### How to read the instructions

- A **browser** is Chrome, Safari, Edge, or Firefox.
- A **terminal** is the app where you type commands.
- A **folder** holds files on your computer.
- **Deploy** means send your website files to Cloudflare so people can visit it.
- Copy only the text **inside** a command box. Do not copy the surrounding backticks.
- Run one command at a time. Wait until you can type again before running the next one.
- If a command fails, stop at that step and use the troubleshooting table near the bottom.
- Dashboard labels occasionally change. The linked official documentation can help if a button has moved.

## Step 1 — Create your Supabase account and project

1. Open [supabase.com/dashboard](https://supabase.com/dashboard) in your browser.
2. Sign up or sign in. Complete any email verification it requests.
3. Create an organization if you do not have one. An organization is just the container for your projects. A name such as **My Projects** is fine.
4. Select the free plan if that is your intended plan.
5. Click **New project**.
6. Pick your organization.
7. Give the project a name, such as **My Photo Garden**. This is a label in Supabase, not your website address.
8. Generate a strong **database password** and save it. This password is **not** the password you will use to sign in to your photo website.
9. Choose a region near you.
10. Create the project and wait for it to finish starting.

**Checkpoint:** you can open the project dashboard and see sections such as Authentication, Storage, and SQL Editor. Use a new project for this tutorial so existing access policies cannot accidentally give other people access.

## Step 2 — Create the private photo bucket

A bucket is a storage folder managed by Supabase.

1. In your new Supabase project, open **Storage**.
2. Choose **New bucket** or **Create bucket**.
3. Name it exactly:

   ```text
   gallery
   ```

4. Keep **Public bucket** turned **OFF**.
5. Set its file-size limit to **1 MB**. If the screen expects bytes, enter `1000000`.
6. Restrict allowed MIME types to these three values. A MIME type is the computer’s name for a kind of file:

   ```text
   image/jpeg,image/png,image/webp
   ```

   If the screen uses separate entries, add each value separately. If restrictions are not shown during creation, open the bucket’s settings after creating it and set them there.
7. Save/create the bucket.

**Checkpoint:** Storage shows a bucket called `gallery`, and it is **private**. Leave it empty for now; upload the first photo through the website later, so it lands in the correct user folder.

Official reference: [Creating buckets and setting restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets).

## Step 3 — Add the two rules that keep photos private

Without access rules, Supabase rejects uploads. These rules allow a signed-in person to upload and read only inside their own folder.

1. Open this repository’s [`starter/storage-policies.sql`](starter/storage-policies.sql).
2. Click **Raw** to see plain text, then copy the whole file.
3. Return to your Supabase project.
4. Open **SQL Editor** and create a **New query**.
5. Paste the copied SQL. Do not paste Markdown backticks.
6. Click **Run**.

**Checkpoint:** the query finishes successfully. A message such as **Success. No rows returned** is normal; you created rules, not a list of photos.

You can inspect the resulting rules in Storage’s policy view. Their names are `gallery_read_own` and `gallery_upload_own`. They apply to the `authenticated` role and check that the first folder is the signed-in user’s ID. Do not replace that condition with `true` or add an “allow everyone” policy.

The SQL can be run again: it replaces only these two named policies. It does not erase photos. Other policies may still grant access, which is why this tutorial starts with a new project.

Official reference: [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## Step 4 — Create your website sign-in

Your Supabase dashboard account and your photo website account are separate.

1. In the project, open **Authentication**.
2. Find the sign-up settings, usually under **Sign In / Providers** or **Settings**.
3. Disable **Allow new users to sign up**. Keep the **Email** sign-in provider enabled. You will create approved accounts yourself in the dashboard.
4. Open **Authentication → Users**.
5. Choose **Add user → Create new user**. Use Create rather than an email invitation for this first account.
6. Enter an email address you control and a strong password. Save them as your **gallery sign-in**.
7. Enable **Auto Confirm User** if that option is shown. This is appropriate because you are manually creating your own verified account. If your screen instead sends a confirmation email, complete it before continuing.
8. Create the user.

**Checkpoint:** your email appears in Authentication’s Users list and is confirmed.

There is no `admin` username or shared default password in this starter. You sign in with this email and password. No custom email delivery setup is needed for a manually created, confirmed user.

## Step 5 — Find the two Supabase connection values

Cloudflare needs to know which Supabase project to talk to.

| Value | Where to look | What it resembles |
| --- | --- | --- |
| **Project URL** | Project’s **Connect** dialog, or **Settings → Data API / API** | `https://abcdefgh.supabase.co` |
| **Publishable key** | **Settings → API Keys** | Starts with `sb_publishable_` |

1. Copy your Project URL into a temporary note. It must be the project’s API URL, **not** a `supabase.com/dashboard/...` browser address.
2. Copy a **publishable** key from the same project.
3. Keep them available for the setup steps below.

**Do not choose a key beginning with `sb_secret_`, and do not use `service_role`.** Those keys have powerful server privileges. This starter deliberately uses the less-powerful publishable key plus each signed-in user’s access token, so Supabase’s privacy rules still apply. If you only see legacy keys, look for the publishable/secret-key tab and create a publishable key.

The publishable key is a project identifier intended for app use; it is not your database password or your website password. The code rejects secret keys to help prevent a dangerous copy-and-paste mistake. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

## Step 6 — Create your Cloudflare account

1. Open [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. Create an account, or sign in to your existing account.
3. Verify your email if requested.
4. Open **Workers & Pages**, sometimes grouped under **Compute** or **Compute & AI**.
5. If prompted to choose a Workers subdomain, choose an available name.

You do not need to add a domain or change nameservers. You do not need to create a Worker manually in the browser. The deployment command below creates it for you.

**Checkpoint:** you can access Workers & Pages in your own Cloudflare account. See [Cloudflare’s CLI setup guide](https://developers.cloudflare.com/workers/get-started/guide/) if account onboarding looks different.

## Step 7 — Install Node.js and download the code

### Install Node.js

1. Visit [nodejs.org/en/download](https://nodejs.org/en/download).
2. Install a currently supported LTS version **22 or newer** using the installer for your computer.
3. Open a new terminal window after installation:
   - **Mac:** press Command–Space, type **Terminal**, and press Enter.
   - **Windows:** open Start, type **PowerShell**, and open it.
4. Run:

   ```bash
   node --version
   npm --version
   ```

**Checkpoint:** both commands print a version. The Node version must start with `v22` or a larger major number. If Windows blocks `npm.ps1`, use `npm.cmd` in place of `npm` and `npx.cmd` in place of `npx` throughout this guide; you do not need to change your system execution policy.

### Download this repository

1. Open [this repository on GitHub](https://github.com/GRose18/mac-photo-stream).
2. Make sure the branch selector says **main**.
3. Click the green **Code** button, then **Download ZIP**.
4. Extract the ZIP. Do not edit files while they are still inside the ZIP.
5. Open the extracted folder, usually called `mac-photo-stream-main`.
6. Open its **starter** folder.

The repository contains older code too. For this tutorial, **use only the `starter` folder**. It is self-contained and can be copied into its own folder or repository.

### Open a terminal in `starter`

- **Mac:** type `cd ` (including the space), drag the `starter` folder from Finder into Terminal, then press Enter. Finder inserts the full path for you.
- **Windows:** right-click inside `starter` in File Explorer and choose **Open in Terminal**, or use `cd "C:\your\actual\path\starter"` with your real path.

Run:

```bash
node -p "require('./package.json').name"
```

**Checkpoint:** the result is `my-private-photo-gallery`. If you see a different project name or “Cannot find module,” you are in the wrong folder.

Now install the project’s tools:

```bash
npm ci
```

Wait for it to finish. This downloads the versions recorded in the lockfile. Do not run `npm audit fix --force` as a setup step; it may replace those versions with incompatible ones.

## Step 8 — Tell the code which project belongs to you

From the same `starter` terminal, run:

```bash
npm run setup
```

The helper asks two questions:

1. **Website address name:** enter a lowercase name with letters, numbers, and hyphens, such as `mia-photo-garden`. No spaces. This becomes the first part of your Cloudflare address.
2. **Supabase Project URL:** paste the URL from Step 5, such as `https://abcdefgh.supabase.co`.

The helper saves your answers into `wrangler.jsonc`. It leaves the bucket name as `gallery` to match Steps 2 and 3. It never asks for a password.

**Checkpoint:** it prints **Saved**. If it rejects a value, run it again with the corrected value.

If you prefer editing the configuration yourself, the important part looks like this:

```json
{
  "name": "mia-photo-garden",
  "vars": {
    "SUPABASE_URL": "https://YOUR_REAL_PROJECT_ID.supabase.co",
    "SUPABASE_BUCKET": "gallery"
  }
}
```

This is an **excerpt**, not the whole file. Do not replace the full `wrangler.jsonc` with it; keep the `main`, `assets`, and other settings already provided.

## Step 9 — Check the code before publishing

Run these commands one at a time from `starter`:

```bash
npm test
npm run build
```

**Checkpoint:** tests pass and the build finishes. `npm run build` is a dry run: it does not publish a website. These checks do not prove your real Supabase settings are correct; you will verify those with an actual upload in Step 12.

## Step 10 — Put the website on Cloudflare

First, connect the command-line tool to your account:

```bash
npx wrangler login
```

A browser window opens. Check that you are signing into **your own Cloudflare account**, approve the login, and return to the terminal. If it prints a login link instead, open that link in your browser.

Now publish:

```bash
npm run deploy
```

If Cloudflare asks you to choose an account or a Workers subdomain, select your own account and an available subdomain. No custom domain is needed.

**Checkpoint:** the terminal prints a website address resembling:

```text
https://mia-photo-garden.your-subdomain.workers.dev
```

Copy the **actual address from your terminal** into your browser. The sign-in page should appear. Signing in will not work until you add the key in the next step; that is expected.

## Step 11 — Connect Cloudflare to Supabase

Run:

```bash
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
```

When asked for the value, paste the **publishable key** from Step 5 and press Enter. Do not include quotation marks or spaces. The input may be hidden while you type; that is normal.

Cloudflare calls this storage area “secrets.” We use it to avoid hard-coding the key in source files, even though a publishable key is not a privileged secret. Do not paste your database password, gallery password, or a secret/service-role key here.

Then run:

```bash
npm run deploy
```

The connection now consists of three matching pieces:

| In your Worker | Must match |
| --- | --- |
| `SUPABASE_URL` | The URL of the Supabase project you created |
| `SUPABASE_PUBLISHABLE_KEY` | A publishable key from that same project |
| `SUPABASE_BUCKET` | The bucket named `gallery` in that project |

**Checkpoint:** refresh your website and sign in with the email/password from Step 4. You should see **Your photos** and the file picker.

The HTML does not need a Supabase URL or key pasted into it. The browser calls the `/api/...` routes on your website, and the server code handles the Supabase connection.

## Step 12 — Upload your first photo and check privacy

1. Sign in to your website.
2. Click **Choose a photo from your device**.
3. Select your test JPEG, PNG, or WebP under 1 MB.
4. Click **Upload this photo**.
5. Wait for **Photo uploaded**. Your photo should appear.
6. In Supabase, open **Storage → gallery**. You should see a folder with a long user ID. Inside it is the uploaded image with a generated filename.
7. Click **Sign out** on your website. Your photos should disappear from the page.
8. Sign in again. They should return.

The date displayed below a photo is its **upload date**, not necessarily the date it was taken. The grid sorts by generated filename, not capture date.

For a useful privacy check, create a second confirmed user through Authentication → Users. Sign in as that second user in a separate browser/private window. Their library should be empty and should contain only their own uploads. If it shows the first user’s photos, stop using the gallery and inspect your storage policies.

**Checkpoint:** upload works, photos survive a new sign-in, and separate accounts have separate libraries. Keep the original files backed up on your own device.

## Step 13 — Make the website look like yours

Install a plain-text code editor such as [Visual Studio Code](https://code.visualstudio.com/) if you do not already have one. Open the `starter` folder in it. Avoid Word or a rich-text editor for code.

### Change the name and welcome message

Open [`starter/public/index.html`](starter/public/index.html). Find the comments beginning with `PERSONALIZE`. For example:

```html
<title>Mia's Photo Garden</title>
```

The title controls the browser tab. Change the visible heading separately:

```html
<h1>Mia's Photo Garden</h1>
<p>Our camping trips, birthday cakes, and ordinary happy days.</p>
```

You can also change the small text above the heading and the footer sentence. Keep the HTML tags, quotes, and element `id` values intact. The IDs connect the page to its buttons and server calls.

### Change the colors

Open [`starter/public/style.css`](starter/public/style.css). The first block contains the main colors:

```css
:root {
  --background: #f6f3ed;
  --surface: #ffffff;
  --text: #26392f;
  --accent: #31694a;
  --button-text: #ffffff;
  --corner: 18px;
}
```

Keep the existing block’s other lines; edit just the values. Here are three ready-made palettes:

| Style | Background | Surface | Text | Accent | Button text |
| --- | --- | --- | --- | --- | --- |
| Garden | `#f6f3ed` | `#ffffff` | `#26392f` | `#31694a` | `#ffffff` |
| Ocean | `#eef5fc` | `#ffffff` | `#17324d` | `#175e91` | `#ffffff` |
| Berry | `#fff1f5` | `#ffffff` | `#4a1930` | `#922d56` | `#ffffff` |

`--corner` controls how round the cards look. Try `0px` for square corners or `24px` for rounder ones. Keep enough contrast so words remain easy to read.

### Add your own logo

1. Put a small PNG logo in `starter/public/` and name it `logo.png`.
2. In `index.html`, put this just above the `<h1>` line:

   ```html
   <img src="/logo.png" alt="Mia's Photo Garden logo" width="80" height="80">
   ```

Files in `public/` are public. Logos are fine there; **do not put private photos, passwords, or configuration secrets in that folder**. Personal photos belong in private Supabase Storage through the upload button.

### Show more columns on a wide screen

In `style.css`, find:

```css
grid-template-columns: repeat(3, minmax(0, 1fr));
```

Change `3` to `2` for two columns or `4` for four. The existing mobile rule still uses one column on small screens.

### Publish your changes

Save your files, return to the terminal in `starter`, and run:

```bash
npm run build
npm run deploy
```

Refresh your website. If the old design remains, try a hard refresh: Command–Shift–R on Mac or Ctrl–Shift–R on Windows.

**Checkpoint:** your live website has your chosen title and colors. Editing HTML alone does not change the website address. Keep the configured Worker name after launch unless you deliberately want a separate deployment.

## Where the complete website and server code live

You can copy the entire `starter` folder into your own project. Keep its structure intact:

```text
starter/
  public/
    index.html             Page layout and words
    style.css              Colors and appearance
    app.js                 Sign-in, upload, and photo-loading buttons
    _headers               Browser security settings
  worker.mjs               Server: verifies users and calls Supabase
  storage-policies.sql     Database access rules to paste into Supabase
  setup.mjs                Interactive project configuration helper
  wrangler.jsonc           Cloudflare deployment settings
  package.json             Commands and pinned tool versions
  package-lock.json        Exact dependency versions for npm ci
  test/                    Server checks
```

Full source links: [HTML](starter/public/index.html), [CSS](starter/public/style.css), [browser JavaScript](starter/public/app.js), [server JavaScript](starter/worker.mjs), [storage policies](starter/storage-policies.sql), [Cloudflare config](starter/wrangler.jsonc).

The server does four main jobs:

| Route | Job |
| --- | --- |
| `POST /api/login` | Checks an email/password with Supabase and returns a temporary user token. |
| `GET /api/photos` | Lists one page of that user’s photo filenames. |
| `POST /api/photos` | Accepts a selected image and saves it in that user’s folder. |
| `GET /api/photos/FILE` | Fetches one photo from that user’s folder. |

`public/app.js` calls these routes. `worker.mjs` verifies the token with Supabase before any photo operation. The SQL rules also enforce folder ownership at the storage service, including requests made outside this website.

## Add another person

Create a confirmed user in Supabase as in Step 4, and provide their credentials securely. Send them your actual Cloudflare website URL. Their library starts empty. Giving someone an account **does not share your photos with them**.

This starter has no public registration page or password-reset email flow. Account management happens in your Supabase dashboard. Do not give other gallery users your Supabase or Cloudflare dashboard credentials.

Sessions are kept only in the page’s memory. Refreshing, closing the tab, or token expiration requires signing in again. **Sign out** clears this page’s session and displayed images; it does not revoke an already copied access token. Removing a user also should not be assumed to instantly invalidate all previously issued JWTs. Use Supabase’s session controls and account policies if you need stronger session-revocation requirements.

## Troubleshooting: find the symptom, then follow the fix

| What you see | What to do |
| --- | --- |
| `node` or `npm` not found | Install Node.js 22+ and open a new terminal. |
| PowerShell says `npm.ps1` cannot run | Use `npm.cmd` / `npx.cmd` instead of `npm` / `npx`. |
| `package.json` not found | Open the terminal in `starter`, not the repository root or the ZIP. |
| Setup rejects your Supabase URL | Copy the Project URL, not the dashboard URL. It looks like `https://PROJECT_ID.supabase.co`. |
| Cloudflare login opens the wrong account | Sign into your intended account in the browser, then repeat `npx wrangler login`. |
| “Finish setup” on sign-in | Check `wrangler.jsonc` and add `SUPABASE_PUBLISHABLE_KEY` using Step 11. Then deploy again. |
| “Use a Supabase publishable key” | Use the key beginning `sb_publishable_`. Replace the Worker setting with `npx wrangler secret put SUPABASE_PUBLISHABLE_KEY`. |
| “Could not sign in” | Use the gallery user’s email/password, not the database password. Check that the user is confirmed and Email sign-in is enabled. |
| “Your session ended” | Sign in again. Tokens expire and this simple starter does not refresh them automatically. |
| “Storage access denied” / policy error | Check bucket name `gallery` and run the exact SQL from Step 3 in the matching project. Do not make the bucket public. |
| “Storage request failed” | Check that your project is active, the bucket exists, policies succeeded, and your provider usage is below its limits. |
| “File or form is too large” | Resize/export the image below 1,000,000 bytes. Changing the filename does not shrink it. |
| HEIC or unsupported image | Export as JPEG, PNG, or WebP first. On Mac, Preview → File → Export can convert supported images. |
| Uploaded, but not visible | Use Refresh photos and Load more. Verify the user-ID folder in Storage. Files placed manually at the bucket root are not listed. |
| Uploaded successfully, but refresh failed | Do not upload it repeatedly. Fix the read/policy issue and refresh first to avoid duplicates. |
| Too many sign-in attempts / 429 | Wait and check Supabase’s authentication rate limits and project usage. |
| Personalization did not appear | Save files, run `npm run deploy` from `starter`, and hard-refresh the correct URL. |
| Clicking the HTML file on your computer does not sign in | Open the deployed `https://...workers.dev` URL. A local `file://` page has no Worker API. |

If you ask for help, include the step number and the exact error message. Never include passwords, access tokens, or secret/service-role keys in screenshots or GitHub issues.

## Storage, costs, backups, and removal

The starter enforces a **1 MB per-image upload limit**. It does **not** implement the historical app’s 60 MB daily transfer counter, total storage budget, or billing cap. Viewing photos uses bandwidth too. Check usage in both provider dashboards, keep sign-ups disabled, and review limits before inviting more people.

To remove a photo, use **Supabase → Storage → gallery → the user folder**, select the correct file, and delete it deliberately. This is permanent unless you have a backup. The website does not expose delete or overwrite operations.

To remove your website, run this from your configured `starter` folder:

```bash
npx wrangler delete
```

Read the Worker name in the confirmation prompt before confirming. Deleting the Worker does **not** delete the Supabase bucket or users. Manage those separately in your project. Keep independent copies of important photos before deleting anything.

## What is verified, and what you must check yourself

The included automated tests exercise the server with a simulated Supabase service. A build check verifies that Cloudflare can bundle the starter. They do not log into your account, execute SQL on your project, or verify your live storage policies.

**You finish verification in Step 12:** sign in, upload, sign out, sign in again, and check a second account. Do that before relying on the website for private photos.
