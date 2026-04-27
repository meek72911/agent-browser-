import { createSignal, createEffect, onCleanup, onMount, type JSX } from 'solid-js';

interface NewTabPageProps {
  onNavigate: (url: string) => void;
  blockedCount: number;
  onOpenHistory?: () => void;
  onOpenSettings?: () => void;
  onOpenDownloads?: () => void;
}

async function fetchWeather(): Promise<{ temp: number; code: number } | null> {
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
    );
    const { latitude, longitude } = pos.coords;
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
    );
    const data = await res.json();
    return { temp: Math.round(data.current_weather.temperature), code: data.current_weather.weathercode };
  } catch {
    return null;
  }
}

function weatherIcon(code: number): string {
  if (code <= 1) return 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 8a4 4 0 0 0 0 8'; // clear/sunny
  if (code <= 3) return 'M17.5 19a2.5 2.5 0 0 1-1.86-4.11A4.5 4.5 0 1 0 2 14.5a4.5 4.5 0 0 0 2 3.74M17.5 19a2.5 2.5 0 0 0 0-5'; // cloudy
  if (code <= 48) return 'M17.5 19a2.5 2.5 0 0 1-1.06-4.76M8 17.5A3.5 3.5 0 0 1 8 10.59M17.5 19H8'; // foggy
  if (code <= 67) return 'M7 16.1A5 5 0 0 0 12 8a5 5 0 0 0 5 4.1M7 20h10'; // rain
  return 'M17.5 19a2.5 2.5 0 0 1-1.86-4.11A4.5 4.5 0 1 0 2 14.5a4.5 4.5 0 0 0 2 3.74M17.5 19a2.5 2.5 0 0 0 0-5'; // default cloudy
}

export default function NewTabPage(props: NewTabPageProps): JSX.Element {
  const [searchInput, setSearchInput] = createSignal('');
  const [currentTime, setCurrentTime] = createSignal(new Date());
  const [mounted, setMounted] = createSignal(false);
  const [activeNav, setActiveNav] = createSignal('home');
  const [temperature, setTemperature] = createSignal<number | null>(null);
  const [weatherCode, setWeatherCode] = createSignal(0);

  onMount(() => {
    fetchWeather().then((w) => {
      if (w) {
        setTemperature(w.temp);
        setWeatherCode(w.code);
      }
    });
  });

  createEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    onCleanup(() => clearInterval(timer));
  });

  const formatTime = () => currentTime().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: false });

  const handleSearch = (e: Event) => {
    e.preventDefault();
    const val = searchInput().trim();
    if (!val) return;
    props.onNavigate(val);
  };

  return (
    <div class="absolute top-[80px] left-0 right-0 bottom-0 z-50 overflow-hidden new-tab-bg flex">

      {/* --- SIDEBAR --- */}
      <div
        class="hidden sm:flex flex-col items-center py-4 justify-between pencil-glass-sidebar w-20 flex-shrink-0 my-4 ml-4 rounded-3xl transition-all duration-1000"
        classList={{ 'opacity-100 translate-x-0': mounted(), 'opacity-0 -translate-x-4': !mounted() }}
      >
        <div class="flex flex-col items-center gap-4 w-full px-2">
          {[
            ['home', 'Home', 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22 9 12 15 12 15 22'],
            ['discover', 'Discover', 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20'],
            ['spaces', 'Spaces', 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'],
            ['memories', 'Memories', 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'],
          ].map(([key, label, path]) => (
            <button
              onClick={() => {
                setActiveNav(key);
                if (key === 'memories') props.onOpenHistory?.();
                if (key === 'spaces') props.onOpenDownloads?.();
              }}
              class={`flex flex-col items-center gap-1.5 w-full py-3 rounded-2xl transition-all ${
                activeNav() === key ? 'bg-white/10 border border-white/50' : 'hover:bg-white/5'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                class={activeNav() === key ? 'text-white' : 'text-white/70'}
              >
                <path d={path} />
              </svg>
              <span class={`text-[10px] font-semibold ${activeNav() === key ? 'text-white' : 'text-white/70'}`}>{label}</span>
            </button>
          ))}
        </div>

        <div class="flex flex-col items-center gap-6">
          <div class="w-10 h-10 rounded-full overflow-hidden border-2 border-white/20">
            <div class="w-full h-full bg-gradient-to-br from-amber-300 to-amber-600" />
          </div>
          <button onClick={() => props.onOpenSettings?.()} class="hover:scale-105 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-white/70">
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </div>

      {/* --- MAIN CONTENT AREA --- */}
      <div class="flex-1 flex flex-col items-center justify-center relative min-w-0 w-full">

        {/* --- WEATHER WIDGET (Top Right) --- */}
        <div class={`absolute top-4 right-4 transition-all duration-1000 ${mounted() ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}>
          <div class="linen-widget px-[6px] py-[6px] flex items-center h-14 w-[min(180px,40vw)]">
            <div class="flex items-center gap-[6px] pl-3 flex-1 min-w-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" stroke-width="1"><path d={weatherIcon(weatherCode())} /></svg>
              <span
                class="text-amber-700 font-semibold text-sm hidden sm:inline"
                style="text-shadow: 0 0 4px rgba(245, 158, 11, 0.4);"
              >{temperature() !== null ? `${temperature()}°` : '—'}</span>
            </div>
            <div class="w-px h-4 bg-[#A39281]/30 mx-1 sm:mx-2" />
            <div class="widget-screen h-full flex items-center justify-center px-2 sm:px-4 min-w-[56px]">
              <span class="text-amber-glow font-bold tracking-[0.5px] text-xs sm:text-sm tabular-nums">{formatTime()}</span>
            </div>
          </div>
        </div>

        {/* --- CENTER HERO CARD --- */}
        <div class={`pencil-glass-card flex flex-col px-6 sm:px-12 py-6 sm:py-8 gap-4 sm:gap-5 w-[calc(100%-32px)] max-w-[560px] transition-all duration-1000 ${
          mounted() ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'
        }`}>
          <h1 class="text-[#1C1917]" style="font-family: 'Playfair Display', serif; font-size: clamp(32px, 8vw, 48px); font-weight: 600;">
            VibeStudio
          </h1>
          <div class="w-px h-3 bg-[#1C1917]/30" />
          <p class="text-[#57534E] font-sans text-[11px] sm:text-[13px] font-medium tracking-[1px]">
            A next-generation AI browser that thinks & builds with you
          </p>
        </div>
      </div>

      {/* --- BOTTOM SEARCH + PILLS --- */}
      <div class={`absolute inset-x-0 bottom-6 sm:bottom-8 flex flex-col items-center pointer-events-none transition-all duration-1000 delay-300 ${mounted() ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <div class="flex flex-col gap-3 sm:gap-4 w-[calc(100%-16px)] max-w-[600px] px-2">

          {/* Pills */}
          <div class="flex flex-wrap items-center justify-center gap-2 sm:gap-3 pointer-events-auto">
            {[
              ['Summarize this page', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2 14 8 20 8M16 13 8 13M16 17 8 17'],
              ['Compare products', 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'],
              ['Find similar ideas', 'M11 11a8 8 0 0 1 0 0h0M21 21l-4.35-4.35'],
              ['Explain this', 'M9 18h6M10 22h4M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14'],
            ].map(([label, path]) => (
              <button class="pencil-glass-pill px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-[#1A1A1A] hover:bg-white/50 transition-all flex items-center gap-1.5 sm:gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" class="sm:w-[14px] sm:h-[14px]" viewBox="0 0 24 24" fill="none" stroke="#4A4A4A" stroke-width="2"><path d={path} /></svg>
                <span class="hidden xs:inline">{label}</span>
                <span class="xs:hidden sm:hidden">{label.split(' ')[0]}</span>
              </button>
            ))}
            <button class="pencil-glass-pill w-8 h-8 sm:w-[38px] sm:h-[38px] flex items-center justify-center hover:bg-white/50 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4A4A4A" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
            </button>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} class="w-full pointer-events-auto">
            <div class="relative flex items-center bg-white/60 backdrop-blur-[60px] border border-white/50 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.12)] rounded-[32px] h-12 sm:h-14 px-2 sm:px-[10px]">
              <div class="flex items-center gap-2 sm:gap-3 flex-1 pl-2 sm:pl-3 min-w-0">
                <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" class="sm:w-[18px] sm:h-[18px]" viewBox="0 0 24 24" fill="none" stroke="#57534E" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <input
                  type="text"
                  value={searchInput()}
                  onInput={(e) => setSearchInput(e.currentTarget.value)}
                  placeholder="Ask AI or type a URL..."
                  class="flex-1 bg-transparent text-[13px] sm:text-[14px] text-[#57534E] placeholder-[#57534E]/60 outline-none font-sans min-w-0"
                  autofocus
                />
              </div>
              <button type="submit" class="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#1C1917] flex items-center justify-center hover:bg-black transition-colors flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" class="sm:w-[18px] sm:h-[18px]" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </form>
        </div>
      </div>

    </div>
  );
}