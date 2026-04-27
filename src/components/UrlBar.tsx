import { createSignal, createEffect, type JSX } from 'solid-js';

interface UrlBarProps {
  url: string;
  onNavigate: (url: string) => void;
  isLoading: boolean;
  favicon: string;
}

export default function UrlBar(props: UrlBarProps): JSX.Element {
  const [inputValue, setInputValue] = createSignal('');
  const [isFocused, setIsFocused] = createSignal(false);
  const [faviconError, setFaviconError] = createSignal(false);

  // Sync inputValue with props.url when not focused
  createEffect(() => {
    if (!isFocused()) {
      setInputValue(props.url);
    }
    return props.url;
  });

  const handleFocus = () => {
    setIsFocused(true);
    setInputValue(props.url);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const val = inputValue().trim();
    if (!val) return;
    props.onNavigate(val);
  };

  const displayUrl = () => {
    if (isFocused()) return inputValue();
    return props.url || '';
  };

  const renderIcon = (): JSX.Element => {
    if (props.isLoading) {
      return (
        <svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" width="12" height="12"
          viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5">
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      );
    }

    if (props.favicon && !faviconError() && props.url) {
      return (
        <img
          src={props.favicon}
          alt=""
          width="14"
          height="14"
          style={{ "image-rendering": "auto" }}
          onError={() => setFaviconError(true)}
        />
      );
    }

    if (props.url && props.url.startsWith('https')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"
          viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    }

    if (props.url && props.url.startsWith('http:')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"
          viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    }

    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"
        viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z" />
      </svg>
    );
  };

  // Reset favicon error when URL changes
  createEffect((prevUrl) => {
    if (props.url !== prevUrl) {
      setFaviconError(false);
    }
    return props.url;
  }, props.url);

  return (
    <form onSubmit={handleSubmit} class="flex-1 min-w-0">
      <div class="relative flex items-center">
        <div class="absolute left-3 flex items-center pointer-events-none z-10">
          {renderIcon()}
        </div>

        <input
          id="url-input"
          type="text"
          value={displayUrl()}
          onInput={(e) => setInputValue(e.currentTarget.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          class="w-full bg-white/10 text-white text-xs pl-8 pr-3 py-[5px] font-mono outline-none rounded-md transition-colors duration-[120ms] placeholder-white/40"
          classList={{
            'bg-white/15 ring-1 ring-white/20': isFocused()
          }}
          placeholder="Search or enter URL..."
        />
      </div>
    </form>
  );
}