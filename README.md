# Uke Tabs

A phone app for playing ukulele from your own Google Drive.

- **Tuner**: Standard GCEA, Low G, D tuning and Baritone. Auto-detects the string, or tap one to lock it. Long-press a string to hear the note.
- **Find tabs**: type a song name and it searches your Drive (Google Docs, PDFs, text files and photos of tab sheets).
- **Song lists**: open a Google Doc (one song per line) or Sheet (first column, or a "Song"/"Title" column). Tap a song to pull up its tab.
- **Auto-scroll that follows you**: set a speed per song (remembered). Turn on **Listen** and scrolling waits until you start playing, pauses when you stop, and picks up again when you start. Tap the sheet to start/stop. Bluetooth page-turner pedals work too (arrow / page keys).
- Keeps the screen awake while you play, works offline for songs you've opened before (Docs), and installs to your home screen.

App: **https://garetharichards-jpg.github.io/uke-tabs/**

---

## One-time setup

### 1. Turn on the website (GitHub Pages)

1. In this repo go to **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and **Save**.
3. After a minute the app is live at `https://garetharichards-jpg.github.io/uke-tabs/`.

### 2. Let the app read your Google Drive

Google needs a "Client ID" for the app. It's free and takes about 5 minutes.

1. Go to <https://console.cloud.google.com/> and create a project (e.g. "Uke Tabs").
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **Google Auth Platform** (or **OAuth consent screen**) → **Get started**:
   - App name: Uke Tabs, support email: your email.
   - Audience: **External**.
   - Contact email: your email → Create.
4. **Audience → Test users → Add users** → add your own Gmail address.
5. **Data access → Add or remove scopes** → tick `.../auth/drive.readonly` (search "drive.readonly") → Update → Save.
6. **Clients → Create client**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: `https://garetharichards-jpg.github.io`
   - Create, then copy the **Client ID** (ends in `.apps.googleusercontent.com`).
7. Open the app on your phone → ⚙️ **Settings** → paste the Client ID → **Save** → **Connect Google Drive**.

Google will say *"Google hasn't verified this app"*. That's expected for a personal app: tap **Continue**. The app only asks for read-only access and talks directly from your phone to Google; nothing goes through any other server.

Optional: put the Client ID in `config.js` instead so you don't have to paste it on each device.

### 3. Put it on your home screen

- **iPhone (Safari)**: Share button → **Add to Home Screen**.
- **Android (Chrome)**: ⋮ menu → **Install app** (or Add to Home screen).

The first time you use the tuner or Listen, allow microphone access.

---

## Tips

- **Naming**: the search matches file names and the text inside Docs, so "Riptide" finds `Riptide - Vance Joy.pdf` or a Doc with Riptide in it.
- **Song lists**: numbering and bullets are ignored (`1. Riptide`, `- Riptide`). In a Sheet with an Artist column, the app searches "Title - Artist" and falls back to just the title.
- **Text size**: Docs auto-size so chord lines fit the screen without wrapping. Use A− / A+ to override (remembered per song). For PDFs and photos A+ zooms in.
- **Listen sensitivity**: it learns the room's background noise. In a noisy room, strum a bit firmer; the scroll keeps going for about 2 seconds after the last sound so short gaps don't stop it.
- Google sign-in lasts about an hour; after that the app shows a **Connect** button again (one tap, no password).

## Development

Plain HTML/CSS/JS, no build step. Run locally with any static server, e.g. `npx http-server .`, and run the tests with `node tests/run.js`.
Google sign-in only works from origins listed in your OAuth client (add `http://localhost:8080` there for local testing).
