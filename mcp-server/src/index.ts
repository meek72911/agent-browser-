import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import WebSocket from "ws";

const VIBE_WS_PORT = process.env.VIBESTUDIO_WS_PORT || "49152";
const VIBE_AUTH_TOKEN = process.env.VIBESTUDIO_AUTH_TOKEN;

if (!VIBE_AUTH_TOKEN) {
  console.error("VIBESTUDIO_AUTH_TOKEN environment variable is required");
  process.exit(1);
}

// ─── Persistent WebSocket Connection ────────────────────────────────────────

let ws: WebSocket | null = null;
let authenticated = false;
let connectPromise: Promise<void> | null = null;

/**
 * Ensure a persistent, authenticated WebSocket connection to VibeStudio.
 * Re-uses the existing connection if still open; reconnects otherwise.
 */
function ensureConnected(): Promise<void> {
  if (ws?.readyState === WebSocket.OPEN && authenticated) {
    return Promise.resolve();
  }
  if (connectPromise) return connectPromise;

  connectPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Connection to VibeStudio timed out (5s)"));
      connectPromise = null;
    }, 5000);

    const newWs = new WebSocket(`ws://127.0.0.1:${VIBE_WS_PORT}`);

    newWs.on("open", () => {
      // Wait for auth_challenge from server
    });

    newWs.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "auth_challenge") {
          newWs.send(JSON.stringify({ token: VIBE_AUTH_TOKEN }));
          return;
        }
        if (msg.type === "auth_success") {
          ws = newWs;
          authenticated = true;
          connectPromise = null;
          clearTimeout(timeout);
          resolve();
          return;
        }
      } catch (e) {
        // Non-auth message during connect = error
        clearTimeout(timeout);
        connectPromise = null;
        reject(e);
      }
    });

    newWs.on("error", (err: Error) => {
      clearTimeout(timeout);
      connectPromise = null;
      authenticated = false;
      ws = null;
      reject(
        new Error(
          `Failed to connect to VibeStudio: ${err.message}. Is the app open?`
        )
      );
    });

    newWs.on("close", () => {
      authenticated = false;
      ws = null;
      connectPromise = null;
    });
  });

  return connectPromise;
}

/**
 * Send a request over the persistent WebSocket and wait for a response.
 * Reconnects automatically if the connection was lost.
 *
 * Protocol:
 *   Client → { action: "...", ...payload }   (flatten — no nested "payload" key)
 *   Server → { success: true, data: ... }  or  { success: false, error: "..." }
 */
async function callVibeRust(
  action: string,
  payload: Record<string, unknown>
): Promise<any> {
  await ensureConnected();

  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // Force reconnect on next attempt
      authenticated = false;
      return reject(new Error("WebSocket not connected"));
    }

    const timeout = setTimeout(() => {
      ws?.off("message", handler);
      reject(new Error("VibeStudio request timed out after 30 seconds"));
    }, 30000);

    const handler = (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString());

        // Skip auth messages (shouldn't happen, but be safe)
        if (msg.type === "auth_challenge" || msg.type === "auth_success") return;

        ws?.off("message", handler);
        clearTimeout(timeout);

        if (msg.success === false && msg.error) {
          reject(new Error(msg.error));
        } else {
          resolve(msg.data || msg);
        }
      } catch (e) {
        ws?.off("message", handler);
        clearTimeout(timeout);
        reject(e);
      }
    };

    ws.on("message", handler);
    ws.send(JSON.stringify({ action, ...payload }));
  });
}

// ─── MCP Server ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: "vibestudio-mcp", version: "1.1.0" },
  { capabilities: { tools: {} } }
);

// ─── Tool Definitions ───────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "vibe_navigate_and_extract",
        description:
          "Navigate to a URL in the VibeStudio browser and extract the page content as clean Markdown.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The URL to navigate to and extract",
            },
          },
          required: ["url"],
        },
      },
      {
        name: "vibe_scrape",
        description:
          "Quick scrape of a URL — extracts clean Markdown content.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "The URL to scrape" },
          },
          required: ["url"],
        },
      },
      {
        name: "vibe_navigate",
        description: "Navigate the browser to a URL without extracting content.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "The URL to navigate to" },
          },
          required: ["url"],
        },
      },
      {
        name: "vibe_get_current_url",
        description:
          "Get the URL of the currently active page in the browser.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "vibe_screenshot",
        description:
          "Take a screenshot of the current browser page. Returns a base64-encoded PNG.",
        inputSchema: { type: "object", properties: {} },
      },

      // ── New: Input tools ──

      {
        name: "vibe_click",
        description:
          "Click at (x, y) pixel coordinates in the browser viewport. Uses CDP for iframe/canvas support.",
        inputSchema: {
          type: "object",
          properties: {
            x: { type: "number", description: "X coordinate (CSS pixels)" },
            y: { type: "number", description: "Y coordinate (CSS pixels)" },
          },
          required: ["x", "y"],
        },
      },
      {
        name: "vibe_type",
        description:
          "Type text into the currently focused element (input, textarea, contentEditable).",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "The text to type" },
          },
          required: ["text"],
        },
      },
      {
        name: "vibe_press_key",
        description:
          "Press a named key: Enter, Backspace, Tab, Escape, ArrowUp, ArrowDown, etc.",
        inputSchema: {
          type: "object",
          properties: {
            key: { type: "string", description: "Key name (e.g. Enter, Tab)" },
          },
          required: ["key"],
        },
      },
      {
        name: "vibe_scroll",
        description:
          "Scroll the page by (deltaX, deltaY). Positive deltaY scrolls down.",
        inputSchema: {
          type: "object",
          properties: {
            delta_x: {
              type: "number",
              description: "Horizontal scroll delta",
              default: 0,
            },
            delta_y: {
              type: "number",
              description: "Vertical scroll delta (positive = down)",
              default: 0,
            },
          },
        },
      },
      {
        name: "vibe_eval_js",
        description:
          "Execute arbitrary JavaScript in the current page and return the result.",
        inputSchema: {
          type: "object",
          properties: {
            script: {
              type: "string",
              description: "JavaScript code to evaluate",
            },
          },
          required: ["script"],
        },
      },
      {
        name: "vibe_wait",
        description:
          "Wait for a CSS selector to appear on the page (polls every 200ms).",
        inputSchema: {
          type: "object",
          properties: {
            selector: {
              type: "string",
              description: "CSS selector to wait for",
            },
            timeout: {
              type: "number",
              description: "Max wait in ms (default 10000)",
              default: 10000,
            },
          },
          required: ["selector"],
        },
      },

      // ── Tab management tools ──

      {
        name: "vibe_create_tab",
        description:
          "Create a new browser tab. The new tab becomes active. Returns the backend tab ID.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "vibe_switch_tab",
        description:
          "Switch the active browser tab by its backend tab ID.",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "string", description: "Backend tab ID to switch to" },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "vibe_close_tab",
        description:
          "Close a browser tab by its backend tab ID.",
        inputSchema: {
          type: "object",
          properties: {
            tab_id: { type: "string", description: "Backend tab ID to close" },
          },
          required: ["tab_id"],
        },
      },
      {
        name: "vibe_list_tabs",
        description:
          "List all open browser tab IDs. The first ID is the active tab.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

// ─── Tool Handlers ──────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "vibe_navigate_and_extract":
      case "vibe_scrape": {
        const url = z.string().parse((args as any)?.url);
        const result = await callVibeRust("navigate_and_extract", { url });
        return {
          content: [
            {
              type: "text",
              text: result.markdown || "# Content\n\nNo content extracted",
            },
          ],
        };
      }

      case "vibe_navigate": {
        const url = z.string().parse((args as any)?.url);
        await callVibeRust("navigate", { url });
        return {
          content: [{ type: "text", text: `Navigated to ${url}` }],
        };
      }

      case "vibe_get_current_url": {
        const result = await callVibeRust("get_current_url", {});
        return {
          content: [{ type: "text", text: result.url || "about:blank" }],
        };
      }

      case "vibe_screenshot": {
        const result = await callVibeRust("screenshot", {});
        const b64 = result.screenshot || "";
        return {
          content: [
            {
              type: "image",
              data: b64,
              mimeType: "image/png",
            },
          ],
        };
      }

      // ── Input tools ──

      case "vibe_click": {
        const x = Number((args as any)?.x ?? 0);
        const y = Number((args as any)?.y ?? 0);
        await callVibeRust("click", { x, y });
        return {
          content: [{ type: "text", text: `Clicked at (${x}, ${y})` }],
        };
      }

      case "vibe_type": {
        const text = String((args as any)?.text ?? "");
        await callVibeRust("type_text", { text });
        return {
          content: [
            { type: "text", text: `Typed ${text.length} characters` },
          ],
        };
      }

      case "vibe_press_key": {
        const key = String((args as any)?.key ?? "Enter");
        await callVibeRust("press_key", { key });
        return {
          content: [{ type: "text", text: `Pressed key: ${key}` }],
        };
      }

      case "vibe_scroll": {
        const dx = Number((args as any)?.delta_x ?? 0);
        const dy = Number((args as any)?.delta_y ?? 0);
        await callVibeRust("scroll", { delta_x: dx, delta_y: dy });
        return {
          content: [
            { type: "text", text: `Scrolled by (${dx}, ${dy})` },
          ],
        };
      }

      case "vibe_eval_js": {
        const script = String((args as any)?.script ?? "");
        const result = await callVibeRust("eval_js", { script });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.result ?? null, null, 2),
            },
          ],
        };
      }

      case "vibe_wait": {
        const selector = String((args as any)?.selector ?? "");
        const timeout = Number((args as any)?.timeout ?? 10000);
        await callVibeRust("wait_for_selector", { selector, timeout });
        return {
          content: [
            { type: "text", text: `Selector '${selector}' found` },
          ],
        };
      }

      // ── Tab management tools ──

      case "vibe_create_tab": {
        const result = await callVibeRust("create_tab", {});
        return {
          content: [{ type: "text", text: `Created new tab: ${result.tab_id || JSON.stringify(result)}` }],
        };
      }

      case "vibe_switch_tab": {
        const tabId = String((args as any)?.tab_id ?? "");
        await callVibeRust("switch_tab", { tab_id: tabId });
        return {
          content: [{ type: "text", text: `Switched to tab: ${tabId}` }],
        };
      }

      case "vibe_close_tab": {
        const tabId = String((args as any)?.tab_id ?? "");
        const result = await callVibeRust("close_tab", { tab_id: tabId });
        return {
          content: [{ type: "text", text: `Closed tab: ${tabId}. ${result.new_active ? 'New active: ' + result.new_active : ''}` }],
        };
      }

      case "vibe_list_tabs": {
        const result = await callVibeRust("list_tabs", {});
        return {
          content: [{ type: "text", text: JSON.stringify(result.tabs || result, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// ─── Start ──────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("VibeStudio MCP Server v2.0.0 running (persistent WS, tabs, network adblock)");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});