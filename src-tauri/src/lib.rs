mod tab_manager;
mod mcp_server;

use std::sync::Arc;
use tauri::{Emitter, Listener, LogicalPosition, LogicalSize, Manager, State, WebviewBuilder, WebviewUrl};
use tauri::window::Color;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub type TabManagerState = Arc<tokio::sync::Mutex<tab_manager::TabManager>>;

#[tauri::command]
async fn navigate_direct(
    url: String,
    state: State<'_, TabManagerState>,
) -> Result<(), String> {
    let mut guard = state.lock().await;
    guard.show_active();
    let normalized = tab_manager::TabManager::normalize_url(&url);
    guard.navigate_active(&normalized)?;
    guard.update_active_url(&normalized);
    Ok(())
}

#[tauri::command]
async fn go_back(state: State<'_, TabManagerState>) -> Result<(), String> {
    let mut guard = state.lock().await;
    guard.show_active();
    let id = guard.active_id().ok_or("no active tab")?.to_string();
    guard.back(&id)
}

#[tauri::command]
async fn go_forward(state: State<'_, TabManagerState>) -> Result<(), String> {
    let mut guard = state.lock().await;
    guard.show_active();
    let id = guard.active_id().ok_or("no active tab")?.to_string();
    guard.forward(&id)
}

#[tauri::command]
async fn reload(state: State<'_, TabManagerState>) -> Result<(), String> {
    let mut guard = state.lock().await;
    guard.show_active();
    let id = guard.active_id().ok_or("no active tab")?.to_string();
    guard.reload(&id)
}

#[tauri::command]
async fn set_zoom(_app: tauri::AppHandle, level: f64, state: State<'_, TabManagerState>) -> Result<(), String> {
    let pct = (level * 100.0) as i32;
    let js = format!(
        "document.documentElement.style.zoom = '{}%'; document.body.style.zoom = '{}%';",
        pct, pct
    );
    let guard = state.lock().await;
    if let Some(id) = guard.active_id() {
        guard.eval(id, &js)?;
    }
    Ok(())
}

#[tauri::command]
async fn find_in_page(state: State<'_, TabManagerState>, query: String, forward: bool) -> Result<bool, String> {
    let query_json = serde_json::to_string(&query).map_err(|e| e.to_string())?;
    let js = format!(
        "window.find({}, false, {}, true, false, false, false);",
        query_json,
        if forward { "false" } else { "true" }
    );
    let guard = state.lock().await;
    if let Some(id) = guard.active_id() {
        guard.eval(id, &js)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
async fn clear_find(state: State<'_, TabManagerState>) -> Result<(), String> {
    let guard = state.lock().await;
    if let Some(id) = guard.active_id() {
        guard.eval(id, "window.getSelection()?.removeAllRanges();")?;
    }
    Ok(())
}

#[tauri::command]
async fn hide_tabs(state: State<'_, TabManagerState>) -> Result<(), String> {
    let mut guard = state.lock().await;
    guard.hide_active();
    Ok(())
}

#[tauri::command]
async fn show_tabs(state: State<'_, TabManagerState>) -> Result<(), String> {
    let mut guard = state.lock().await;
    guard.show_active();
    Ok(())
}

#[tauri::command]
async fn create_tab(
    app: tauri::AppHandle,
    state: State<'_, TabManagerState>,
    url: Option<String>,
) -> Result<String, String> {
    let target = url.unwrap_or_else(|| "about:blank".to_string());
    let mut guard = state.lock().await;
    let id = guard.create_tab(&app, &target)?;
    let entry = guard.tab_info(&id);
    let _ = app.emit(
        "tab-activated",
        serde_json::json!({
            "tab_id": &id,
            "url": entry.map(|e| &e.url).unwrap_or(&"".to_string()),
            "title": entry.map(|e| &e.title).unwrap_or(&"".to_string()),
        }),
    );
    Ok(id)
}

#[tauri::command]
async fn switch_tab(
    app: tauri::AppHandle,
    state: State<'_, TabManagerState>,
    tab_id: String,
) -> Result<(), String> {
    let mut guard = state.lock().await;
    guard.switch_tab(&tab_id)?;
    let entry = guard.tab_info(&tab_id);
    let _ = app.emit(
        "tab-activated",
        serde_json::json!({
            "tab_id": &tab_id,
            "url": entry.map(|e| &e.url).unwrap_or(&"".to_string()),
            "title": entry.map(|e| &e.title).unwrap_or(&"".to_string()),
        }),
    );
    Ok(())
}

#[tauri::command]
async fn close_tab(
    app: tauri::AppHandle,
    state: State<'_, TabManagerState>,
    tab_id: String,
) -> Result<Option<String>, String> {
    let mut guard = state.lock().await;
    guard.close_tab(&tab_id, &app)
}

#[tauri::command]
async fn list_tabs(state: State<'_, TabManagerState>) -> Result<Vec<String>, String> {
    let guard = state.lock().await;
    Ok(guard.list_tabs())
}

#[tauri::command]
async fn get_blocked_count() -> u64 {
    0
}

#[tauri::command]
async fn minimize_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_window("main") {
        w.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn toggle_maximize(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_window("main") {
        if w.is_maximized().unwrap_or(false) {
            w.unmaximize().map_err(|e| e.to_string())?;
        } else {
            w.maximize().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn close_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_window("main") {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn detect_ides_internal() -> Result<Vec<String>, String> {
    let ide_checks: &[(&str, &[&str])] = &[
        ("Cursor", &["Cursor", "cursor"]),
        ("Trae", &["Trae", "trae"]),
        ("Windsurf", &["Windsurf", "windsurf"]),
        ("VS Code", &["Code", "code", "VSCode", "vscode", "OpenCode", "opencode"]),
        ("IntelliJ", &["idea64", "idea"]),
        ("WebStorm", &["webstorm64", "webstorm"]),
        ("Sublime", &["sublime_text"]),
        ("Zed", &["zed"]),
    ];

    let mut detected = Vec::new();

    for (name, proc_names) in ide_checks {
        for proc in *proc_names {
            let output = std::process::Command::new("tasklist")
                .args(["/FI", &format!("IMAGENAME eq {}.exe", proc), "/FO", "CSV", "/NH"])
                .output()
                .map_err(|e| e.to_string())?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            let trimmed = stdout.trim();
            if !trimmed.is_empty() && !trimmed.to_lowercase().contains("no tasks") {
                detected.push(name.to_string());
                break;
            }
        }
    }

    Ok(detected)
}

#[tauri::command]
async fn detect_ides() -> Result<Vec<String>, String> {
    let detected = detect_ides_internal().await?;
    log::info!("Detected IDEs: {:?}", detected);
    Ok(detected)
}

#[tauri::command]
async fn save_session(state: State<'_, TabManagerState>) -> Result<(), String> {
    let data = {
        let guard = state.lock().await;
        guard.session_data()
    };
    let session_file = std::env::temp_dir().join("vibestudio_session.json");
    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("serialize: {}", e))?;
    std::fs::write(&session_file, json)
        .map_err(|e| format!("write: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn restore_session() -> Result<Vec<serde_json::Value>, String> {
    let session_file = std::env::temp_dir().join("vibestudio_session.json");
    if !session_file.exists() {
        return Ok(vec![]);
    }
    let json = std::fs::read_to_string(&session_file)
        .map_err(|e| format!("read: {}", e))?;
    let data: Vec<serde_json::Value> = serde_json::from_str(&json)
        .map_err(|e| format!("parse: {}", e))?;
    // Only restore tabs the user actually had open
    Ok(data)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER",
        std::env::temp_dir().join("vibestudio_webview").to_str().unwrap_or("C:\\temp"));

    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            navigate_direct,
            go_back,
            go_forward,
            reload,
            set_zoom,
            find_in_page,
            clear_find,
            hide_tabs,
            show_tabs,
            create_tab,
            switch_tab,
            close_tab,
            list_tabs,
            get_blocked_count,
            save_session,
            restore_session,
            detect_ides,
            minimize_window,
            toggle_maximize,
            close_window,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let window_opt = app.get_window("main");
            if let Some(window) = &window_opt {
                window.set_title("VibeStudio").ok();
                window.set_min_size(Some(tauri::PhysicalSize::new(640, 400))).ok();

                // Main webview — Solid.js browser UI
                let _browser_ui = window.add_child(
                    WebviewBuilder::new("browser-ui", WebviewUrl::App(Default::default()))
                        .background_color(Color(0, 0, 0, 0)),
                    LogicalPosition::new(0.0, 0.0),
                    LogicalSize::new(1280.0, 800.0),
                )?;
            }

            // Initialize TabManager with tokio::sync::Mutex
            let tab_state: TabManagerState = Arc::new(tokio::sync::Mutex::new(tab_manager::TabManager::new()));
            app.manage(tab_state.clone());

            // Listen for page-loaded events from child webviews (with structured content)
            let pl_state = tab_state.clone();
            let _ = app.listen("page-loaded", move |event| {
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                    let tab_id = payload.get("tab_id").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let url = payload.get("url").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let title = payload.get("title").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let text = payload.get("text").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let headings = payload.get("headings").and_then(|v| v.as_array()).cloned().unwrap_or_default();
                    let links = payload.get("links").and_then(|v| v.as_array()).cloned().unwrap_or_default();
                    let meta_desc = payload.get("metaDescription").and_then(|v| v.as_str()).map(|s| s.to_string()).unwrap_or_default();
                    if let (Some(tab_id), Some(url)) = (tab_id, url) {
                        let state = pl_state.clone();
                        tauri::async_runtime::spawn(async move {
                            let mut guard = state.lock().await;
                            guard.update_tab_url(&tab_id, &url);
                            if let Some(title) = title {
                                guard.update_tab_title(&tab_id, &title);
                            }
                            if let Some(text) = text {
                                let h: Vec<String> = headings.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();
                                guard.update_tab_content(&tab_id, &text, h, links, &meta_desc);
                            }
                        });
                    }
                }
            });

            // Listen for page-title-updated events
            let pt_state = tab_state.clone();
            let _ = app.listen("page-title-updated", move |event| {
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                    let tab_id = payload.get("tab_id").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let title = payload.get("title").and_then(|v| v.as_str()).map(|s| s.to_string());
                    if let (Some(tab_id), Some(title)) = (tab_id, title) {
                        let state = pt_state.clone();
                        tauri::async_runtime::spawn(async move {
                            let mut guard = state.lock().await;
                            guard.update_tab_title(&tab_id, &title);
                        });
                    }
                }
            });

            // Listen for download-started events from child webviews
            let dl_handle = handle.clone();
            let _ = app.listen("download-started", move |event| {
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                    let _ = dl_handle.emit("download-progress", payload);
                }
            });

            // Listen for ad-blocked events from child webviews
            let ab_handle = handle.clone();
            let _ = app.listen("ad-blocked", move |event| {
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                    let _ = ab_handle.emit("ad-blocked", payload);
                }
            });

            // ─── MCP Server ───
            let mcp = mcp_server::McpServer::new(tab_state.clone())
                .with_app_handle(handle.clone());
            let mcp_pending = mcp.pending.clone();

            // Listen for mcp-tool-result events from child webviews
            let _ = app.listen("mcp-tool-result", move |event| {
                if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                    let id = payload.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let result = payload.get("result").and_then(|v| v.as_str()).map(|s| s.to_string());
                    if let (Some(id), Some(result)) = (id, result) {
                        let pending = mcp_pending.clone();
                        tauri::async_runtime::spawn(async move {
                            let mut map = pending.lock().await;
                            if let Some(tx) = map.remove(&id) {
                                let _ = tx.send(result);
                            }
                        });
                    }
                }
            });

            // Spawn MCP WebSocket server
            let mcp_clone = mcp.clone();
            tauri::async_runtime::spawn(async move {
                mcp_clone.run(49152).await;
            });

            // Spawn HTTP API server for direct testing
            let http_state = tab_state.clone();
            tauri::async_runtime::spawn(async move {
                spawn_http_api(http_state, 49153).await;
            });

            // Auto-detect IDEs on startup and notify frontend
            let ide_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                match detect_ides_internal().await {
                    Ok(ides) if !ides.is_empty() => {
                        log::info!("Auto-detected IDEs on startup: {:?}", ides);
                        let _ = ide_handle.emit("ides-detected", serde_json::json!({ "ides": ides }));
                    }
                    _ => {}
                }
            });

            // Window event handler — resize + session save on close
            if let Some(window) = window_opt {
                let ev_handle = handle.clone();
                let ev_state = tab_state.clone();
                let ev_window = window.clone();
                window.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::Resized(size) => {
                            let scale = ev_window.scale_factor().unwrap_or(1.0);
                        let lw = size.width as f64 / scale;
                        let lh = size.height as f64 / scale;
                        if let Some(ui) = ev_handle.get_webview("browser-ui") {
                            let _ = ui.set_size(LogicalSize::new(lw, lh));
                        }
                        let state = ev_state.clone();
                        tauri::async_runtime::spawn(async move {
                            let mut guard = state.lock().await;
                            guard.resize_all(lw, lh);
                        });
                    }
                    tauri::WindowEvent::CloseRequested { .. } => {
                        let state = ev_state.clone();
                        tauri::async_runtime::spawn(async move {
                            let guard = state.lock().await;
                            let data = guard.session_data();
                            if !data.is_empty() {
                                let session_file = std::env::temp_dir().join("vibestudio_session.json");
                                    if let Ok(json) = serde_json::to_string_pretty(&data) {
                                        let _ = std::fs::write(&session_file, json);
                                        log::info!("Session auto-saved on close");
                                    }
                                }
                            });
                        }
                        _ => {}
                    }
                });
            }

            log::info!("VibeStudio started — native multi-webview mode");
            Ok(())
        });

    if let Err(e) = builder.run(tauri::generate_context!()) {
        log::error!("Error while running tauri application: {}", e);
    }
}

// ─── Minimal HTTP API for direct testing ───

async fn spawn_http_api(state: Arc<tokio::sync::Mutex<tab_manager::TabManager>>, port: u16) {
    let listener = match tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port)).await {
        Ok(l) => l,
        Err(e) => {
            log::warn!("HTTP API bind failed on port {}: {}", port, e);
            return;
        }
    };
    log::info!("HTTP API listening on http://127.0.0.1:{}", port);

    loop {
        let (mut socket, _) = match listener.accept().await {
            Ok(pair) => pair,
            Err(_) => continue,
        };
        let state = state.clone();

        tauri::async_runtime::spawn(async move {
            let mut buf = [0u8; 4096];
            let n = match socket.read(&mut buf).await {
                Ok(0) => return,
                Ok(n) => n,
                Err(_) => return,
            };
            let req = String::from_utf8_lossy(&buf[..n]);
            let lines: Vec<&str> = req.lines().collect();
            if lines.is_empty() {
                return;
            }
            let parts: Vec<&str> = lines[0].split_whitespace().collect();
            if parts.len() < 2 {
                return;
            }
            let method = parts[0];
            let path = parts[1];

            let (status, body, content_type) = match (method, path) {
                ("GET", "/health") => {
                    ("200 OK", r#"{"status":"ok"}"#.to_string(), "application/json")
                }
                ("GET", "/tabs") => {
                    let guard: tokio::sync::MutexGuard<'_, tab_manager::TabManager> = state.lock().await;
                    let tabs: Vec<serde_json::Value> = guard
                        .list_tabs()
                        .iter()
                        .map(|id| {
                            let info = guard.tab_info(id);
                            serde_json::json!({
                                "id": id,
                                "title": info.map(|i| i.title.clone()).unwrap_or_default(),
                                "url": info.map(|i| i.url.clone()).unwrap_or_default(),
                                "has_content": info.map(|i| i.content.is_some()).unwrap_or(false),
                            })
                        })
                        .collect();
                    ("200 OK", serde_json::to_string(&tabs).unwrap_or_default(), "application/json")
                }
                ("GET", path) if path.starts_with("/tab/") && path.ends_with("/content") => {
                    let id = &path[5..path.len()-8];
                    let guard: tokio::sync::MutexGuard<'_, tab_manager::TabManager> = state.lock().await;
                    match guard.get_tab_content(id) {
                        Some(c) => (
                            "200 OK",
                            serde_json::to_string(&serde_json::json!({
                                "text": &c.text[..c.text.len().min(5000)],
                                "headings": c.headings,
                                "meta_description": c.meta_description,
                            })).unwrap_or_default(),
                            "application/json",
                        ),
                        None => ("404 Not Found", r#"{"error":"No content cached"}"#.to_string(), "application/json"),
                    }
                }
                ("POST", path) if path.starts_with("/navigate?url=") => {
                    let url = &path[14..];
                    let url = urlencoding::decode(url).unwrap_or_default();
                    let mut guard: tokio::sync::MutexGuard<'_, tab_manager::TabManager> = state.lock().await;
                    let normalized = tab_manager::TabManager::normalize_url(&url);
                    let _ = guard.navigate_active(&normalized);
                    guard.update_active_url(&normalized);
                    ("200 OK", serde_json::to_string(&serde_json::json!({"url": normalized})).unwrap_or_default(), "application/json")
                }
                _ => ("404 Not Found", r#"{"error":"Not found"}"#.to_string(), "application/json"),
            };

            let response = format!(
                "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                status,
                content_type,
                body.len(),
                body
            );
            let _ = socket.write_all(response.as_bytes()).await;
        });
    }
}
