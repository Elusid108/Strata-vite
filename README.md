# 🗂️ Strata

**A highly flexible, privacy-first workspace that uses your personal Google Drive as its backend.** Strata is a block-based note-taking and productivity app designed for speed, organization, and absolute data ownership. Unlike traditional cloud apps that store your data on proprietary servers, Strata runs entirely in your browser and syncs directly to a hidden folder in your Google Drive. Zero tracking, zero middle-men—your data is your data.

Created by **Chris Moore Designs LLC**.

---

## ✨ Key Features

### 🏗️ Deep Organization
* **Hierarchy:** Structure your life using a nested system of **Notebooks > Tabs > Pages**.
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
* **Native Embeds:** Embed Google Docs, Sheets, Slides, Forms, Drawings, Videos, and PDFs directly into your notebooks.
* **Background Tabs:** Embedded pages remain alive in the background when navigating away, ensuring instant load times and preserved state (like switching Chrome tabs) when you return.
* **Drive File Blocks:** Link directly to Drive files within your block pages, displaying real-time file names, types, and open/remove controls.

### 🔒 Privacy & Performance
* **100% Client-Side:** No external databases. No analytics. No tracking cookies. 
* **Drive Sync Engine:** Your data is saved as lightweight `.json` files in your personal Google Drive. 
* **Smart Syncing:** Features granular "dirty page" tracking to ensure only modified content is uploaded, keeping syncs blazing fast.
* **Offline Fallback:** Cached local storage ensures you don't lose data if your connection drops.

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


The app will be available at `http://localhost:5173`.

---

## 🛠️ Tech Stack

* **Frontend:** React, Vite, Tailwind CSS
* **Icons:** Lucide React
* **Integrations:** Google Drive API v3, Google Picker API
* **Specialty Libraries:** * `leaflet` (Map Pages)
* `mermaid` (Diagram Pages)



---

## 📂 Architecture & Data Storage

Strata does not use a traditional database. When a user authenticates, the app creates a specialized `Strata Notebooks` folder in the root of their Google Drive.

* **Structure:** `strata_structure.json` and `strata_index.json` act as the manifest, tracking the order and metadata of Notebooks and Tabs.
* **Content:** Individual pages are saved as separate `.json` files within corresponding Drive folders.
* **Reconciliation:** The app automatically cleans up orphans and handles external Drive deletions gracefully to maintain state parity.

---

## 📝 License & Copyright

Copyright © 2026 Christopher Moore / Chris Moore Designs LLC.
All rights reserved.

*(See [LICENSE](https://www.google.com/search?q=LICENSE) file for specific usage terms if applicable).*

```

```