import type {SVGProps} from "react";

/// Inline single-colour icons. A pack would be a dependency and a bundle cost
/// for the dozen glyphs the two screens actually use.
type P = SVGProps<SVGSVGElement>;

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Svg({children, ...p}: P) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden {...p}>
      {children}
    </svg>
  );
}

export function BoltIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M13.5 2 4 13.5h6L9.5 22 20 10.5h-6.5L13.5 2Z" fill="currentColor" />
    </Svg>
  );
}

export function HomeIcon(p: P) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M3.5 10.5 12 3.5l8.5 7" />
      <path {...stroke} d="M5.5 9.5V20h13V9.5" />
    </Svg>
  );
}

export function PlayIcon(p: P) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M8.5 6.2 17 12l-8.5 5.8V6.2Z" />
    </Svg>
  );
}

export function HistoryIcon(p: P) {
  return (
    <Svg {...p}>
      <circle {...stroke} cx="12" cy="12" r="8.5" />
      <path {...stroke} d="M12 7v5.2l3.4 2" />
    </Svg>
  );
}

export function ProfileIcon(p: P) {
  return (
    <Svg {...p}>
      <circle {...stroke} cx="12" cy="8.5" r="3.5" />
      <path {...stroke} d="M4.8 20c.7-3.6 3.6-5.6 7.2-5.6s6.5 2 7.2 5.6" />
    </Svg>
  );
}

export function SettingsIcon(p: P) {
  return (
    <Svg {...p}>
      <circle {...stroke} cx="12" cy="12" r="3" />
      <path
        {...stroke}
        d="M12 2.8v2.1M12 19.1v2.1M21.2 12h-2.1M4.9 12H2.8M18.5 5.5l-1.5 1.5M7 17l-1.5 1.5M18.5 18.5 17 17M7 7 5.5 5.5"
      />
    </Svg>
  );
}

export function UsersIcon(p: P) {
  return (
    <Svg {...p}>
      <circle {...stroke} cx="9" cy="8.5" r="3.2" />
      <path {...stroke} d="M2.8 19.5c.6-3.2 3.1-5 6.2-5s5.6 1.8 6.2 5" />
      <path {...stroke} d="M16.4 5.8a3.2 3.2 0 0 1 0 6M18 14.9c2.2.5 3.5 2.2 3.9 4.6" />
    </Svg>
  );
}

export function PlusIcon(p: P) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M12 5.5v13M5.5 12h13" />
    </Svg>
  );
}

export function ArrowRightIcon(p: P) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M4.5 12h14M13 6.5l5.5 5.5L13 17.5" />
    </Svg>
  );
}

export function ArrowLeftIcon(p: P) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M19.5 12h-14M11 6.5 5.5 12 11 17.5" />
    </Svg>
  );
}

export function CheckIcon(p: P) {
  return (
    <Svg {...p}>
      <path {...stroke} strokeWidth={2.6} d="m5 12.6 4.6 4.6L19 7.5" />
    </Svg>
  );
}

export function CrossIcon(p: P) {
  return (
    <Svg {...p}>
      <path {...stroke} strokeWidth={2.6} d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Svg>
  );
}

export function ClockIcon(p: P) {
  return (
    <Svg {...p}>
      <circle {...stroke} cx="12" cy="12" r="8.5" />
      <path {...stroke} d="M12 7.2V12l3.2 1.9" />
    </Svg>
  );
}

export function BrainIcon(p: P) {
  return (
    <Svg {...p}>
      <path
        {...stroke}
        d="M9.5 4.2a2.7 2.7 0 0 0-2.7 2.7A2.6 2.6 0 0 0 5 9.4c0 1 .5 1.8 1.3 2.3A2.6 2.6 0 0 0 5.6 14c0 1.5 1.2 2.7 2.7 2.7v1.1a2 2 0 0 0 4 0V4.9a2 2 0 0 0-2.8-.7Z"
      />
      <path
        {...stroke}
        d="M14.5 4.2a2.7 2.7 0 0 1 2.7 2.7A2.6 2.6 0 0 1 19 9.4c0 1-.5 1.8-1.3 2.3.5.5.7 1.2.7 2.3 0 1.5-1.2 2.7-2.7 2.7v1.1a2 2 0 0 1-4 0"
      />
    </Svg>
  );
}

export function TrophyIcon(p: P) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0V4Z" />
      <path {...stroke} d="M7.5 5.5H5a2.5 2.5 0 0 0 2.5 4M16.5 5.5H19a2.5 2.5 0 0 1-2.5 4" />
      <path {...stroke} d="M12 13v3.5M8.8 20h6.4M9.8 20l.5-3.5h3.4l.5 3.5" />
    </Svg>
  );
}

export function JoinIcon(p: P) {
  return (
    <Svg {...p}>
      <circle {...stroke} cx="9.5" cy="8.5" r="3.2" />
      <path {...stroke} d="M3.5 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
      <path {...stroke} d="M18 7v6M15 10h6" />
    </Svg>
  );
}

export function SunIcon(p: P) {
  return (
    <Svg {...p}>
      <circle {...stroke} cx="12" cy="12" r="4" />
      <path
        {...stroke}
        d="M12 2.8v1.9M12 19.3v1.9M21.2 12h-1.9M4.7 12H2.8M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4M18.5 18.5l-1.4-1.4M6.9 6.9 5.5 5.5"
      />
    </Svg>
  );
}

export function MoonIcon(p: P) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z" />
    </Svg>
  );
}

export function WalletIcon(p: P) {
  return (
    <Svg {...p}>
      <path {...stroke} d="M3.5 7.5A2 2 0 0 1 5.5 5.5h11a2 2 0 0 1 2 2v1" />
      <path {...stroke} d="M3.5 7.5v9a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-13" />
      <circle cx="16.8" cy="13.5" r="1.2" fill="currentColor" />
    </Svg>
  );
}

export function LockIcon(p: P) {
  return (
    <Svg {...p}>
      <rect {...stroke} x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path {...stroke} d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" />
    </Svg>
  );
}

export function DotsIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="5.5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="18.5" r="1.6" fill="currentColor" />
    </Svg>
  );
}

export function CoinIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.18" />
      <circle {...stroke} cx="12" cy="12" r="9" />
      <path {...stroke} d="M12 7.5 15 12l-3 4.5L9 12l3-4.5Z" />
    </Svg>
  );
}
