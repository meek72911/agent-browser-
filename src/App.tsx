import { createSignal, createEffect, onMount, onCleanup, Show, type JSX } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import './App.css';
import LoadingBar from './components/LoadingBar';
import TabBar from './components/TabBar';
import UrlBar from './components/UrlBar';
import FindBar from './components/FindBar';
import DownloadsPanel from './components/DownloadsPanel';
import Toast from './components/Toast';
import SettingsPage from './components/SettingsPage';
import NewTabPage from './components/NewTabPage';
import HistoryPage, { addToHistory } from './components/HistoryPage';
import IdeConnectPage from './components/IdeConnectPage';

export interface Tab {
  id: string;
  title: string;
  url: string;
  favicon: string;
  backendId?: string;
  zoomLevel?: number;
  isLoading?: boolean;
  loadProgress?: number;
}

export interface ToastData {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const getHostname = (url: string): string => {
  try { return new URL(url).hostname; } catch { return url; }
};

const getDomain = (url: string): string => {
  try { return new URL(url).hostname; } catch { return ''; }
};

const getFaviconUrl = (url: string): string => {
  const domain = getDomain(url);
  if (!domain) return '';
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
};

const truncateTitle = (title: string, max: number = 20): string => {
  if (title.length <= max) return title;
  return title.substring(0, max) + '…';
};

export function smartNavigate(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed === 'about:blank') return 'about:blank';
  const hasProtocol = trimmed.startsWith('http://') || trimmed.startsWith('https://');
  const looksLikeUrl = trimmed.includes('.') && !trimmed.includes(' ') && trimmed.length > 4;
  if (hasProtocol) return trimmed;
  if (looksLikeUrl) return 'https://' + trimmed;
  return 'https://www.google.com/search?q=' + encodeURIComponent(trimmed);
}

function addRecentSite(url: string, title: string) {
  if (!url || url === 'about:blank') return;
  try {
    const stored = JSON.parse(localStorage.getItem('vibestudio_recent') || '[]');
    const filtered = stored.filter((s: any) => s.url !== url);
    filtered.unshift({ url, title, time: Date.now() });
    localStorage.setItem('vibestudio_recent', JSON.stringify(filtered.slice(0, 8)));
  } catch (e) { console.error('Failed to save recent site:', e); }
}

function getBookmarks() {
  try {
    return JSON.parse(localStorage.getItem('vibestudio_bookmarks') || '[]');
  } catch (e) { console.error('Failed to get bookmarks:', e); return []; }
}

function isBookmarked(url: string): boolean {
  return getBookmarks().some((b: any) => b.url === url);
}

function toggleBookmark(url: string, title: string, favicon: string): boolean {
  const bookmarks = getBookmarks();
  const exists = bookmarks.findIndex((b: any) => b.url === url);
  if (exists >= 0) {
    bookmarks.splice(exists, 1);
    localStorage.setItem('vibestudio_bookmarks', JSON.stringify(bookmarks));
    return false;
  } else {
    bookmarks.unshift({ url, title, favicon, addedAt: Date.now() });
    localStorage.setItem('vibestudio_bookmarks', JSON.stringify(bookmarks.slice(0, 50)));
    return true;
  }
}

let toastCounter = 0;

function App(): JSX.Element {
  const [tabs, setTabs] = createSignal<Tab[]>([]);
  const [activeTabId, setActiveTabId] = createSignal('');
  const [currentUrl, setCurrentUrl] = createSignal('');
  const [showFind, setShowFind] = createSignal(false);
  const [showDownloads, setShowDownloads] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);
  const [showHistory, setShowHistory] = createSignal(false);
  const [toasts, setToasts] = createSignal<ToastData[]>([]);
  const [blockedCount, setBlockedCount] = createSignal(0);
  const [showHomePage, setShowHomePage] = createSignal(true);
  const [showIdeConnect, setShowIdeConnect] = createSignal(false);
  const [isCurrentBookmarked, setIsCurrentBookmarked] = createSignal(false);
  const [mcpConnected, setMcpConnected] = createSignal(false);
  const [detectedIdes, setDetectedIdes] = createSignal<string[]>([]);

  // Derived: active tab object
  const activeTab = () => tabs().find((t) => t.id === activeTabId());

  // ─── Overlay: hide/show native tabs ───
  createEffect(() => {
    const isOpen = showHomePage() || showSettings() || showDownloads() || showFind() || showHistory() || showIdeConnect();
    if (isOpen) {
      invoke('hide_tabs').catch(() => {});
    } else {
      invoke('show_tabs').catch(() => {});
    }
  });

  const openSettings = () => { closeAllOverlays(); setShowSettings(true); };
  const closeSettings = () => setShowSettings(false);

  const closeAllOverlays = () => {
    setShowFind(false);
    setShowDownloads(false);
    setShowHistory(false);
    setShowSettings(false);
    setShowIdeConnect(false);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}-${++toastCounter}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  // ─── Navigation ───
  const handleNavigate = async (input: string) => {
    if (!input.trim()) return;
    const target = smartNavigate(input);
    if (!target) return;

    const prevUrl = currentUrl();
    const prevShowHome = showHomePage();
    const tabId = activeTabId();

    setCurrentUrl(target);
    const shouldShowHome = target === 'about:blank' || target === '';
    setShowHomePage(shouldShowHome);
    setShowHistory(false);

    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId
          ? { ...t, url: target, favicon: getFaviconUrl(target), isLoading: !shouldShowHome, loadProgress: 0.3 }
          : t
      )
    );

    try {
      await invoke('navigate_direct', { url: target });
    } catch (error) {
      console.error('Navigation error:', error);
      // Revert state on failure
      setCurrentUrl(prevUrl);
      setShowHomePage(prevShowHome);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, url: prevUrl, favicon: getFaviconUrl(prevUrl), isLoading: false, loadProgress: 0 }
            : t
        )
      );
      showToast('Navigation failed', 'error');
    }
  };

  const handleBack = () => invoke('go_back').catch(() => {});
  const handleForward = () => invoke('go_forward').catch(() => {});
  const handleReload = () => invoke('reload').catch(() => {});

  // ─── Bookmarks ───
  const handleToggleBookmark = () => {
    const url = currentUrl();
    if (!url || url === 'about:blank') return;
    const tab = activeTab();
    const title = tab?.title || getHostname(url);
    const favicon = tab?.favicon || getFaviconUrl(url);
    const added = toggleBookmark(url, title, favicon);
    setIsCurrentBookmarked(added);
    showToast(added ? 'Bookmark added ✓' : 'Bookmark removed', 'success');
  };

  // ─── Zoom (per-tab) ───
  const getZoom = () => activeTab()?.zoomLevel ?? 1.0;
  const setZoom = (level: number) => {
    const tabId = activeTabId();
    setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, zoomLevel: level } : t));
    invoke('set_zoom', { level }).catch(() => {});
  };

  const handleZoomIn = () => {
    const next = Math.min(getZoom() + 0.1, 3.0);
    setZoom(next);
  };
  const handleZoomOut = () => {
    const next = Math.max(getZoom() - 0.1, 0.3);
    setZoom(next);
  };
  const handleZoomReset = () => setZoom(1.0);

  // ─── Tab Management ───
  const handleNewTab = async () => {
    const frontendId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const backendId = await invoke<string>('create_tab');
      setTabs((prev) => [
        ...prev,
        { id: frontendId, title: 'New Tab', url: '', favicon: '', backendId, zoomLevel: 1.0 },
      ]);
      setActiveTabId(frontendId);
      setCurrentUrl('');
      setShowHomePage(true);
      closeAllOverlays();
    } catch (e) {
      console.warn('Tab creation failed:', e);
      setTabs((prev) => [
        ...prev,
        { id: frontendId, title: 'New Tab', url: '', favicon: '', zoomLevel: 1.0 },
      ]);
      setActiveTabId(frontendId);
      setCurrentUrl('');
      setShowHomePage(true);
      closeAllOverlays();
    }
  };

  const handleTabClick = async (id: string) => {
    const tab = tabs().find((t) => t.id === id);
    if (!tab) return;

    setActiveTabId(id);
    setCurrentUrl(tab.url);
    setShowHomePage(tab.url === '' || tab.url === 'about:blank');
    closeAllOverlays();
    setIsCurrentBookmarked(isBookmarked(tab.url));

    // Apply stored zoom when switching tabs
    if (tab.zoomLevel && tab.zoomLevel !== 1.0) {
      invoke('set_zoom', { level: tab.zoomLevel }).catch(() => {});
    }

    if (tab.backendId) {
      try {
        await invoke('switch_tab', { tabId: tab.backendId });
      } catch (e) {
        try {
          const newBackendId = await invoke<string>('create_tab', { url: tab.url || 'about:blank' });
          setTabs((prev) => prev.map((t) => t.id === id ? { ...t, backendId: newBackendId } : t));
          await invoke('switch_tab', { tabId: newBackendId });
        } catch (e2) {}
      }
    } else {
      try {
        const newBackendId = await invoke<string>('create_tab', { url: tab.url || 'about:blank' });
        setTabs((prev) => prev.map((t) => t.id === id ? { ...t, backendId: newBackendId } : t));
        await invoke('switch_tab', { tabId: newBackendId });
      } catch (e2) {}
    }
  };

  const handleTabClose = async (id: string) => {
    if (tabs().length <= 1) return;
    const tab = tabs().find((t) => t.id === id);
    if (!tab) return;

    const index = tabs().findIndex((t) => t.id === id);
    const newTabs = tabs().filter((t) => t.id !== id);
    setTabs(newTabs);

    if (tab.backendId) {
      try {
        await invoke('close_tab', { tabId: tab.backendId });
      } catch (e) {
        console.warn('Tab close failed:', e);
      }
    }

    if (activeTabId() === id) {
      const newIndex = Math.min(index, newTabs.length - 1);
      const next = newTabs[newIndex];
      if (!next) return;

      setActiveTabId(next.id);
      setCurrentUrl(next.url);
      setShowHomePage(next.url === '' || next.url === 'about:blank');
      setIsCurrentBookmarked(isBookmarked(next.url));

      if (next.backendId) {
        try {
          await invoke('switch_tab', { tabId: next.backendId });
        } catch (e) {
          try {
            const newBackendId = await invoke<string>('create_tab', { url: next.url || 'about:blank' });
            setTabs((prev) => prev.map((t) => t.id === next.id ? { ...t, backendId: newBackendId } : t));
            await invoke('switch_tab', { tabId: newBackendId });
          } catch (e2) {}
        }
      } else {
        try {
          const newBackendId = await invoke<string>('create_tab', { url: next.url || 'about:blank' });
          setTabs((prev) => prev.map((t) => t.id === next.id ? { ...t, backendId: newBackendId } : t));
          await invoke('switch_tab', { tabId: newBackendId });
        } catch (e2) {}
      }
    }
  };

  // ─── Keyboard Shortcuts ───
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      const el = document.getElementById('url-input') as HTMLInputElement;
      el?.focus(); el?.select();
    } else if (e.ctrlKey && e.key === 't') {
      e.preventDefault(); handleNewTab();
    } else if (e.ctrlKey && e.key === 'w') {
      e.preventDefault(); handleTabClose(activeTabId());
    } else if (e.ctrlKey && e.key === 'r') {
      e.preventDefault(); handleReload();
    } else if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      if (showFind()) {
        setShowFind(false);
        invoke('clear_find').catch(() => {});
      } else {
        closeAllOverlays();
        setShowFind(true);
      }
    } else if (e.ctrlKey && e.key === 'j') {
      e.preventDefault();
      if (showDownloads()) {
        setShowDownloads(false);
      } else {
        closeAllOverlays();
        setShowDownloads(true);
      }
    } else if (e.ctrlKey && e.key === 'h') {
      e.preventDefault();
      if (showHistory()) {
        setShowHistory(false);
      } else {
        closeAllOverlays();
        setShowHistory(true);
      }
    } else if (e.ctrlKey && e.key === 'd') {
      e.preventDefault(); handleToggleBookmark();
    } else if (e.ctrlKey && e.key === '=') {
      e.preventDefault(); handleZoomIn();
    } else if (e.ctrlKey && e.key === '-') {
      e.preventDefault(); handleZoomOut();
    } else if (e.ctrlKey && e.key === '0') {
      e.preventDefault(); handleZoomReset();
    } else if (e.key === 'Escape') {
      if (showFind()) {
        setShowFind(false);
        invoke('clear_find').catch(() => {});
      }
      setShowDownloads(false);
      setShowHistory(false);
      if (showSettings()) closeSettings();
      if (showIdeConnect()) setShowIdeConnect(false);
    }
  };

  // ─── Lifecycle ───
  onMount(async () => {
    window.addEventListener('keydown', handleKeyDown);

    const cleanups: Array<() => void> = [];
    onCleanup(() => {
      window.removeEventListener('keydown', handleKeyDown);
      cleanups.forEach((fn) => fn());
      invoke('save_session').catch(() => {});
    });

    const register = async <T,>(event: string, handler: (payload: T) => void) => {
      const unlisten = await listen<T>(event, (e) => handler(e.payload));
      cleanups.push(unlisten);
    };

    // ── Create tabs from session or fresh ──
    const createInitialTabs = async () => {
      try {
        const sessionTabs = await invoke<any[]>('restore_session').catch(() => []);
        const newTabs: Tab[] = [];
        let activeId = '';
        let activeBackendId = '';

        if (sessionTabs.length > 0) {
          for (let i = 0; i < sessionTabs.length; i++) {
            const st = sessionTabs[i];
            const url = st.url || 'about:blank';
            const backendId = await invoke<string>('create_tab', { url });
            const frontendId = `${Date.now() + i}-${Math.random().toString(36).slice(2, 6)}`;
            newTabs.push({
              id: frontendId,
              title: st.title || 'New Tab',
              url,
              favicon: getFaviconUrl(url),
              backendId,
              zoomLevel: 1.0,
            });
            if (st.active) {
              activeId = frontendId;
              activeBackendId = backendId;
            }
          }
          showToast('Session restored', 'info');
        } else {
          const backendId = await invoke<string>('create_tab', { url: 'about:blank' });
          const frontendId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          newTabs.push({ id: frontendId, title: 'New Tab', url: '', favicon: '', backendId, zoomLevel: 1.0 });
          activeId = frontendId;
          activeBackendId = backendId;
        }

        setTabs(newTabs);
        setActiveTabId(activeId);

        if (activeBackendId) {
          try {
            await invoke('switch_tab', { tabId: activeBackendId });
          } catch (e) {
            console.warn('Failed to switch to restored active tab:', e);
          }
        }

        if (activeId) {
          const tab = newTabs.find(t => t.id === activeId);
          if (tab) {
            setCurrentUrl(tab.url);
            setShowHomePage(tab.url === '' || tab.url === 'about:blank');
            setIsCurrentBookmarked(isBookmarked(tab.url));
          }
        }
      } catch (e) {
        console.error('Failed to create initial tabs:', e);
      }
    };

    await createInitialTabs();

    // ── Listen for backend IDE detection ──
    await register<{ ides: string[] }>('ides-detected', (payload) => {
      console.log('[AutoConnect] Backend detected IDEs:', payload.ides);
      setDetectedIdes(payload.ides);
      // Just show the banner — don't force open IDE connect page
    });

    // Listen for backend navigation-started (from MCP) — immediately hide overlay
    await register<{ url: string }>('navigation-started', (payload) => {
      console.log('[MCP] Navigation started:', payload.url);
      setCurrentUrl(payload.url);
      setShowHomePage(false);
      setShowIdeConnect(false);
    });

    // MCP connection checker
    const checkMcp = () => {
      try {
        const ws = new WebSocket('ws://127.0.0.1:49152');
        ws.onopen = () => { setMcpConnected(true); ws.close(); };
        ws.onerror = () => setMcpConnected(false);
        ws.onclose = () => {};
      } catch { setMcpConnected(false); }
    };
    checkMcp();
    const mcpInterval = setInterval(checkMcp, 5000);
    cleanups.push(() => clearInterval(mcpInterval));

    // Page loaded event (from child webview injection) — matches by backendId
    await register<{ tab_id: string; url: string; title?: string }>('page-loaded', (payload) => {
      const tabId = tabs().find(t => t.backendId === payload.tab_id)?.id;
      if (!tabId) return;

      setTabs((prev) =>
        prev.map((t) =>
          t.backendId === payload.tab_id
            ? {
                ...t,
                url: payload.url,
                title: payload.title ? truncateTitle(payload.title) : t.title,
                favicon: getFaviconUrl(payload.url),
                isLoading: false,
                loadProgress: 1,
              }
            : t
        )
      );

      // Only update global state if this is the currently active tab
      if (tabId === activeTabId()) {
        if (payload.url && payload.url !== 'about:blank') {
          setCurrentUrl(payload.url);
          setShowHomePage(false);
        }
        addToHistory(payload.url, payload.title || getHostname(payload.url));
        addRecentSite(payload.url, payload.title || getHostname(payload.url));
        setIsCurrentBookmarked(isBookmarked(payload.url));
      }
    });

    // Tab activated (after close_tab switches tabs or create_tab)
    await register<{ tab_id: string; url: string; title?: string }>('tab-activated', (payload) => {
      const frontendTab = tabs().find(t => t.backendId === payload.tab_id);
      if (frontendTab) {
        setActiveTabId(frontendTab.id);
        setCurrentUrl(payload.url);
        setShowHomePage(payload.url === '' || payload.url === 'about:blank');
        setIsCurrentBookmarked(isBookmarked(payload.url));
      }
    });

    // Page title updates (from MutationObserver in child webview) — matches by backendId
    await register<{ tab_id: string; title: string }>('page-title-updated', (payload) => {
      if (!payload.title?.trim()) return;
      setTabs((prev) =>
        prev.map((t) =>
          t.backendId === payload.tab_id
            ? { ...t, title: truncateTitle(payload.title) }
            : t
        )
      );
    });

    // Download events
    await register<any>('download-progress', (payload) => {
      try {
        const stored = JSON.parse(localStorage.getItem('vibestudio_downloads') || '[]');
        const existing = stored.findIndex((d: any) => d.id === payload.guid);
        if (existing >= 0) {
          const progress = payload.progress ?? stored[existing].progress;
          stored[existing] = {
            ...stored[existing],
            progress,
            status: payload.state === 'completed' ? 'complete' : payload.state === 'canceled' ? 'failed' : 'downloading',
          };
        } else {
          stored.unshift({
            id: payload.guid || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            filename: payload.suggestedFilename || 'download',
            size: payload.totalBytes ? `${(payload.totalBytes / 1024 / 1024).toFixed(1)} MB` : 'Unknown',
            progress: payload.progress ?? 0,
            status: 'downloading',
            url: payload.url || '',
          });
        }
        localStorage.setItem('vibestudio_downloads', JSON.stringify(stored.slice(0, 50)));
      } catch (e) { console.error('Failed to track download:', e); }
    });

    // Ad-block counter updates
    await register<{ count: number }>('ad-blocked', (payload) => {
      setBlockedCount(payload.count);
    });
  });

  const isNewTab = () => {
    const tab = activeTab();
    return !tab || !tab.url || tab.url === '' || tab.url === 'about:blank';
  };

  const currentZoom = () => activeTab()?.zoomLevel ?? 1.0;
  const isLoading = () => activeTab()?.isLoading ?? false;
  const loadProgress = () => activeTab()?.loadProgress ?? 0;

  return (
    <div class="flex flex-col h-full bg-transparent text-[#e8e8e8] overflow-hidden relative">
      <LoadingBar isLoading={isLoading()} progress={loadProgress()} />

      <TabBar
        tabs={tabs()}
        activeTabId={activeTabId()}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onNewTab={handleNewTab}
        windowControls={
          <div class="flex items-center flex-shrink-0 h-full ml-1">
            <button
              onClick={() => invoke('minimize_window')}
              class="flex items-center justify-center hover:bg-white/10 text-white/50 hover:text-white w-[46px] h-full transition-colors"
              title="Minimize"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              onClick={() => invoke('toggle_maximize')}
              class="flex items-center justify-center hover:bg-white/10 text-white/50 hover:text-white w-[46px] h-full transition-colors"
              title="Maximize"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            </button>
            <button
              onClick={() => invoke('close_window')}
              class="flex items-center justify-center hover:bg-[#c0392b]/80 hover:text-white text-white/50 w-[46px] h-full transition-colors"
              title="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="12" /><line x1="6" y1="6" x2="18" y2="12" />
              </svg>
            </button>
          </div>
        }
      />

      {/* IDE Detection Banner */}
      <Show when={detectedIdes().length > 0 && !showIdeConnect()}>
        <div class="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border-b border-purple-500/20">
          <div class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
          <span class="text-[11px] text-purple-300">
            Detected {detectedIdes().join(', ')} —
          </span>
          <button
            onClick={() => { closeAllOverlays(); setShowIdeConnect(true); }}
            class="text-[11px] text-purple-400 hover:text-purple-200 underline underline-offset-2"
          >
            Connect IDE
          </button>
          <button
            onClick={() => setDetectedIdes([])}
            class="ml-auto text-[10px] text-gray-500 hover:text-gray-300"
          >
            Dismiss
          </button>
        </div>
      </Show>

      <div class="pencil-glass-chrome flex items-center gap-3 px-3 h-11">
        <button onClick={handleBack} class="nav-btn" title="Back (Alt+←)">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <button onClick={handleForward} class="nav-btn" title="Forward (Alt+→)">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
        <button onClick={handleReload} class="nav-btn" title="Reload (Ctrl+R)">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <UrlBar
          url={currentUrl()}
          onNavigate={handleNavigate}
          isLoading={isLoading()}
          favicon={activeTab()?.favicon || ''}
        />
        <Show when={Math.abs(currentZoom() - 1.0) > 0.01}>
          <button onClick={handleZoomReset} class="text-[10px] text-white/50 hover:text-white px-1.5 flex-shrink-0" title="Reset zoom">
            {Math.round(currentZoom() * 100)}%
          </button>
        </Show>
        <Show when={!isNewTab()}>
          <button onClick={handleToggleBookmark} class="nav-btn" title="Bookmark (Ctrl+D)">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
              fill={isCurrentBookmarked() ? '#f59e0b' : 'none'}
              stroke={isCurrentBookmarked() ? '#f59e0b' : 'currentColor'}
              stroke-width="2"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </Show>
        <button onClick={() => { if (showHistory()) setShowHistory(false); else { closeAllOverlays(); setShowHistory(true); } }} class="nav-btn" title="History (Ctrl+H)">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
        <button onClick={() => { if (showDownloads()) setShowDownloads(false); else { closeAllOverlays(); setShowDownloads(true); } }} class="nav-btn relative" title="Downloads (Ctrl+J)">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <div class="nav-btn relative" title={`${blockedCount()} ads/trackers blocked`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <Show when={blockedCount() > 0}>
            <span class="absolute -top-1 -right-1 bg-[#3b82f6] text-white text-[8px] w-3.5 h-3.5 rounded-full flex items-center justify-center">
              {blockedCount() > 99 ? '99+' : blockedCount()}
            </span>
          </Show>
        </div>

        <button
          onClick={() => { closeAllOverlays(); setShowIdeConnect(true); }}
          class="nav-btn relative"
          title={mcpConnected() ? 'MCP server online — click to connect IDE' : 'MCP server offline'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={mcpConnected() ? '#a78bfa' : 'rgba(255,255,255,0.5)'} stroke-width="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <Show when={detectedIdes().length > 0 && !mcpConnected()}>
            <span class="absolute -top-1 -right-1 bg-amber-500 text-white text-[7px] w-3 h-3 rounded-full flex items-center justify-center animate-pulse">{detectedIdes().length}</span>
          </Show>
          <Show when={mcpConnected()}>
            <span class="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border border-black/20" />
          </Show>
        </button>

        <button onClick={() => showSettings() ? closeSettings() : openSettings()} class="nav-btn" title="Settings">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
      </div>

      <Show when={showHomePage() && !showSettings() && !showHistory() && !showDownloads() && !showFind() && !showIdeConnect()}>
        <NewTabPage
          onNavigate={handleNavigate}
          blockedCount={blockedCount()}
          onOpenHistory={() => { closeAllOverlays(); setShowHistory(true); }}
          onOpenSettings={openSettings}
          onOpenDownloads={() => { closeAllOverlays(); setShowDownloads(true); }}
        />
      </Show>

      <Show when={showIdeConnect()}>
        <IdeConnectPage
          onNavigate={(url) => {
            setShowIdeConnect(false);
            if (url) handleNavigate(url);
          }}
          onClose={() => setShowIdeConnect(false)}
          detectedIdes={detectedIdes()}
        />
      </Show>

      <Show when={showHistory()}>
        <div class="absolute inset-0 z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowHistory(false); }}>
          <HistoryPage
            onNavigate={(url) => { setShowHistory(false); handleNavigate(url); }}
            onClose={() => setShowHistory(false)}
          />
        </div>
      </Show>

      <Show when={showFind()}>
        <div class="absolute inset-0 z-50" onClick={(e) => { if (e.target === e.currentTarget) { setShowFind(false); invoke('clear_find').catch(() => {}); } }}>
          <FindBar onClose={() => { setShowFind(false); invoke('clear_find').catch(() => {}); }} />
        </div>
      </Show>

      <Show when={showDownloads()}>
        <div class="absolute inset-0 z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowDownloads(false); }}>
          <DownloadsPanel onClose={() => setShowDownloads(false)} />
        </div>
      </Show>

      <Show when={showSettings()}>
        <div class="absolute inset-0 z-50" onClick={(e) => { if (e.target === e.currentTarget) closeSettings(); }}>
          <SettingsPage onClose={closeSettings} />
        </div>
      </Show>

      <div class="fixed bottom-4 right-4 flex flex-col gap-2 z-[100]">
        {toasts().map((t) => (
          <Toast message={t.message} type={t.type} />
        ))}
      </div>
    </div>
  );
}

export default App;
