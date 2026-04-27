import { type JSX } from 'solid-js';

interface LoadingBarProps {
  isLoading: boolean;
  progress: number;
}

export default function LoadingBar(props: LoadingBarProps): JSX.Element {
  const width = () => props.progress * 100;
  const opacity = () => props.progress >= 1 ? 0 : 1;

  return (
    <div
      class="fixed top-0 left-0 right-0 h-0.5 bg-[#0d0d0d] z-50"
      style={{ opacity: opacity() }}
    >
      <div
        class="h-full bg-[#3b82f6] transition-all duration-200 ease"
        style={{ width: `${width()}%` }}
      />
    </div>
  );
}
