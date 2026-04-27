use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::Value;
use tauri::Emitter;
use tokio::net::TcpListener;
use tokio::sync::{Mutex, oneshot};
use tokio_tungstenite::tungstenite::Message;

use crate::tab_manager::{TabManager, PageContent};

pub type TabManagerState = Arc<Mutex<TabManager>>;

static REQ_COUNTER: AtomicU64 = AtomicU64::new(1);

fn next_req_id() -> String {
    format!("mcp-{}", REQ_COUNTER.fetch_add(1, Ordering::SeqCst))
}

#[derive(Clone)]
pub struct McpServer {
    pub state: TabManagerState,
    pub pending: Arc<Mutex<HashMap<String, oneshot::Sender<String>>>>,
    pub app_handle: Option<tauri::AppHandle>,
}

impl McpServer {
    pub fn new(state: TabManagerState) -> Self {
        Self {
            state,
            pending: Arc::new(Mutex::new(HashMap::new())),
            app_handle: None,
        }
    }

    pub fn with_app_handle(mut self, handle: tauri::AppHandle) -> Self {
        self.app_handle = Some(handle);
        self
    }

    pub async fn run(&self, port: u16) {
        let addr = format!("127.0.0.1:{}", port);
        let listener = match TcpListener::bind(&addr).await {
            Ok(l) => l,
            Err(e) => {
                log::error!("MCP server failed to bind to {}: {}", addr, e);
                return;
            }
        };
        log::info!("MCP server listening on ws://{}", addr);

        while let Ok((stream, _)) = listener.accept().await {
            let ws_stream = match tokio_tungstenite::accept_async(stream).await {
                Ok(ws) => ws,
                Err(e) => {
                    log::warn!("MCP WebSocket handshake failed: {}", e);
                    continue;
                }
            };

            let self_clone = self.clone();
            tokio::spawn(async move {
                let (mut write, mut read) = ws_stream.split();
                while let Some(Ok(msg)) = read.next().await {
                    if let Ok(text) = msg.to_text() {
                        let response = self_clone.handle_request(text).await;
                        if let Some(resp) = response {
                            let _ = write.send(Message::Text(resp.into())).await;
                        }
                    }
                }
            });
        }
    }

    async fn handle_request(&self, text: &str) -> Option<String> {
        let req: JsonRpcRequest = match serde_json::from_str(text) {
            Ok(r) => r,
            Err(_) => return Some(jsonrpc_error(None, -32700, "Parse error")),
        };

        // Notifications have no id — don't respond
        let id = req.id.clone()?;

        let result = match req.method.as_str() {
            "initialize" => self.handle_initialize(&req.params).await,
            "tools/list" => self.handle_tools_list().await,
            "tools/call" => self.handle_tools_call(&req.params).await,
            _ => Err(jsonrpc_error(Some(id.clone()), -32601, "Method not found")),
        };

        match result {
            Ok(val) => Some(make_response(id, val)),
            Err(err_resp) => Some(err_resp),
        }
    }

    async fn handle_initialize(&self, _params: &Option<Value>) -> Result<Value, String> {
        Ok(serde_json::json!({
            "protocolVersion": "2024-11-05",
            "serverInfo": {
                "name": "vibestudio",
                "version": "0.1.0"
            },
            "capabilities": {
                "tools": { "listChanged": false }
            }
        }))
    }

    async fn handle_tools_list(&self) -> Result<Value, String> {
        Ok(serde_json::json!({
            "tools": [
                {
                    "name": "vibe_navigate",
                    "description": "Navigate the active browser tab to a URL",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "url": { "type": "string", "description": "URL to navigate to" }
                        },
                        "required": ["url"]
                    }
                },
                {
                    "name": "vibe_get_url",
                    "description": "Get the URL of the active browser tab",
                    "inputSchema": {
                        "type": "object",
                        "properties": {}
                    }
                },
                {
                    "name": "vibe_get_content",
                    "description": "Extract text content from the active browser tab",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "selector": { "type": "string", "description": "Optional CSS selector to scope extraction" }
                        }
                    }
                },
                {
                    "name": "vibe_click",
                    "description": "Click an element on the active browser tab by CSS selector",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "selector": { "type": "string", "description": "CSS selector of element to click" }
                        },
                        "required": ["selector"]
                    }
                },
                {
                    "name": "vibe_research",
                    "description": "Research a topic: auto-search Google and extract content from top results. Returns structured markdown report.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "query": { "type": "string", "description": "Topic to research" },
                            "sources": { "type": "number", "description": "Number of sources to check (default 5, max 10)" }
                        },
                        "required": ["query"]
                    }
                },
                {
                    "name": "vibe_extract",
                    "description": "Extract clean article text from the active tab using content scoring to find main article body.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {}
                    }
                },
                {
                    "name": "vibe_screenshot",
                    "description": "Take a screenshot of the current browser viewport. Returns base64 PNG image.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {}
                    }
                }
            ]
        }))
    }

    async fn handle_tools_call(&self, params: &Option<Value>) -> Result<Value, String> {
        let params = params.as_ref().ok_or_else(|| "Missing params".to_string())?;
        let name = params
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Missing tool name".to_string())?;
        let args = params.get("arguments").cloned().unwrap_or(Value::Null);

        let content = match name {
            "vibe_navigate" => self.tool_navigate(&args).await,
            "vibe_get_url" => self.tool_get_url().await,
            "vibe_get_content" => self.tool_get_content(&args).await,
            "vibe_click" => self.tool_click(&args).await,
            "vibe_research" => self.tool_research(&args).await,
            "vibe_extract" => self.tool_extract().await,
            "vibe_screenshot" => self.tool_screenshot().await,
            _ => Err(format!("Unknown tool: {}", name)),
        };

        match content {
            Ok(text) => Ok(serde_json::json!({
                "content": [{ "type": "text", "text": text }]
            })),
            Err(e) => Ok(serde_json::json!({
                "content": [{ "type": "text", "text": format!("Error: {}", e) }],
                "isError": true
            })),
        }
    }

    // ─── Tool implementations ───

    async fn tool_navigate(&self, args: &Value) -> Result<String, String> {
        let url = args
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or("Missing url argument")?;
        let normalized = TabManager::normalize_url(url);

        // Notify frontend to hide overlay immediately
        if let Some(handle) = &self.app_handle {
            let _ = handle.emit("navigation-started", serde_json::json!({"url": &normalized}));
        }

        let mut guard = self.state.lock().await;
        guard.show_active();
        guard.navigate_active(&normalized)?;
        guard.update_active_url(&normalized);
        Ok(format!("Navigated to {}", normalized))
    }

    async fn tool_get_url(&self) -> Result<String, String> {
        let guard = self.state.lock().await;
        let id = guard.active_id().ok_or("No active tab")?;
        let info = guard.tab_info(id).ok_or("Tab not found")?;
        Ok(info.url.clone())
    }

    async fn tool_get_content(&self, args: &Value) -> Result<String, String> {
        let guard = self.state.lock().await;
        let id = guard.active_id().ok_or("No active tab")?.to_string();

        // ── FAST PATH: Read from cache if available ──
        if let Some(content) = guard.get_tab_content(&id) {
            let selector = args.get("selector").and_then(|v| v.as_str());
            let text = if let Some(sel) = selector {
                // For selector queries, we still need JS eval (cache is full page)
                drop(guard);
                return self.tool_get_content_js(&id, sel).await;
            } else {
                let mut result = String::new();
                if !content.meta_description.is_empty() {
                    result.push_str(&format!("Meta: {}\n\n", content.meta_description));
                }
                if !content.headings.is_empty() {
                    result.push_str("Headings:\n");
                    for h in &content.headings {
                        result.push_str(&format!("- {}\n", h));
                    }
                    result.push_str("\n");
                }
                result.push_str(&content.text);
                result
            };
            return Ok(text);
        }

        // ── SLOW PATH: No cache, use JS eval ──
        drop(guard);
        let selector = args.get("selector").and_then(|v| v.as_str()).unwrap_or("");
        if selector.is_empty() {
            self.tool_get_content_js(&id, "").await
        } else {
            self.tool_get_content_js(&id, selector).await
        }
    }

    async fn tool_get_content_js(&self, tab_id: &str, selector: &str) -> Result<String, String> {
        let guard = self.state.lock().await;
        let req_id = next_req_id();

        let js = if selector.is_empty() {
            format!(
                "var text=document.body.innerText||document.documentElement.innerText||'';window.__TAURI__.event.emit('mcp-tool-result',{{id:'{}',result:text.substring(0,10000)}});",
                req_id
            )
        } else {
            format!(
                "var el=document.querySelector('{}');var text=el?(el.innerText||el.textContent||''):'';window.__TAURI__.event.emit('mcp-tool-result',{{id:'{}',result:text.substring(0,10000)}});",
                selector.replace('\\', "\\\\").replace('\'', "\\'"),
                req_id
            )
        };

        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(req_id.clone(), tx);
        guard.eval(tab_id, &js).map_err(|e| e.to_string())?;
        drop(guard);

        match tokio::time::timeout(Duration::from_secs(3), rx).await {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(_)) => Err("Channel closed".into()),
            Err(_) => {
                self.pending.lock().await.remove(&req_id);
                Err("Content extraction timed out".into())
            }
        }
    }

    async fn tool_click(&self, args: &Value) -> Result<String, String> {
        let guard = self.state.lock().await;
        let id = guard.active_id().ok_or("No active tab")?;

        let selector = args
            .get("selector")
            .and_then(|v| v.as_str())
            .ok_or("Missing selector argument")?;

        let req_id = next_req_id();
        let js = format!(
            "var el=document.querySelector('{}');if(el){{el.click();window.__TAURI__.event.emit('mcp-tool-result',{{id:'{}',result:'Clicked '+el.tagName}});}}else{{window.__TAURI__.event.emit('mcp-tool-result',{{id:'{}',result:'Element not found'}});}}",
            selector.replace('\\', "\\\\").replace('\'', "\\'"),
            req_id,
            req_id
        );

        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(req_id.clone(), tx);
        guard.eval(id, &js).map_err(|e| e.to_string())?;
        drop(guard);

        match tokio::time::timeout(Duration::from_secs(3), rx).await {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(_)) => Err("Channel closed".into()),
            Err(_) => {
                self.pending.lock().await.remove(&req_id);
                Err("Click timed out".into())
            }
        }
    }

    /// Poll for cached tab content with timeout and retries
    async fn wait_for_content(&self, timeout_ms: u64, poll_ms: u64) -> Option<PageContent> {
        let deadline = tokio::time::Instant::now() + Duration::from_millis(timeout_ms);
        while tokio::time::Instant::now() < deadline {
            let guard = self.state.lock().await;
            if let Some(id) = guard.active_id() {
                let id = id.to_string();
                if let Some(content) = guard.get_tab_content(&id) {
                    // Ensure content has some substance
                    if !content.text.is_empty() || !content.links.is_empty() {
                        return Some(content.clone());
                    }
                }
            }
            drop(guard);
            tokio::time::sleep(Duration::from_millis(poll_ms)).await;
        }
        None
    }

    async fn tool_research(&self, args: &Value) -> Result<String, String> {
        let query = args
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or("Missing query argument")?;
        let sources = args
            .get("sources")
            .and_then(|v| v.as_u64())
            .unwrap_or(5)
            .min(10) as usize;

        // Save current visibility state
        let was_visible = {
            let guard = self.state.lock().await;
            guard.is_visible()
        };

        // Step 1: Navigate to Google search
        let search_url = format!(
            "https://www.google.com/search?q={}",
            urlencoding::encode(query)
        );
        {
            let mut guard = self.state.lock().await;
            guard.show_active();
            if let Err(e) = guard.navigate_active(&search_url) {
                if !was_visible {
                    guard.hide_active();
                }
                return Err(format!("Failed to navigate to search: {}", e));
            }
            guard.update_active_url(&search_url);
        }

        // Step 2: Wait for page load + content cache with retry
        let search_content = match self.wait_for_content(5000, 200).await {
            Some(c) => c,
            None => {
                // Restore visibility on error
                if !was_visible {
                    let mut guard = self.state.lock().await;
                    guard.hide_active();
                }
                return Ok(format!("Search page timed out for '{}' — page may have loaded slowly or Google requires verification", query));
            }
        };

        // Step 3: Extract search result links from cached content
        let search_links = search_content.links;

        // Filter to actual result links (non-Google, non-empty)
        // Handle Google redirect URLs: https://www.google.com/url?...&url=ACTUAL_URL
        fn extract_real_url(href: &str) -> Option<String> {
            if href.contains("google.com/url") || href.contains("google.com/search") {
                if let Ok(parsed) = url::Url::parse(href) {
                    if let Some(real) = parsed.query_pairs().find(|(k, _)| k == "url") {
                        return Some(real.1.to_string());
                    }
                }
                None
            } else {
                Some(href.to_string())
            }
        }

        let result_urls: Vec<String> = search_links.iter()
            .filter_map(|l| {
                let href = l.get("href")?.as_str()?;
                let text = l.get("text")?.as_str().unwrap_or("");
                let real = extract_real_url(href)?;
                if real.starts_with("http") && !real.contains("google.com") && !real.contains("gstatic.com") && !text.is_empty() {
                    Some(real)
                } else {
                    None
                }
            })
            .take(sources)
            .collect();

        if result_urls.is_empty() {
            return Ok(format!("No search results found for '{}'", query));
        }

        // Step 4: Visit each result and collect content
        let mut findings = Vec::new();
        for (i, url) in result_urls.iter().enumerate() {
            {
                let mut guard = self.state.lock().await;
                guard.show_active();
                if let Err(_) = guard.navigate_active(url) {
                    continue; // Skip unreachable sources gracefully
                }
                guard.update_active_url(url);
            }

            // Wait for content with retry instead of hardcoded sleep
            if let Some(c) = self.wait_for_content(4000, 200).await {
                let snippet = c.text.lines().take(5).collect::<Vec<_>>().join("\n");
                findings.push(format!(
                    "## Source {}: {}\n**URL:** {}\n**Headings:** {}\n\n{}",
                    i + 1,
                    c.headings.first().unwrap_or(&"Untitled".to_string()),
                    url,
                    c.headings.join(", "),
                    snippet.chars().take(800).collect::<String>()
                ));
            }
        }

        // Restore visibility state
        if !was_visible {
            let mut guard = self.state.lock().await;
            guard.hide_active();
        }

        // Step 5: Return synthesized report
        let report = format!(
            "# Research Report: {}\n\n**Query:** {}\n**Sources checked:** {}\n\n---\n\n{}",
            query,
            query,
            findings.len(),
            findings.join("\n\n---\n\n")
        );

        Ok(report)
    }

    async fn tool_extract(&self) -> Result<String, String> {
        let guard = self.state.lock().await;
        let id = guard.active_id().ok_or("No active tab")?.to_string();

        // Read from cached content (already extracted with article scoring)
        if let Some(content) = guard.get_tab_content(&id) {
            let excerpt = if !content.meta_description.is_empty() {
                content.meta_description.clone()
            } else {
                content.text.lines().take(3).collect::<Vec<_>>().join(" ")
                    .chars().take(200).collect::<String>()
            };
            let word_count = content.text.split_whitespace().count();
            return Ok(format!(
                "## Extracted Article\n\n**Title:** {}\n**URL:** {}\n**Meta:** {}\n**Words:** ~{}\n\n---\n\n{}\n\n---\n\n**Links found:** {}",
                content.headings.first().unwrap_or(&"Untitled".to_string()),
                guard.tab_info(&id).map(|i| i.url.clone()).unwrap_or_default(),
                excerpt,
                word_count,
                content.text.chars().take(8000).collect::<String>(),
                content.links.len()
            ));
        }

        // Fallback: use JS eval to force fresh extraction
        drop(guard);
        let req_id = next_req_id();
        let js = format!(
            "(function(){{var r=new Readability(document);var a=r.parse();if(a){{window.__TAURI__.event.emit('mcp-tool-result',{{id:'{}',result:JSON.stringify({{title:a.title,text:a.textContent.substring(0,30000),byline:a.byline||''}})}});}}else{{window.__TAURI__.event.emit('mcp-tool-result',{{id:'{}',result:JSON.stringify({{title:document.title,text:document.body.innerText.substring(0,30000),byline:''}})}});}}}}())();",
            req_id, req_id
        );

        let guard = self.state.lock().await;
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(req_id.clone(), tx);
        guard.eval(&id, &js).map_err(|e| e.to_string())?;
        drop(guard);

        match tokio::time::timeout(Duration::from_secs(5), rx).await {
            Ok(Ok(raw)) => {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) {
                    let title = parsed.get("title").and_then(|v| v.as_str()).unwrap_or("Untitled");
                    let text = parsed.get("text").and_then(|v| v.as_str()).unwrap_or("");
                    let byline = parsed.get("byline").and_then(|v| v.as_str()).unwrap_or("");
                    let wc = text.split_whitespace().count();
                    Ok(format!(
                        "## Extracted Article\n\n**Title:** {}\n**Byline:** {}\n**Words:** ~{}\n\n---\n\n{}\n\n---\n\nExtracted with Readability.js",
                        title, byline, wc, text.chars().take(8000).collect::<String>()
                    ))
                } else {
                    Ok(raw)
                }
            }
            Ok(Err(_)) => Err("Channel closed".into()),
            Err(_) => {
                self.pending.lock().await.remove(&req_id);
                Err("Readability extraction timed out".into())
            }
        }
    }

    async fn tool_screenshot(&self) -> Result<String, String> {
        let req_id = next_req_id();
        let js = format!(
            "(function(){{var c=document.createElement('canvas');c.width=window.innerWidth;c.height=window.innerHeight;var ctx=c.getContext('2d');ctx.drawWindow(document.defaultView,0,0,c.width,c.height,'rgb(0,0,0)');var d=c.toDataURL('image/png');window.__TAURI__.event.emit('mcp-tool-result',{{id:'{}',result:d}});}})();",
            req_id
        );

        let guard = self.state.lock().await;
        let id = guard.active_id().ok_or("No active tab")?.to_string();
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(req_id.clone(), tx);
        guard.eval(&id, &js).map_err(|e| e.to_string())?;
        drop(guard);

        match tokio::time::timeout(Duration::from_secs(10), rx).await {
            Ok(Ok(data_url)) => {
                // data_url is "data:image/png;base64,..."
                Ok(format!(
                    "Screenshot captured ({} chars, PNG format)",
                    data_url.len()
                ))
            }
            Ok(Err(_)) => Err("Channel closed".into()),
            Err(_) => {
                self.pending.lock().await.remove(&req_id);
                Err("Screenshot timed out — WebView2 may not support drawWindow".into())
            }
        }
    }
}

// ─── JSON-RPC helpers ───

#[derive(Deserialize, Debug)]
struct JsonRpcRequest {
    jsonrpc: String,
    method: String,
    #[serde(default)]
    params: Option<Value>,
    id: Option<Value>,
}

fn make_response(id: Value, result: Value) -> String {
    serde_json::json!({"jsonrpc": "2.0", "id": id, "result": result}).to_string()
}

fn jsonrpc_error(id: Option<Value>, code: i32, message: &str) -> String {
    let mut obj = serde_json::Map::new();
    obj.insert("jsonrpc".into(), "2.0".into());
    if let Some(i) = id {
        obj.insert("id".into(), i);
    } else {
        obj.insert("id".into(), Value::Null);
    }
    obj.insert(
        "error".into(),
        serde_json::json!({"code": code, "message": message}),
    );
    Value::Object(obj).to_string()
}
