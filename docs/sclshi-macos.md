# Sclshi + your beginner photo website

This is the Mac app guide for the **new beginner `starter/` website** in this repository. Follow the [main README](../README.md) to create your website, then follow this page to connect Sclshi to it.

You will finish with this:

```text
Choose a photo in Sclshi on your Mac
                 ↓
Your own Cloudflare website receives it
                 ↓
Your own private Supabase bucket stores it
                 ↓
Sign in to your website to see the same photo
```

The complete app source is in [`starter/macos`](../starter/macos/). This starter-compatible Sclshi has a normal window and Dock icon. You enter your own website address, sign in, and choose which photo to upload. It uses the same account and private library as the website.

**Use this app version for the beginner starter.** The historical Sclshi binary uses a different upload protocol. Merely entering the starter URL into that old binary will not work. You do not need the historical backend, an upload token, the visible-menu preparation helper, or an old branch for this guide.

This version uploads existing photos you select. It does not automatically take camera photos, watch folders, record a microphone, share a screen, or start at login. It accepts JPEG, PNG, and WebP images up to 1,000,000 bytes each, matching the website.

## 1. Finish your website first

Complete Steps 1–12 of the [main README](../README.md). Before building the app, check that you can:

1. Open your own `https://...workers.dev` website.
2. Sign in using the user you created in **Supabase → Authentication → Users**.
3. Upload a small image using the website.
4. Sign out and sign in again, and still see that image.

Save these three things for the app:

| App field | What to enter |
| --- | --- |
| Website address | Your own Cloudflare website's HTTPS base address. |
| Gallery email | The email you created in Supabase Authentication. |
| Gallery password | That user's password. |

Example website address:

```text
https://mia-photo-garden.my-account.workers.dev
```

Use your real address, not that example. **Do not use the Supabase project URL here.** Sclshi talks to your website; your website connects to Supabase.

You never put a Supabase secret, publishable key, database password, or Cloudflare token into the app. Those are not your gallery sign-in credentials.

**Checkpoint:** your website works by itself. If the browser cannot sign in or upload, fix that first using the README's troubleshooting table.

## 2. Check your Mac

You need macOS 13 or later on Intel or Apple silicon. Check **Apple menu → About This Mac**.

This app is macOS-only. People using Windows, phones, or tablets can upload through the website in their browser.

Open Terminal with Command–Space → type **Terminal** → Enter. Run:

```bash
xcode-select --install
```

Finish Apple's Command Line Tools installer. If the tools are already installed, that message is fine. Then run:

```bash
xcrun --find swiftc
/usr/bin/python3 --version
```

The first command finds Apple's Swift compiler. The second checks the Python included with the build tools; the build uses it to create the app's metadata. Both commands should print a path or version.

**Checkpoint:** both commands succeed. Node.js is needed to deploy the website, but the native app itself does not need Node.js running.

## 3. Open the right source folder

If you already downloaded this repository for the website, use that copy. It must contain:

```text
starter/macos/Sclshi.swift
starter/macos/build.sh
```

If those files are missing, download a fresh ZIP from the repository's **main** branch: [GitHub → Code → Download ZIP](https://github.com/GRose18/mac-photo-stream). Extract it first. Do not use `codex/durable-photo-storage` for this app.

In Terminal:

1. Type `cd `, including the space.
2. Drag the extracted **starter/macos** folder from Finder into Terminal.
3. Press Enter.
4. Run:

   ```bash
   ls
   ```

**Checkpoint:** the output includes `Sclshi.swift` and `build.sh`.

## 4. Build Sclshi

Run from `starter/macos`:

```bash
bash build.sh
```

Wait for it to finish. The first build may take several minutes. It compiles an app that supports both Intel and Apple silicon, assembles it, and checks its ad-hoc signature.

**Checkpoint:** it prints a line beginning **Built app:**. The new files are:

```text
starter/macos/build/Sclshi.app
starter/macos/build/Sclshi.zip
```

The script does not install or launch the app, upload photos, or contact your gallery.

If you see a compiler or SDK error, the build did not succeed. Check your Apple Command Line Tools installation. If you deliberately use a different compatible SDK, `SCLSHI_SDK` can select its absolute path; most readers should leave it unset.

## 5. Personalize the app's name

The default display name is **Sclshi**. To call it something of your own, rebuild with a display name:

```bash
SCLSHI_APP_NAME="Mia's Photo Garden" bash build.sh
```

This changes the app's window title, heading, application-menu Quit label, and bundle display name. The output folder remains `build/Sclshi.app` so the instructions and scripts still have a predictable path. Finder may show the bundle filename; after installation you can rename the `.app` in Finder if you wish.

The website's name and colors are separate. Change those in `starter/public/index.html` and `starter/public/style.css` as explained in the README, then deploy the website again.

**Your website address is entered in the app at runtime.** You do not need to edit Swift code or rebuild the app just to connect it to a different website.

## 6. Install it on your computer

1. Stop any older Sclshi app first. If necessary, open **Activity Monitor**, search for Sclshi, and quit the old process. Remove an old capture app from Login Items if you no longer want it opening.
2. In Finder, open `starter/macos/build`.
3. Open a second Finder window. Choose **Go → Go to Folder** and enter `~/Applications`.
4. If that folder does not exist, create an **Applications** folder inside your home folder.
5. Drag `Sclshi.app` from `build` into that Applications folder. If you want to retain the build output, copy/paste it instead.
6. If an app with the same name already exists, keep a backup or give the new one a distinct name instead of blindly replacing the old app.
7. Open the installed app.

This is a source-built, ad-hoc signed app, not a notarized App Store download. If macOS blocks it, inspect the app's source and the system message, then use normal **Privacy & Security → Open Anyway** approval only if you trust what you built. Do not disable Gatekeeper. Organizations may have policies that prevent unnotarized apps from opening.

**Checkpoint:** a normal window appears with Website address, Gallery email, Gallery password, and Sign in. There is a Dock icon. This version does not rely on a hidden menu-bar widget.

## 7. Connect the app to your own website

In the app:

1. Enter your website's full HTTPS base address, for example:

   ```text
   https://mia-photo-garden.my-account.workers.dev
   ```

2. Do not append `/api/login`, `/api/photos`, `/upload`, or a sign-in page path.
3. Enter your gallery user's email.
4. Enter that user's password.
5. Click **Sign in**.

Only enter an address you control and trust: the app sends your sign-in credentials to that website. The address is locked while signed in, so an upload cannot accidentally be sent to a different site by editing the field.

**Checkpoint:** the app says **Signed in** and enables **Choose and upload a photo…**.

The app remembers the website address on this Mac. It does not save your password or session token to disk. Closing it or expiration of the Supabase access token requires signing in again.

To switch websites, click **Sign out**, enter the other website's address, then sign in using an account belonging to that site. No rebuild is required.

## 8. Upload a photo from Sclshi

1. Click **Choose and upload a photo…**.
2. Select one JPEG, PNG, or WebP on your computer. It must be no larger than 1,000,000 bytes.
3. Click **Upload this photo** in the file chooser. That button confirms the upload; cancelling uploads nothing.
4. Wait for the app's **Uploaded [filename]** message.
5. Click **Open my website**.
6. Sign in on the website with the **same account** you used in the app. Browser and app sessions are separate.
7. Click **Refresh photos**. Use **Load more** if needed; the starter sorts by generated filename, not newest first.

**Checkpoint:** the app's photo appears in the browser gallery. In Supabase Storage, it appears under that user's ID folder inside `gallery`.

The app copies the image to the server; it does not remove the original. Keep your original backup. If an upload times out, check the gallery before trying again: retrying creates a new upload and may duplicate a file that already arrived.

If your photo is HEIC, export it as JPEG first. On Mac, open it in Preview and use **File → Export**. Adjust quality or image dimensions until it is below 1 MB. Renaming `.heic` to `.jpg` does not convert it.

## 9. Permissions and stopping

The app uses the standard file chooser. If macOS asks to access the selected folder, approve only if you want to upload that file. It does not need camera, microphone, screen-recording, or Full Disk Access permission.

To stop it, close its window or choose **Quit** from its application menu (Command–Q). Closing the last window quits the app and cancels outstanding network tasks. A file that already reached the server may still exist after cancellation; check the website before retrying.

**Sign out** clears the app's local session. Like the browser starter, it does not revoke an already copied access token. It does not affect another signed-in browser window.

Sclshi does not install a login item or background uploader. If you manually add it to Login Items, it still waits for you to sign in and select a file.

## 10. Help other people create their own version

To share the creation, send people:

- The [main setup README](../README.md) for their own Cloudflare and Supabase accounts.
- This app guide for building and naming Sclshi, entering their own website URL, and uploading their photos.
- The [`starter`](../starter/) folder, which includes both the website and native app source.

They should create their **own project, bucket, website, and sign-in**. Do not send them your dashboard passwords, personal app configuration, Supabase secret keys, or gallery password.

If you instead want someone to use your website, create a confirmed Supabase user for them in your project and give them your website address. Their user gets its own private library. Creating their account does not give them your photos.

`build/Sclshi.zip` contains the app, but the easiest reproducible route for developers is to share the source and let them build it. A binary you distribute is still ad-hoc signed; building an app is not the same as Developer ID signing and notarizing it for general distribution. A fresh install does not contain your website password or session.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| The old app has no normal window | Build and install **`starter/macos` from `main`**, not the historical app branch. |
| The website address is rejected | Use an HTTPS base URL without credentials, query strings, fragments, or API paths. |
| Sign-in fails | Use the same email/password that work in your beginner website. Confirm the user in Supabase Authentication. |
| App says the session ended | Sign in again; this starter does not automatically refresh tokens. |
| 404 or no sign-in token | The URL may be an old gallery, Supabase project URL, or unrelated site. Use your deployed beginner Worker. |
| Photo is too large | Export/resize below 1,000,000 bytes. |
| Storage access denied | Check the README's two Supabase policies and matching `gallery` bucket. |
| Upload works but gallery looks empty | Sign into the same user, refresh, and use Load more. Different users have different libraries. |
| Network timeout | Check the gallery before retrying to avoid duplicates, then check connection/project status. |
| Wrong site remembered | Sign out and change Website address. |
| Build fails | Check macOS version and Apple Command Line Tools; do not run a stale app assuming the build succeeded. |

## Uninstall

Quit the app, then move its `.app` bundle to the Trash. Remove any login item you added yourself. Your original files, website, and uploaded photos remain separate; uninstalling does not delete them. The saved website address is a local macOS preference, not a credential.

## For readers who want to edit the code

- [`Sclshi.swift`](../starter/macos/Sclshi.swift): app window, website validation, sign-in, file selection, and uploads.
- [`build.sh`](../starter/macos/build.sh): compilation, display-name setting, app metadata, signature check, and ZIP packaging.
- [`worker.mjs`](../starter/worker.mjs): the exact server API the native app and website both use.

The native app sends `POST /api/login` with email/password, then `POST /api/photos` with the selected image and the returned user's bearer token. The Worker verifies the user with Supabase and writes into that user's folder. No privileged Supabase credential is embedded in the app.

The app is compiled for Intel and Apple silicon before publication. Automated server tests cover authentication and upload isolation; `bash test.sh` in `starter/macos` checks the native client’s URLs, login/upload requests, bearer token, and expired-session handling using a simulated network. We do not capture or upload your personal photos to test a README. Verify your own account and deployment with the explicit upload in Section 8.
