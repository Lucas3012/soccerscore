export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="ss-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#ss-badge)" />
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="16"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.18"
        strokeWidth="2"
      />
      <circle cx="34" cy="33.8" r="16.5" fill="#f8fafc" />
      <path
        d="M34 27.2 40.9 32.2 38.3 40.4 29.7 40.4 27.1 32.2Z"
        fill="#0b1524"
      />
      <g stroke="#0b1524" strokeWidth="2.2" strokeLinecap="round">
        <path d="M34 27.2V17.4" />
        <path d="M40.9 32.2l9.8-3.2" />
        <path d="M38.3 40.4l6 8.3" />
        <path d="M29.7 40.4l-6 8.3" />
        <path d="M27.1 32.2l-9.8-3.2" />
      </g>
      <g stroke="#ffffff" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round">
        <path d="M8 23h4" />
        <path d="M6 33.5h5" />
        <path d="M8 44h4" />
      </g>
      <path
        d="M47 9.5l2.7 5.8 5.8 2.7-5.8 2.7L47 26.5l-2.7-5.8-5.8-2.7 5.8-2.7Z"
        fill="#fbbf24"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark className="h-8 w-8 shrink-0" />
      <span className="text-xl font-black italic tracking-tight text-white leading-none">
        Soccer<span className="text-emerald-400">Score</span>
      </span>
    </span>
  );
}
