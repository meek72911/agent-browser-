# VibeStudio

An AI-powered browser for developers, built with **Tauri** (Rust) and **SolidJS**. VibeStudio features a native multi-tab WebView2 engine with an integrated MCP (Model Context Protocol) server, allowing AI assistants to navigate, research, and interact with the web directly.

![VibeStudio](https://img.shields.io/badge/Tauri-2.10.3-blue?logo=tauri)
![Rust](https://img.shields.io/badge/Rust-1.77%2B-orange?logo=rust)
![SolidJS](https://img.shields.io/badge/SolidJS-1.9-blue?logo=solid)

## Features

- **Native Multi-Tab Browser** — Built on Tauri's multi-webview API with WebView2 for lightweight, chrome-less browsing
- **AI Integration via MCP** — Built-in MCP server (WebSocket) with 7 tools for AI-driven browsing:
  - `vibe_navigate` — Navigate to any URL
  - `vibe_get_url` — Get current page URL
  - `vibe_get_content` — Extract structured page content (text, headings, links, meta)
  - `vibe_click` — Click elements by selector
  - `vibe_research` — Multi-page research with content synthesis
  - `vibe_extract` — Extract specific data from pages
  - `vibe_screenshot` — Capture page screenshots
- **IDE Detection** — Auto-detects Cursor, Trae, Windsurf, VS Code, and OpenCode for one-click MCP connection
- **Ad & Tracker Blocking** — Cosmetic ad blocking with MutationObserver for dynamic content
- **Session Management** — Automatic session save/restore with a 10-tab safety limit
- **Modern UI** — Custom title bar, transparent window, settings, history, downloads, and find-in-page

## Architecture

```
vibestudio/
├── src/                     # Frontend (SolidJS + TailwindCSS)
│   ├── App.tsx              # Main app shell & tab management
│   └── components/          # UI components (TabBar, UrlBar, Settings, etc.)
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs           # Tauri commands, window setup, event listeners
│   │   ├── tab_manager.rs   # Multi-webview tab manager with content cache
│   │   ├── mcp_server.rs    # WebSocket MCP server (JSON-RPC 2.0)
│   │   └── bin/mcp_bridge.rs# Native Rust stdio-to-WebSocket MCP bridge
│   ├── Cargo.toml           # Rust dependencies
│   └── tauri.conf.json      # Tauri configuration
├── mcp-stdio-bridge.mjs     # Node.js MCP bridge (deprecated, native bridge preferred)
└── package.json             # Node.js dependencies
```

## Prerequisites

- [Rust](https://rustup.rs/) (1.77.2 or later)
- [Node.js](https://nodejs.org/) (for frontend build)
- Windows with WebView2 Runtime (v147+ confirmed working)
- [Tauri CLI](https://v2.tauri.app/reference/cli/) (`cargo install tauri-cli`)

## Development

```bash
# Install frontend dependencies
npm install

# Run in development mode (requires Vite dev server on port 1420)
npm run tauri:dev

# Or build production frontend and run
npm run build
cargo tauri dev
```

## Building

```bash
# Build production app
npm run build
cargo tauri build
```

## MCP Configuration

To connect an AI assistant (e.g., OpenCode, Cursor, Claude Desktop):

1. Open the **IDE Connect** page in VibeStudio
2. Copy the MCP configuration
3. Add it to your IDE's MCP settings:
   - **OpenCode**: `~/.config/opencode/opencode.json`
   - **Cursor**: `~/.cursor/mcp.json`

The native MCP bridge (`mcp_bridge.exe`) starts automatically and connects to the WebSocket server at `ws://127.0.0.1:49152`.

## HTTP API

VibeStudio also exposes an HTTP API on `http://127.0.0.1:49153`:

- `GET /health` — Health check
- `GET /tabs` — List all tabs
- `GET /tab/{id}/content` — Get tab content
- `POST /navigate?url=` — Navigate to URL

## License

MIT
