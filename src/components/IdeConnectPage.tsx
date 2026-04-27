import { createSignal, onMount, onCleanup, Show, type JSX } from 'solid-js';

interface IdeConnectPageProps {
  onNavigate: (url: string) => void;
  onClose: () => void;
  detectedIdes?: string[];
}

interface Ide {
  name: string;
  command: string;
  icon: string;
  color: string;
  detected: boolean;
}

const MCP_CONFIG = {
  mcpServers: {
    vibestudio: {
      command: 'C:\\\\Users\\\\vipul\\\\Desktop\\\\vibestudio\\\\src-tauri\\\\target\\\\debug\\\\mcp_bridge.exe',
      args: [],
      env: {
        VIBE_WS_URL: 'ws://127.0.0.1:49152',
      },
    },
  },
};

// Direct WebSocket config (for advanced setups)
const DIRECT_MCP_CONFIG = {
  name: 'vibestudio',
  transport: 'websocket',
  url: 'ws://127.0.0.1:49152',
};

export default function IdeConnectPage(props: IdeConnectPageProps): JSX.Element {
  const detectedSet = new Set(props.detectedIdes || []);
  const [ides] = createSignal<Ide[]>([
    { name: 'Cursor', command: 'cursor', icon: 'C', color: '#7c3aed', detected: detectedSet.has('Cursor') },
    { name: 'Trae', command: 'trae', icon: 'T', color: '#3b82f6', detected: detectedSet.has('Trae') },
    { name: 'Windsurf', command: 'windsurf', icon: 'W', color: '#22c55e', detected: detectedSet.has('Windsurf') },
    { name: 'VS Code', command: 'code', icon: 'V', color: '#3b82f6', detected: detectedSet.has('VS Code') },
  ]);
  const [wsConnected, setWsConnected] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const [mounted, setMounted] = createSignal(false);

  let wsCheckInterval: number;

  onMount(() => {
    setMounted(true);
    checkBackendConnection();
    wsCheckInterval = window.setInterval(checkBackendConnection, 3000);
  });

  onCleanup(() => {
    clearInterval(wsCheckInterval);
  });

  const checkBackendConnection = () => {
    try {
      const ws = new WebSocket('ws://127.0.0.1:49152');
      ws.onopen = () => {
        setWsConnected(true);
        ws.close();
      };
      ws.onerror = () => setWsConnected(false);
      ws.onclose = () => {};
    } catch {
      setWsConnected(false);
    }
  };

  const copyMcpConfig = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(MCP_CONFIG, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const copyDirectConfig = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(DIRECT_MCP_CONFIG, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const handleOpenIde = (_ide: Ide) => {
    // For now, just copy config and let user paste into IDE
    copyMcpConfig();
  };

  return (
    <div class="fixed inset-0 bg-[#080808] z-[100] flex items-center justify-center overflow-y-auto">
      <div class="fixed inset-0 pointer-events-none overflow-hidden">
        <div class="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)' }} />
        <div class="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, rgba(167, 139, 250, 0.3) 0%, transparent 70%)' }} />
      </div>

      <div class={`relative max-w-lg mx-auto px-6 py-12 transition-all duration-700 ${mounted() ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

        {/* Close button */}
        <button
          onClick={props.onClose}
          class="absolute top-0 right-0 p-2 text-gray-500 hover:text-white transition-colors"
          title="Dismiss"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div class="flex items-center justify-center gap-3 mb-8">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <span class="text-2xl font-semibold text-white tracking-tight">VibeStudio</span>
        </div>

        {/* Connection Status */}
        <div class="flex items-center justify-center gap-2 mb-8">
          <div class={`w-2 h-2 rounded-full ${wsConnected() ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <span class="text-xs text-gray-400">
            {wsConnected() ? 'MCP server online (ws://127.0.0.1:49152)' : 'MCP server offline — restart app'}
          </span>
        </div>

        {/* Detected IDEs banner */}
        <Show when={props.detectedIdes && props.detectedIdes.length > 0}>
          <div class="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <div class="flex items-center gap-2 mb-1">
              <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span class="text-xs text-emerald-400 font-medium">IDEs detected</span>
            </div>
            <div class="text-xs text-gray-400">
              {props.detectedIdes!.join(', ')} running — click below to connect
            </div>
          </div>
        </Show>

        {/* Main Card */}
        <div class="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 backdrop-blur-xl">
          <h2 class="text-lg font-medium text-white mb-2 text-center">Connect to IDE</h2>
          <p class="text-sm text-gray-400 text-center mb-6">
            VibeStudio exposes an MCP server on WebSocket. Configure your IDE to connect.
          </p>

          {/* Config Copy */}
          <div class="mb-6 p-3 bg-black/30 rounded-lg border border-white/[0.06]">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] text-gray-500 uppercase tracking-wider">MCP Config</span>
              <button
                onClick={copyMcpConfig}
                class="text-[10px] px-2 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
              >
                {copied() ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre class="text-[10px] text-gray-400 overflow-x-auto font-mono">
{JSON.stringify(MCP_CONFIG, null, 2)}
            </pre>
          </div>

          {/* Direct WS Config */}
          <div class="mb-6 p-3 bg-black/30 rounded-lg border border-white/[0.06]">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] text-gray-500 uppercase tracking-wider">Direct WebSocket</span>
              <button
                onClick={copyDirectConfig}
                class="text-[10px] px-2 py-1 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
              >
                {copied() ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre class="text-[10px] text-gray-400 overflow-x-auto font-mono">
{JSON.stringify(DIRECT_MCP_CONFIG, null, 2)}
            </pre>
          </div>

          {/* IDE List */}
          <div class="space-y-3">
            {ides().map((ide) => (
              <button
                onClick={() => handleOpenIde(ide)}
                class="group flex items-center gap-4 w-full p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all duration-200 text-left"
              >
                <div
                  class="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold flex-shrink-0"
                  style={{ background: `${ide.color}22`, color: ide.color }}
                >
                  {ide.icon}
                </div>
                <div class="flex-1">
                  <div class="text-sm font-medium text-white group-hover:text-white">
                    {ide.name}
                  </div>
                  <div class="text-xs text-gray-500">
                    {wsConnected() ? 'Click to copy config' : 'Waiting for server...'}
                  </div>
                </div>
                <div class="text-gray-600 group-hover:text-gray-400 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Available Tools */}
        <div class="mt-6 p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
          <h3 class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Available Tools</h3>
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <span class="text-blue-400 font-mono text-xs">→</span>
              <code class="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded text-xs">vibe_navigate</code>
              <span>Navigate to URL</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <span class="text-blue-400 font-mono text-xs">→</span>
              <code class="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded text-xs">vibe_get_url</code>
              <span>Get current tab URL</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <span class="text-blue-400 font-mono text-xs">→</span>
              <code class="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded text-xs">vibe_research</code>
              <span>Research topic via Google + extraction</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <span class="text-blue-400 font-mono text-xs">→</span>
              <code class="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded text-xs">vibe_extract</code>
              <span>Extract clean article text</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <span class="text-blue-400 font-mono text-xs">→</span>
              <code class="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded text-xs">vibe_screenshot</code>
              <span>Capture viewport screenshot</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <span class="text-blue-400 font-mono text-xs">→</span>
              <code class="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded text-xs">vibe_click</code>
              <span>Click element by selector</span>
            </div>
          </div>
        </div>

        {/* Manual Setup */}
        <div class="mt-4 text-center">
          <button
            onClick={() => props.onNavigate('')}
            class="text-xs text-gray-500 hover:text-gray-400 transition-colors"
          >
            Or continue to browser only →
          </button>
        </div>

      </div>
    </div>
  );
}
