const PATHS = {
  gauge: 'M3.5 17a8.5 8.5 0 1 1 17 0M12 13.5l4-5.5M12 13.5h.01',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  bell: 'M18 9a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15 18 9zM10 20a2 2 0 0 0 4 0',
  car: 'M4 16.5V12l1.8-4.7A2 2 0 0 1 7.7 6h8.6a2 2 0 0 1 1.9 1.3L20 12v4.5M4 16.5h16M4 16.5v2h3v-2M17 16.5v2h3v-2M7.5 12.5h.01M16.5 12.5h.01',
  forklift:
    'M3 17v-6l3-4h5v10H3zM15 3v15M15 18h6M11 11h4M4.5 19.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M8.5 19.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
  users: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7',
  plus: 'M12 5v14M5 12h14',
  dots: 'M12 5.5h.01M12 12h.01M12 18.5h.01',
  close: 'M6 6l12 12M18 6L6 18',
  edit: 'M4 20h4.5L19 9.5 14.5 5 4 15.5V20zM12.5 7l4.5 4.5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3',
  warn: 'M12 4l9.5 16.5h-19L12 4zM12 10v4.5M12 17.5h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cross: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  logout: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h11',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  download: 'M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14',
  key: 'M14.5 9.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM10.5 13.5V20M10.5 17h3M10.5 20h2',
  fuel: 'M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M3 20h13M14 9h2.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V9l-3-3M7 8h5',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
