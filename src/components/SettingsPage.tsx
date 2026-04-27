import { createSignal, onMount, onCleanup, Show, For, type JSX } from 'solid-js';

interface SettingsPageProps {
  onClose: () => void;
}

interface Settings {
  searchEngine: string;
  homepageUrl: string;
  downloadLocation: string;
  startWithLastSession: boolean;
  adBlocking: boolean;
  trackerBlocking: boolean;
  doNotTrack: boolean;
  mcpLicenseKey: string;
  mcpPort: number;
  accentColor: string;
  fontSize: string;
  showBookmarksBar: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  searchEngine: 'google',
  homepageUrl: '',
  downloadLocation: '',
  startWithLastSession: false,
  adBlocking: true,
  trackerBlocking: true,
  doNotTrack: true,
  mcpLicenseKey: '',
  mcpPort: 49152,
  accentColor: '#3b82f6',
  fontSize: 'medium',
  showBookmarksBar: false,
};

type Section = 'general' | 'privacy' | 'mcp' | 'appearance' | 'shortcuts' | 'about';

const SHORTCUTS = [
  { keys: 'Ctrl+T', action: 'New Tab' },
  { keys: 'Ctrl+W', action: 'Close Tab' },
  { keys: 'Ctrl+L', action: 'Focus URL Bar' },
  { keys: 'Ctrl+R', action: 'Reload Page' },
  { keys: 'Ctrl+F', action: 'Find in Page' },
  { keys: 'Ctrl+J', action: 'Toggle Downloads' },
  { keys: 'Ctrl+=', action: 'Zoom In' },
  { keys: 'Ctrl+-', action: 'Zoom Out' },
  { keys: 'Ctrl+0', action: 'Reset Zoom' },
  { keys: 'Escape', action: 'Close Panel' },
];

// ─── MCP Settings Sub-component ──────────────────────────────
function McpSettingsContent(): JSX.Element {
  const [wsConnected, setWsConnected] = createSignal(false);
  const [copiedMcp, setCopiedMcp] = createSignal(false);
  const [copiedWs, setCopiedWs] = createSignal(false);

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

  const WS_CONFIG = {
    name: 'vibestudio',
    transport: 'websocket',
    url: 'ws://127.0.0.1:49152',
  };

  const TOOLS = [
    { name: 'vibe_navigate', desc: 'Navigate active tab to URL', icon: '→' },
    { name: 'vibe_get_url', desc: 'Get current tab URL', icon: '🔗' },
    { name: 'vibe_get_content', desc: 'Extract page text content', icon: '📄' },
    { name: 'vibe_click', desc: 'Click element by CSS selector', icon: '🖱️' },
  ];

  onMount(() => {
    const check = () => {
      try {
        const ws = new WebSocket('ws://127.0.0.1:49152');
        ws.onopen = () => { setWsConnected(true); ws.close(); };
        ws.onerror = () => setWsConnected(false);
      } catch { setWsConnected(false); }
    };
    check();
    const timer = setInterval(check, 3000);
    onCleanup(() => clearInterval(timer));
  });

  const copy = async (text: string, setCopied: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { console.error('Copy failed:', e); }
  };

  return (
    <div>
      <div class="flex items-center gap-3 mb-6">
        <h2 class="text-sm font-medium text-[#e8e8e8]">MCP Server</h2>
        <div class={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${wsConnected() ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
          <div class={`w-1.5 h-1.5 rounded-full ${wsConnected() ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          {wsConnected() ? 'Online' : 'Offline'}
        </div>
      </div>

      {/* Connection Info */}
      <div class="mb-6 p-3 bg-[#111] border border-[#2a2a2a] rounded-lg">
        <div class="flex items-center justify-between mb-2">
          <span class="text-[10px] text-gray-500 uppercase tracking-wider">Endpoint</span>
          <span class="text-[10px] text-gray-500">ws://127.0.0.1:49152</span>
        </div>
        <div class="flex items-center gap-2">
          <code class="text-xs text-blue-400 font-mono bg-blue-500/10 px-2 py-1 rounded flex-1">ws://127.0.0.1:49152</code>
          <button
            onClick={() => copy('ws://127.0.0.1:49152', setCopiedWs)}
            class="text-[10px] px-2 py-1 rounded bg-[#1e1e1e] text-gray-400 hover:text-white transition-colors"
          >
            {copiedWs() ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Config Cards */}
      <div class="grid grid-cols-2 gap-3 mb-6">
        <div class="p-3 bg-[#111] border border-[#2a2a2a] rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] text-gray-500 uppercase tracking-wider">MCP Config</span>
            <button
              onClick={() => copy(JSON.stringify(MCP_CONFIG, null, 2), setCopiedMcp)}
              class="text-[10px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors"
            >
              {copiedMcp() ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre class="text-[9px] text-gray-500 font-mono overflow-x-auto">{JSON.stringify(MCP_CONFIG, null, 2)}</pre>
        </div>

        <div class="p-3 bg-[#111] border border-[#2a2a2a] rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] text-gray-500 uppercase tracking-wider">WebSocket (Slower)</span>
          </div>
          <pre class="text-[9px] text-gray-500 font-mono overflow-x-auto">{JSON.stringify(WS_CONFIG, null, 2)}</pre>
        </div>
      </div>

      {/* Tools */}
      <div class="mb-6">
        <div class="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Available Tools</div>
        <div class="space-y-2">
          <For each={TOOLS}>
            {(tool) => (
              <div class="flex items-center gap-3 p-2.5 bg-[#111] border border-[#2a2a2a] rounded-lg">
                <span class="text-xs w-5 text-center">{tool.icon}</span>
                <div class="flex-1 min-w-0">
                  <div class="text-xs text-gray-300 font-mono">{tool.name}</div>
                  <div class="text-[10px] text-gray-500">{tool.desc}</div>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* How to connect */}
      <div class="p-3 bg-[#111] border border-[#2a2a2a] rounded-lg">
        <div class="text-[10px] text-gray-500 uppercase tracking-wider mb-2">How to Connect</div>
        <ol class="space-y-1.5 text-[11px] text-gray-400">
          <li class="flex gap-2"><span class="text-blue-400 font-mono">1.</span> Copy the MCP Config above</li>
          <li class="flex gap-2"><span class="text-blue-400 font-mono">2.</span> Paste into your IDE's MCP settings (Cursor: .cursor/mcp.json)</li>
          <li class="flex gap-2"><span class="text-blue-400 font-mono">3.</span> Ask AI: "Use vibe_navigate to go to github.com"</li>
        </ol>
      </div>
    </div>
  );
}

export default function SettingsPage(props: SettingsPageProps): JSX.Element {
  const [section, setSection] = createSignal<Section>('general');
  const [settings, setSettings] = createSignal<Settings>(DEFAULT_SETTINGS);

  onMount(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('vibestudio_settings') || '{}');
      setSettings({ ...DEFAULT_SETTINGS, ...stored });
    } catch (e) { console.error('Failed to load settings:', e); }
  });

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem('vibestudio_settings', JSON.stringify(next));
      return next;
    });
  };

  const clearBrowsingData = () => {
    localStorage.removeItem('vibestudio_recent');
    localStorage.removeItem('vibestudio_downloads');
    localStorage.removeItem('vibestudio_history');
    alert('Browsing data cleared.');
  };

  const sections: { id: Section; label: string; icon: string }[] = [
    { id: 'general', label: 'General', icon: 'M12 2L2 7v10l10 5 10-5V7L12 2z' },
    { id: 'privacy', label: 'Privacy', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
    { id: 'mcp', label: 'MCP', icon: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4' },
    { id: 'appearance', label: 'Appearance', icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z' },
    { id: 'shortcuts', label: 'Shortcuts', icon: 'M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z' },
    { id: 'about', label: 'About', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm2 10H10v-1h1v-4h-1v-1h3v5h1v1z' },
  ];

  // ─── Toggle Component ───────────────────────────────────────
  const Toggle = (p: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => p.onChange(!p.checked)}
      class={`w-9 h-5 rounded-full transition-colors duration-200 relative ${
        p.checked ? 'bg-[#3b82f6]' : 'bg-[#333]'
      }`}
    >
      <div
        class={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform duration-200 ${
          p.checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );

  // ─── Setting Row ────────────────────────────────────────────
  const SettingRow = (p: { label: string; desc?: string; children: JSX.Element }) => (
    <div class="flex items-center justify-between py-3 border-b border-[#1e1e1e]">
      <div>
        <div class="text-xs text-[#e8e8e8]">{p.label}</div>
        <Show when={p.desc}>
          <div class="text-[10px] text-[#666] mt-0.5">{p.desc}</div>
        </Show>
      </div>
      <div class="flex-shrink-0 ml-4">{p.children}</div>
    </div>
  );

  return (
    <div class="absolute inset-0 bg-[#0d0d0d] z-50 flex">
      {/* Sidebar */}
      <div class="w-48 bg-[#111] border-r border-[#2a2a2a] py-4 flex flex-col gap-0.5">
        <div class="px-4 mb-4">
          <span class="text-sm font-medium text-[#e8e8e8]">Settings</span>
        </div>
        <For each={sections}>
          {(s) => (
            <button
              onClick={() => setSection(s.id)}
              class={`flex items-center gap-2 px-4 py-2 text-xs transition-colors ${
                section() === s.id
                  ? 'bg-[#1e1e1e] text-[#e8e8e8] border-r-2 border-[#3b82f6]'
                  : 'text-[#888] hover:bg-[#1a1a1a] hover:text-[#e8e8e8]'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="1.5">
                <path d={s.icon} />
              </svg>
              {s.label}
            </button>
          )}
        </For>

        <div class="mt-auto px-4">
          <button
            onClick={props.onClose}
            class="w-full text-xs text-[#888] hover:text-[#e8e8e8] py-2 text-left transition-colors"
          >
            ← Back to browser
          </button>
        </div>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto settings-scroll px-8 py-6 max-w-2xl">
        {/* ── General ── */}
        <Show when={section() === 'general'}>
          <h2 class="text-sm font-medium text-[#e8e8e8] mb-4">General</h2>

          <SettingRow label="Search Engine" desc="Default search engine for URL bar queries">
            <select
              value={settings().searchEngine}
              onChange={(e) => updateSetting('searchEngine', e.currentTarget.value)}
              class="bg-[#1e1e1e] text-[#e8e8e8] text-xs px-2 py-1 border border-[#2a2a2a] rounded-sm outline-none"
            >
              <option value="google">Google</option>
              <option value="duckduckgo">DuckDuckGo</option>
              <option value="bing">Bing</option>
            </select>
          </SettingRow>

          <SettingRow label="Homepage URL" desc="URL to load when clicking Home button">
            <input
              type="text"
              value={settings().homepageUrl}
              onInput={(e) => updateSetting('homepageUrl', e.currentTarget.value)}
              class="bg-[#1e1e1e] text-[#e8e8e8] text-xs px-2 py-1 border border-[#2a2a2a] rounded-sm outline-none w-48"
              placeholder="about:blank"
            />
          </SettingRow>

          <SettingRow label="Start with last session" desc="Restore tabs from previous session on startup">
            <Toggle
              checked={settings().startWithLastSession}
              onChange={(v) => updateSetting('startWithLastSession', v)}
            />
          </SettingRow>
        </Show>

        {/* ── Privacy ── */}
        <Show when={section() === 'privacy'}>
          <h2 class="text-sm font-medium text-[#e8e8e8] mb-4">Privacy & Security</h2>

          <SettingRow label="Ad Blocking" desc="Block ads and trackers using EasyList">
            <Toggle
              checked={settings().adBlocking}
              onChange={(v) => updateSetting('adBlocking', v)}
            />
          </SettingRow>

          <SettingRow label="Tracker Blocking" desc="Block known tracking domains">
            <Toggle
              checked={settings().trackerBlocking}
              onChange={(v) => updateSetting('trackerBlocking', v)}
            />
          </SettingRow>

          <SettingRow label="Do Not Track" desc="Send DNT header with requests">
            <Toggle
              checked={settings().doNotTrack}
              onChange={(v) => updateSetting('doNotTrack', v)}
            />
          </SettingRow>

          <SettingRow label="Clear Browsing Data" desc="Remove history, downloads, and cache">
            <button
              onClick={clearBrowsingData}
              class="bg-[#ef4444] text-white text-xs px-3 py-1 rounded-sm hover:bg-[#dc2626] transition-colors"
            >
              Clear All
            </button>
          </SettingRow>
        </Show>

        {/* ── MCP ── */}
        <Show when={section() === 'mcp'}>
          <McpSettingsContent />
        </Show>

        {/* ── Appearance ── */}
        <Show when={section() === 'appearance'}>
          <h2 class="text-sm font-medium text-[#e8e8e8] mb-4">Appearance</h2>

          <SettingRow label="Accent Color" desc="Primary accent color for UI elements">
            <input
              type="color"
              value={settings().accentColor}
              onInput={(e) => updateSetting('accentColor', e.currentTarget.value)}
              class="w-8 h-6 bg-transparent border border-[#2a2a2a] rounded-sm cursor-pointer"
            />
          </SettingRow>

          <SettingRow label="Font Size" desc="Text size in browser chrome">
            <select
              value={settings().fontSize}
              onChange={(e) => updateSetting('fontSize', e.currentTarget.value)}
              class="bg-[#1e1e1e] text-[#e8e8e8] text-xs px-2 py-1 border border-[#2a2a2a] rounded-sm outline-none"
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </SettingRow>

          <SettingRow label="Show Bookmarks Bar" desc="Display bookmarks bar below URL bar">
            <Toggle
              checked={settings().showBookmarksBar}
              onChange={(v) => updateSetting('showBookmarksBar', v)}
            />
          </SettingRow>
        </Show>

        {/* ── Shortcuts ── */}
        <Show when={section() === 'shortcuts'}>
          <h2 class="text-sm font-medium text-[#e8e8e8] mb-4">Keyboard Shortcuts</h2>
          <div class="border border-[#2a2a2a] rounded-sm overflow-hidden">
            <For each={SHORTCUTS}>
              {(s) => (
                <div class="flex items-center justify-between px-3 py-2.5 border-b border-[#1e1e1e] last:border-b-0">
                  <span class="text-xs text-[#e8e8e8]">{s.action}</span>
                  <kbd class="bg-[#1e1e1e] text-[#888] text-[10px] px-2 py-0.5 rounded-sm border border-[#333] font-mono">
                    {s.keys}
                  </kbd>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* ── About ── */}
        <Show when={section() === 'about'}>
          <h2 class="text-sm font-medium text-[#e8e8e8] mb-4">About VibeStudio</h2>

          <div class="space-y-3">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 bg-[#3b82f6] rounded-sm flex items-center justify-center text-white font-bold text-lg">V</div>
              <div>
                <div class="text-sm text-[#e8e8e8] font-medium">VibeStudio</div>
                <div class="text-[10px] text-[#666]">AI-Native Browser for Developers</div>
              </div>
            </div>

            <SettingRow label="Version">
              <span class="text-xs text-[#888] font-mono">0.1.0-alpha</span>
            </SettingRow>

            <SettingRow label="Check for Updates">
              <button class="bg-[#1e1e1e] text-[#e8e8e8] text-xs px-3 py-1 rounded-sm border border-[#2a2a2a] hover:bg-[#2a2a2a] transition-colors">
                Check Now
              </button>
            </SettingRow>

            <div class="flex gap-4 mt-6 text-[10px]">
              <a href="#" class="text-[#3b82f6] hover:underline">GitHub</a>
              <a href="#" class="text-[#3b82f6] hover:underline">Privacy Policy</a>
              <a href="#" class="text-[#3b82f6] hover:underline">Terms of Service</a>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
