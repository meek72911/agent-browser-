import WebSocket from 'ws';

const WS_URL = process.env.VIBE_WS_URL || 'ws://127.0.0.1:49152';

class StdioMcpBridge {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.pending = new Map();
    this.msgId = 1;
    this.buffer = '';
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);
      
      this.ws.on('open', () => {
        this.connected = true;
        resolve();
      });
      
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        // Forward response to stdout
        console.log(JSON.stringify(msg));
      });
      
      this.ws.on('error', (err) => {
        console.error(JSON.stringify({ jsonrpc: '2.0', error: { message: err.message } }));
        if (!this.connected) reject(err);
      });
      
      this.ws.on('close', () => {
        this.connected = false;
        process.exit(0);
      });
    });
  }

  run() {
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', (chunk) => {
      this.buffer += chunk;
      
      // Process complete lines (JSON-RPC messages)
      let lines = this.buffer.split('\n');
      this.buffer = lines.pop(); // Keep incomplete line in buffer
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        try {
          const msg = JSON.parse(trimmed);
          
          // Handle initialize specially - send notification after response
          if (msg.method === 'initialize') {
            this.ws.send(JSON.stringify(msg));
            // After initialize, send notifications/initialized
            setTimeout(() => {
              this.ws.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'notifications/initialized'
              }));
            }, 50);
          } else {
            this.ws.send(JSON.stringify(msg));
          }
        } catch (e) {
          console.error(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32700, message: 'Parse error: ' + e.message }
          }));
        }
      }
    });
    
    process.stdin.on('end', () => {
      if (this.ws) this.ws.close();
      process.exit(0);
    });
  }
}

async function main() {
  const bridge = new StdioMcpBridge();
  await bridge.connect();
  bridge.run();
}

main().catch(err => {
  console.error(JSON.stringify({ jsonrpc: '2.0', error: { message: err.message } }));
  process.exit(1);
});
