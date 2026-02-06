# Strata

A hierarchical note-taking and knowledge management application with Google Drive integration, built with React and Vite.

## Features

- **Nested Notebooks/Tabs/Pages** - Organize content in a flexible tree structure
- **Rich Content Blocks** - Headings, lists, todos, images, videos, links, and dividers via slash commands
- **Google Drive Integration** - Embed Google Docs, Sheets, Slides, Drawings, and Forms directly in pages
- **Interactive Maps** - Embed Leaflet maps with markers and configuration
- **Mermaid Diagrams** - Create flowcharts, sequence diagrams, and more
- **Canvas Pages** - Freeform layout pages
- **Table/Database Pages** - Structured data views
- **Dark Mode** - Full light/dark theme support
- **Offline Support** - Local storage with offline viewing capabilities

## Tech Stack

- **React** 19.1.0
- **Vite** 7.2.4
- **Tailwind CSS** 4.1.18
- **Leaflet** - Interactive maps
- **Mermaid** - Diagram rendering
- **Google Drive API** - Cloud storage and file embedding

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- npm (included with Node.js)
- A Google Cloud project with Drive API enabled (see [SETUP.md](SETUP.md))

## Quick Start

1. **Clone the repository**

   ```bash
   git clone <your-repo-url>
   cd Strata-vite
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your Google API credentials. See [SETUP.md](SETUP.md) for detailed instructions on obtaining these credentials.

4. **Start the development server**

   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:5175`.

5. **Build for production**

   ```bash
   npm run build
   ```

## Security

This project uses [git-secrets](https://github.com/awslabs/git-secrets) to prevent accidental commits of API keys and other sensitive data. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions.

**Important:** Never commit `.env` files containing real credentials. The `.env` file is excluded from version control via `.gitignore`. Use `.env.example` as a template.

## Project Structure

```
Strata-vite/
├── public/                  # Static assets
├── src/
│   ├── components/
│   │   ├── blocks/          # Content block components
│   │   ├── embeds/          # Google Drive embed components
│   │   ├── icons/           # Icon components
│   │   ├── pages/           # Page type components (canvas, table, map, mermaid)
│   │   └── ui/              # Shared UI components
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utilities and configuration
│   │   ├── config.js        # Environment variable configuration
│   │   ├── constants.js     # App constants and definitions
│   │   ├── google-api.js    # Google Drive API integration
│   │   ├── tree-operations.js  # Tree data structure operations
│   │   └── utils.js         # General utilities
│   ├── App.jsx              # Main application component
│   ├── main.jsx             # Entry point
│   └── index.css            # Global styles
├── .env.example             # Environment variable template
├── .git-secrets-patterns    # Custom patterns for git-secrets
├── CONTRIBUTING.md          # Contribution and security guidelines
├── SETUP.md                 # Detailed environment setup guide
├── package.json
└── vite.config.js
```

## License

Copyright 2026 Christopher Moore

Licensed under the Apache License, Version 2.0. See individual source files for the full license text.
