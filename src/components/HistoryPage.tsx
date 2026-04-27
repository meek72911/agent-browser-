import { createSignal, createMemo, onMount, For, Show, type JSX } from 'solid-js';

interface HistoryEntry {
  url: string;
  title: string;
  time: number;
}

interface HistoryPageProps {
  onNavigate: (url: string) => void;
  onClose: () => void;
}

function groupByDate(entries: HistoryEntry[]): { label: string; items: HistoryEntry[] }[] {
  const groups: Map<string, HistoryEntry[]> = new Map();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;

  for (const entry of entries) {
    const entryDate = new Date(entry.time);
    const dayStart = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate()).getTime();
    
    let label: string;
    if (dayStart >= today) label = 'Today';
    else if (dayStart >= yesterday) label = 'Yesterday';
    else label = entryDate.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(entry);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch { return ''; }
}

function isDangerousUrl(url: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return lower === 'about:blank'
    || lower.startsWith('tauri://')
    || lower.startsWith('javascript:')
    || lower.startsWith('data:')
    || lower.startsWith('blob:');
}

export function addToHistory(url: string, title: string) {
  if (isDangerousUrl(url)) return;
  try {
    const stored: HistoryEntry[] = JSON.parse(localStorage.getItem('vibestudio_history') || '[]');
    // Deduplicate: remove if same URL visited in last 30 seconds
    const filtered = stored.filter(
      (e) => !(e.url === url && Date.now() - e.time < 30000)
    );
    filtered.unshift({ url, title: title || url, time: Date.now() });
    localStorage.setItem('vibestudio_history', JSON.stringify(filtered.slice(0, 500)));
  } catch (e) { console.error('Failed to add to history:', e); }
}

export function getHistoryCount(): number {
  try {
    return JSON.parse(localStorage.getItem('vibestudio_history') || '[]').length;
  } catch (e) { console.error('Failed to get history count:', e); return 0; }
}

export default function HistoryPage(props: HistoryPageProps): JSX.Element {
  const [history, setHistory] = createSignal<HistoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = createSignal('');

  onMount(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('vibestudio_history') || '[]');
      setHistory(stored);
    } catch (e) { console.error('Failed to load history:', e); }
  });

  const filteredHistory = () => {
    const q = searchQuery().toLowerCase();
    if (!q) return history();
    return history().filter(
      (e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q)
    );
  };

  const grouped = createMemo(() => groupByDate(filteredHistory()));

  const clearHistory = () => {
    localStorage.removeItem('vibestudio_history');
    setHistory([]);
  };

  const deleteEntry = (time: number, url: string) => {
    const updated = history().filter((e) => !(e.time === time && e.url === url));
    setHistory(updated);
    localStorage.setItem('vibestudio_history', JSON.stringify(updated));
  };

  return (
    <div class="absolute inset-0 bg-[#0a0a0a] z-50 flex flex-col">
      <div class="flex items-center gap-3 px-6 py-4 border-b border-[#1e1e1e]">
        <button onClick={props.onClose} class="nav-btn" title="Back">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="text-sm font-medium text-[#e8e8e8]">History</h1>
        <div class="flex-1" />

        <div class="relative">
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555]" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search history..."
            value={searchQuery()} 
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="bg-[#141414] border border-[#2a2a2a] rounded-md pl-8 pr-3 py-1.5 text-xs text-[#e8e8e8] placeholder-[#555] outline-none focus:border-[#3b82f6] w-56"
          />
        </div>

        <button
          onClick={clearHistory}
          class="text-xs text-[#ef4444] hover:text-[#dc2626] transition-colors px-2 py-1"
        >
          Clear All
        </button>
      </div>

      <div class="flex-1 overflow-y-auto settings-scroll px-6 py-4">
        <Show when={grouped().length > 0} fallback={
          <div class="text-center py-16">
            <div class="text-[#555] text-sm">No history yet</div>
            <div class="text-[#444] text-xs mt-1">Pages you visit will show up here</div>
          </div>
        }>
          <For each={grouped()}>
            {(group) => (
              <div class="mb-6">
                <div class="text-[10px] uppercase tracking-widest text-[#555] mb-2 font-medium sticky top-0 bg-[#0a0a0a] py-1">
                  {group.label} · {group.items.length} pages
                </div>
                <div class="space-y-0.5">
                  <For each={group.items}>
                    {(entry) => (
                      <div class="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-[#141414] transition-colors duration-100 group">
                        <span class="text-[10px] text-[#444] w-12 flex-shrink-0 tabular-nums">
                          {formatTime(entry.time)}
                        </span>
                        <img
                          src={getFaviconUrl(entry.url)}
                          alt=""
                          class="w-4 h-4 flex-shrink-0 rounded-sm"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <button
                          onClick={() => props.onNavigate(entry.url)}
                          class="flex-1 min-w-0 text-left"
                        >
                          <div class="text-xs text-[#ccc] truncate group-hover:text-[#e8e8e8] transition-colors">
                            {entry.title}
                          </div>
                          <div class="text-[10px] text-[#444] truncate">{entry.url}</div>
                        </button>
                        <button
                          onClick={() => deleteEntry(entry.time, entry.url)}
                          class="opacity-0 group-hover:opacity-100 text-[#555] hover:text-[#ef4444] transition-all text-xs p-1"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
