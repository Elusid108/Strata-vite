# 🗂️ Strata

**A highly flexible, privacy-first workspace that uses your personal Google Drive as its backend.** Strata is a block-based note-taking and productivity app designed for speed, organization, and absolute data ownership. Unlike traditional cloud apps that store your data on proprietary servers, Strata runs entirely in your browser and syncs directly to a hidden folder in your Google Drive. Zero tracking, zero middle-men—your data is your data.

Created by **Chris Moore Designs LLC**.

---

## ✨ Key Features

### 🏗️ Deep Organization
* **Hierarchy:** Structure your life using a nested system of **Notebooks > Tabs > Pages**.
* **Creation Timestamps:** Pages now display their original creation timestamps for better organization.
* **Drag & Drop:** Fully sortable navigation. Rearrange your notebooks, tabs, pages, and favorites on the fly.
* **Customization:** Personalize your workspace with searchable custom icons and tab colors.
* **Persistent State:** Strata remembers exactly where you left off. Switching between notebooks instantly restores your last viewed tab and page.

### 📄 Powerful Page Types
* **Block Pages:** A Notion-style editor featuring text, headings, lists, interactive checkboxes, blockquotes, and image blocks.
* **Canvas Pages:** An infinite, hardware-accelerated whiteboard for spatial organization and mind-mapping. 
* **Code Pages:** Built-in HTML/CSS/JS sandbox. Write custom code and preview the live app directly within your notebook.
* **Table Pages:** Database-style grids for structured data tracking.
* **Mermaid Pages:** Generate complex flowcharts and diagrams using simple text syntax.
* **Map Pages:** Interactive geographic maps with custom pins, locked views, and spatial data tracking.

### 🔗 Deep Google Drive Integration
* **Unified Embed Engine:** Paste links to seamlessly embed Google Drive files (Docs, Sheets, Slides, Forms, etc.), PDFs, Lucidchart diagrams, Miro boards, and Draw.io canvases directly into your workspace. Pasted Google links pick up the file's real name as the page name whenever Drive lets Strata see the file (files Strata created or that you picked in the browser); otherwise you type one.
* **Drive browser built for big Drives:** Separate tabs for Recent, My files (only what you own), My Drive, Shared with me, Shared drives and Starred, all in list view with owner and last-modified columns. Pick several files at once to add them all as pages.
* **Native Embeds:** Embed Google Docs, Sheets, Slides, Forms, Drawings, Videos, and PDFs directly into your notebooks.
* **Background Tabs:** Embedded pages remain alive in the background when navigating away, ensuring instant load times and preserved state (like switching Chrome tabs) when you return.
* **Drive File Blocks:** Link directly to Drive files within your block pages, displaying real-time file names, types, and open/remove controls.

### ⚡ Performance & Persistence
* **Smart Background Loading:** Keeps your most recently used Google Sheets, Docs, and Web Boards active in the background for instant switching without reloads.
* **LRU Memory Management:** Automatically unmounts oldest background pages to save system memory (configurable in settings).

### 🔒 Privacy & Sync
* **100% Client-Side:** No external databases. No analytics. No tracking cookies. 
* **Drive Sync Engine:** Your data is saved as lightweight `.json` files in your personal Google Drive. 
* **Push + Pull:** Edits go out through a persisted outbox (survives reloads, retries with backoff). Changes made on other devices are pulled in via the Drive changes feed on focus, on reconnect, and every minute while the app is visible.
* **Conflict-safe:** Before writing, the app checks whether Drive changed since it last synced. Block pages merge block-by-block; other page types keep both versions (a "conflict copy" page) so nothing is silently overwritten.
* **Offline:** Works from the local copy while offline and shows "Offline · N pending"; queued changes upload when you reconnect. If the Google session expires, the app asks you to sign in again instead of retrying forever.
* **Never stuck:** Strata only asks Google for the `drive.file` scope, so it can't touch files it didn't create. If Drive refuses to delete a folder because it holds such a file, Strata trashes what it owns, leaves the folder in place and tells you. Any other change that keeps failing shows "Needs attention" in the sync footer with **Retry now** and **Skip this change** buttons. Settings → Google Account offers **Reconnect Google Drive** to re-authorize without losing local data.
* **Instant start:** The last synced workspace renders immediately; Drive is re-read in the background and only changed pages are downloaded.

### 📱 Desktop, Tablet, Phone
* **Responsive shell:** three panes on desktop, condensed rails on tablets, and a single-pane layout with a notebook drawer and back navigation on phones.
* **Touch-first controls:** actions are always visible on touch devices, and a "⋯" action sheet replaces drag-and-drop (rename, star, move up/down, move to another section or notebook, delete).
* **Pinch to zoom** on Canvas and Mermaid pages; Google Docs/Sheets/Slides open in preview mode on phones with an "Open in app" link.
* **Installable PWA:** add Strata to your home screen; the app shell is cached for fast starts (your notebooks stay in Drive and are never cached by the service worker).

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v16 or higher recommended)
* A Google Cloud Console project with the **Google Drive API** and **Google Picker API** enabled.

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/Elusid108/strata-vite.git](https://github.com/Elusid108/strata-vite.git)
   cd strata-vite

```

2. **Install dependencies:**
```bash
npm install

```


3. **Configure Environment Variables:**
Copy the example environment file and add your Google API credentials:
```bash
cp .env.example .env

```


Open `.env` and fill in your `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY`.
4. **Start the development server:**
```bash
npm run dev

```

5. **Run the tests** (sync merge, outbox, pull loop, tree operations):
```bash
npm test

```


The app will be available at `http://localhost:5173`.

---

## 🛠️ Tech Stack

* **Frontend:** React, Vite, Tailwind CSS
* **Icons:** Hand-rolled SVG icon set (`src/components/icons`)
* **Integrations:** Google Drive API v3, Google Picker API
* **Specialty Libraries:** * `leaflet` (Map Pages)
* `mermaid` (Diagram Pages)



---

## 📂 Architecture & Data Storage

Strata does not use a traditional database. When a user authenticates, the app creates a specialized `Strata Notebooks` folder in the root of their Google Drive.

* **Structure:** `strata_structure.json` and `strata_index.json` act as the manifest, tracking the order and metadata of Notebooks and Tabs.
* **Content:** Individual pages are saved as separate `.json` files within corresponding Drive folders.
* **Reconciliation:** Deletions are recorded as tombstones until Drive confirms them, and a changes-feed pull loop applies edits, moves and deletions made on other devices. See `src/lib/sync-*.js`.

---

## 📝 License & Copyright

Copyright © 2026 Christopher Moore / Chris Moore Designs LLC.
All rights reserved.

*(See [LICENSE](https://www.google.com/search?q=LICENSE) file for specific usage terms if applicable).*

```

```