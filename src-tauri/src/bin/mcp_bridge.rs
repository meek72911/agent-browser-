use futures_util::{SinkExt, StreamExt};
use std::io::{self, BufRead, Write};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const WS_URL: &str = "ws://127.0.0.1:49152";

#[tokio::main]
async fn main() {
    eprintln!("[mcp-bridge] Connecting to {} ...", WS_URL);

    let (ws_stream, _) = match connect_async(WS_URL).await {
        Ok(pair) => pair,
        Err(e) => {
            eprintln!("[mcp-bridge] Failed to connect to WebSocket: {}", e);
            std::process::exit(1);
        }
    };
    eprintln!("[mcp-bridge] Connected.");

    let (mut ws_tx, mut ws_rx) = ws_stream.split();

    // Channel to send outbound WS messages from stdin reader to WS sender
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    // Task: read from stdin and send to WS
    let stdin_tx = tx.clone();
    let stdin_handle = tokio::task::spawn_blocking(move || {
        let stdin = io::stdin();
        let reader = stdin.lock();
        for line in reader.lines() {
            match line {
                Ok(text) => {
                    if text.trim().is_empty() {
                        continue;
                    }
                    if stdin_tx.send(text).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    // Task: read from WS and print to stdout
    let stdout_handle = tokio::spawn(async move {
        let mut stdout = io::stdout();
        while let Some(msg) = ws_rx.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Err(_) = writeln!(stdout, "{}", text) {
                        break;
                    }
                    let _ = stdout.flush();
                }
                Ok(Message::Close(_)) => {
                    eprintln!("[mcp-bridge] WebSocket closed by server.");
                    break;
                }
                Ok(_) => {}
                Err(e) => {
                    eprintln!("[mcp-bridge] WebSocket error: {}", e);
                    break;
                }
            }
        }
    });

    // Task: send outbound messages to WS
    let send_handle = tokio::spawn(async move {
        while let Some(text) = rx.recv().await {
            if let Err(e) = ws_tx.send(Message::Text(text.into())).await {
                eprintln!("[mcp-bridge] Send error: {}", e);
                break;
            }
        }
    });

    // Wait for any task to finish
    tokio::select! {
        _ = stdin_handle => {},
        _ = stdout_handle => {},
        _ = send_handle => {},
    }

    eprintln!("[mcp-bridge] Exiting.");
}
