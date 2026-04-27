import { createSignal, onMount, For, Show, type JSX } from 'solid-js';

interface Download {
  id: string;
  filename: string;
  size: string;
  progress: number;
  status: 'downloading' | 'complete' | 'failed';
  url: string;
}

interface DownloadsPanelProps {
  onClose: () => void;
}

export default function DownloadsPanel(props: DownloadsPanelProps): JSX.Element {
  const [downloads, setDownloads] = createSignal<Download[]>([]);

  onMount(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('vibestudio_downloads') || '[]');
      setDownloads(stored);
    } catch (e) { console.error('Failed to load downloads:', e); }
  });

  const clearCompleted = () => {
    const active = downloads().filter((d) => d.status === 'downloading');
    setDownloads(active);
    localStorage.setItem('vibestudio_downloads', JSON.stringify(active));
  };

  return (
    <div class="absolute bottom-0 left-0 right-0 h-[200px] bg-[#141414] border-t border-[#2a2a2a] slide-up z-50 flex flex-col">
      {/* Header */}
      <div class="flex items-center justify-between px-3 h-8 border-b border-[#2a2a2a] flex-shrink-0">
        <span class="text-xs text-[#e8e8e8] font-medium">Downloads</span>
        <div class="flex items-center gap-2">
          <button
            onClick={clearCompleted}
            class="text-[10px] text-[#888] hover:text-[#e8e8e8] transition-colors"
          >
            Clear completed
          </button>
          <button onClick={props.onClose} class="nav-btn" style={{ width: '20px', height: '20px' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* List */}
      <div class="flex-1 overflow-y-auto settings-scroll">
        <Show
          when={downloads().length > 0}
          fallback={
            <div class="flex items-center justify-center h-full text-xs text-[#666]">
              No downloads yet
            </div>
          }
        >
          <For each={downloads()}>
            {(dl) => (
              <div class="flex items-center gap-3 px-3 py-2 border-b border-[#1e1e1e] hover:bg-[#1a1a1a]">
                {/* File icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="#3b82f6" stroke-width="2" class="flex-shrink-0">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>

                <div class="flex-1 min-w-0">
                  <div class="text-xs text-[#e8e8e8] truncate">{dl.filename}</div>
                  <div class="text-[10px] text-[#666]">{dl.size}</div>
                  <Show when={dl.status === 'downloading'}>
                    <div class="w-full h-1 bg-[#2a2a2a] rounded-full mt-1">
                      <div
                        class="h-full bg-[#3b82f6] rounded-full transition-all duration-300"
                        style={{ width: `${dl.progress}%` }}
                      />
                    </div>
                  </Show>
                </div>

                <Show when={dl.status === 'complete'}>
                  <span class="text-[10px] text-[#22c55e]">Done</span>
                </Show>
                <Show when={dl.status === 'failed'}>
                  <span class="text-[10px] text-[#ef4444]">Failed</span>
                </Show>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
