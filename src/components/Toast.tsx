import { createSignal, onCleanup, onMount, type JSX } from 'solid-js';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function Toast(props: ToastProps): JSX.Element {
  const [visible, setVisible] = createSignal(false);
  const [exiting, setExiting] = createSignal(false);

  onMount(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setVisible(true), 10));
    timers.push(setTimeout(() => {
      setExiting(true);
      timers.push(setTimeout(() => setVisible(false), 300));
    }, 3000));
    onCleanup(() => timers.forEach(clearTimeout));
  });

  const config = () => {
    switch (props.type) {
      case 'success':
        return {
          bg: 'rgba(34, 197, 94, 0.95)',
          border: 'rgba(34, 197, 94, 0.5)',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ),
        };
      case 'error':
        return {
          bg: 'rgba(239, 68, 68, 0.95)',
          border: 'rgba(239, 68, 68, 0.5)',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ),
        };
      case 'info':
      default:
        return {
          bg: 'rgba(59, 130, 246, 0.95)',
          border: 'rgba(59, 130, 246, 0.5)',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          ),
        };
    }
  };

  return (
    <div
      class={`transition-all duration-300 ${
        visible() ? (exiting() ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0') : 'opacity-0 translate-x-4'
      }`}
    >
      <div
        class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white shadow-2xl backdrop-blur-xl border min-w-[280px]"
        style={{
          "background": config().bg,
          "border-color": config().border,
          "box-shadow": `0 0 30px ${config().bg.replace('0.95', '0.3')}`,
        }}
      >
        <span class="flex-shrink-0">{config().icon}</span>
        <span class="flex-1 truncate">{props.message}</span>
        <button
          onClick={() => { setExiting(true); setTimeout(() => setVisible(false), 300); }}
          class="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity ml-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}