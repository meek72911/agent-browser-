import { For, Show } from 'solid-js';
import type { JSX } from 'solid-js';

interface Tab {
  id: string;
  title: string;
  url: string;
  favicon: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTab: () => void;
  windowControls?: JSX.Element;
}

export default function TabBar(props: TabBarProps): JSX.Element {
  return (
    <div class="pencil-glass-chrome flex items-center h-9">
      <div class="flex items-center overflow-x-auto flex-1 min-w-0" data-tauri-drag-region>
        <For each={props.tabs}>
          {(tab) => (
            <div
              onClick={() => props.onTabClick(tab.id)}
              class={`tab-item flex items-center gap-1.5 px-3 h-full min-w-[60px] max-w-[200px] cursor-pointer transition-colors duration-[120ms] ${
                props.activeTabId === tab.id
                  ? 'bg-white/10 border-b-2 border-white/50'
                  : 'bg-transparent border-b-2 border-transparent hover:bg-white/5'
              }`}
            >
              <Show when={tab.favicon} fallback={
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"
                  viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"
                  class="flex-shrink-0"
                >
                  <circle cx="12" cy="12" r="10" />
                </svg>
              }>
                <img src={tab.favicon} alt="" class="w-3.5 h-3.5 flex-shrink-0" />
              </Show>

              <span class="text-xs text-white/80 truncate select-none flex-1">
                {tab.title}
              </span>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  props.onTabClose(tab.id);
                }}
                class="tab-close ml-auto text-white/40 hover:text-white opacity-0 transition-opacity duration-[120ms] flex-shrink-0 text-[10px] w-4 h-4 flex items-center justify-center rounded-sm hover:bg-white/10"
              >
                ✕
              </button>
            </div>
          )}
        </For>

        <button
          class="flex items-center justify-center w-7 h-7 ml-1 hover:bg-white/10 text-white/50 hover:text-white transition-colors duration-[120ms] flex-shrink-0 rounded-sm"
          onClick={props.onNewTab}
          title="New Tab (Ctrl+T)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {props.windowControls}
    </div>
  );
}