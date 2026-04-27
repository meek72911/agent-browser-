import { createSignal, onCleanup, type JSX } from 'solid-js';
import { invoke } from '@tauri-apps/api/core';

interface FindBarProps {
  onClose: () => void;
}

export default function FindBar(props: FindBarProps): JSX.Element {
  const [query, setQuery] = createSignal('');
  const [matchInfo, setMatchInfo] = createSignal('');

  onCleanup(() => {
    invoke('clear_find').catch(() => {});
  });

  const handleFind = async (forward: boolean = true) => {
    const q = query().trim();
    if (!q) return;
    try {
      const found = await invoke<boolean>('find_in_page', { query: q, forward });
      setMatchInfo(found ? 'Match found' : 'No matches');
    } catch (err) {
      console.error('Find error:', err);
      setMatchInfo('Error');
    }
  };

  const handleClose = async () => {
    try { await invoke('clear_find'); } catch (e) { console.error('Failed to clear find:', e); }
    props.onClose();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFind(!e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  };

  return (
    <div class="absolute bottom-0 left-0 right-0 h-10 bg-[#1a1a1a] border-t border-[#2a2a2a] flex items-center gap-2 px-3 z-50">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="#888" stroke-width="2" class="flex-shrink-0">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>

      <input
        type="text"
        value={query()}
        onInput={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        class="bg-[#0d0d0d] text-[#e8e8e8] text-xs px-2 py-1 border border-[#2a2a2a] rounded-sm outline-none focus:border-[#3b82f6] w-60"
        placeholder="Find in page..."
        autofocus
      />

      <button onClick={() => handleFind(false)} class="nav-btn" title="Previous (Shift+Enter)">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      <button onClick={() => handleFind(true)} class="nav-btn" title="Next (Enter)">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <span class="text-[10px] text-[#666] min-w-[60px]">{matchInfo()}</span>

      <button onClick={handleClose} class="nav-btn ml-auto" title="Close (Esc)">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
