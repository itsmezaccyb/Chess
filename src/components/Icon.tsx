// Inline SVG icons. Unicode symbols like ▶ or 👍 render as color emoji on iOS, so we avoid them.

const PATHS = {
  star: <path fill="currentColor" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />,
  thumb: (
    <path
      fill="currentColor"
      d="M2 10h4v11H2zM8 21h9.5a2 2 0 0 0 1.95-1.55l1.5-6.5A2 2 0 0 0 19 10.5h-5.5l.8-4.2a1.8 1.8 0 0 0-3.3-1.3L8 10z"
    />
  ),
  check: <path fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />,
  cross: <path fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  square: <rect x="6" y="6" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2.6" />,
  first: <path fill="currentColor" d="M5 5h2.5v14H5zM19 5v14L9 12z" />,
  prev: <path fill="currentColor" d="M17 5v14L7 12z" />,
  next: <path fill="currentColor" d="M7 5v14l10-7z" />,
  last: <path fill="currentColor" d="M16.5 5H19v14h-2.5zM5 5v14l10-7z" />,
  flip: (
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8 20V4M4 8l4-4 4 4M16 4v16M12 16l4 4 4-4"
    />
  ),
  back: <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M11 6l-6 6 6 6" />,
  external: (
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
    />
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
