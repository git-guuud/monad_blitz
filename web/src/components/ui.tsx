"use client";

import type {ReactNode} from "react";
import {useCallback, useEffect, useState} from "react";
import {ArrowRightIcon, BoltIcon, MoonIcon, SunIcon, WalletIcon} from "./icons";
import {THEME_KEY} from "@/lib/theme";

export function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/* ------------------------------------------------------------------ theme */

export function ThemeToggle({tone = "light"}: {tone?: "light" | "dark"}) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // the boot script already applied it; mirror it into React after hydration
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // private mode: the toggle still works, it just will not be remembered
      }
      return next;
    });
  }, []);

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className={[
        "grid h-9 w-9 place-items-center rounded-lg border transition",
        tone === "dark"
          ? "border-rail-3 text-rail-muted hover:text-rail-text"
          : "border-border text-muted hover:border-border-strong hover:text-text",
      ].join(" ")}
    >
      {theme === "dark" ? <MoonIcon width={17} height={17} /> : <SunIcon width={17} height={17} />}
    </button>
  );
}

/* -------------------------------------------------------------- app shell */

export function Brand({size = "md"}: {size?: "sm" | "md"}) {
  return (
    <span className="flex items-center gap-2">
      <BoltIcon
        className="text-brand"
        width={size === "sm" ? 18 : 22}
        height={size === "sm" ? 18 : 22}
      />
      <span
        className={`font-bold tracking-tight text-rail-text ${
          size === "sm" ? "text-base" : "text-lg"
        }`}
      >
        Quiz<span className="text-brand">Blitz</span>
      </span>
    </span>
  );
}

/// The rail is dark in both themes by design, so it is written against the
/// fixed `rail-*` tokens rather than the semantic ones.
///
/// It carries no navigation. The design had Home / Play / History / Profile /
/// Settings, but only two screens exist and the host reaches its one directly by
/// URL — so the tabs were either duplicates of where you already are or links to
/// nothing. A brand mark and the wallet you are actually spending from is the
/// whole of what the rail has to say.
function Rail({balance, walletHref}: {balance?: ReactNode; walletHref?: string}) {
  return (
    <aside className="hidden w-56 shrink-0 flex-col justify-between border-r border-rail-3 bg-rail px-3 py-5 lg:flex">
      <div className="px-2">
        <Brand />
      </div>

      {balance && (
        <div className="rounded-xl border border-rail-3 bg-rail-2 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rail-muted">
            Balance
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-action/20 text-action">
              <BoltIcon width={13} height={13} />
            </span>
            <span className="text-lg font-bold text-rail-text">{balance}</span>
          </div>
          <a
            href={walletHref ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-action px-3 py-2 text-xs font-bold text-white transition hover:bg-action-strong"
          >
            <WalletIcon width={14} height={14} />
            Wallet
          </a>
        </div>
      )}
    </aside>
  );
}

/// Players are on phones and hosts are on a projector, so the rail collapses to
/// a brand bar below `lg` rather than a drawer nobody would open mid-question.
function MobileBar({right}: {right?: ReactNode}) {
  return (
    <div className="flex items-center justify-between border-b border-rail-3 bg-rail px-4 py-3 lg:hidden">
      <Brand size="sm" />
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}

export function AppShell({
  balance,
  walletHref,
  mobileRight,
  children,
}: {
  balance?: ReactNode;
  walletHref?: string;
  mobileRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <MobileBar right={mobileRight} />
      <Rail balance={balance} walletHref={walletHref} />
      <main className="flex min-w-0 flex-1 flex-col bg-bg">{children}</main>
    </div>
  );
}

/* ------------------------------------------------------------- primitives */

export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "li";
}) {
  return (
    <Tag
      className={`rounded-2xl border border-border bg-surface p-5 ${className}`}
      style={{boxShadow: "var(--shadow)"}}
    >
      {children}
    </Tag>
  );
}

export function Label({children, className = ""}: {children: ReactNode; className?: string}) {
  return (
    <p
      className={`text-[11px] font-semibold uppercase tracking-[0.16em] text-muted ${className}`}
    >
      {children}
    </p>
  );
}

export function Mono({children}: {children: ReactNode}) {
  return <span className="font-mono text-sm">{children}</span>;
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "action" | "brand" | "outline" | "ghost";
  size?: "md" | "lg";
  className?: string;
  type?: "button" | "submit";
};

const VARIANTS = {
  action: "bg-action text-white hover:bg-action-strong",
  brand: "bg-brand text-white hover:bg-brand-strong",
  outline: "border border-border-strong bg-surface text-text hover:border-action hover:text-action",
  ghost: "text-muted hover:text-text",
} as const;

export function Button({
  children,
  onClick,
  disabled,
  variant = "action",
  size = "md",
  className = "",
  type = "button",
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition",
        "disabled:cursor-not-allowed disabled:opacity-45",
        size === "lg" ? "px-6 py-3.5 text-base" : "px-4 py-2.5 text-sm",
        VARIANTS[variant],
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function Pill({
  children,
  tone = "idle",
}: {
  children: ReactNode;
  tone?: "idle" | "brand" | "action" | "warn" | "danger";
}) {
  const tones = {
    idle: "border-border text-muted",
    brand: "border-brand/40 bg-brand/10 text-brand-strong",
    action: "border-action/40 bg-action/10 text-action",
    warn: "border-warn/40 bg-warn/10 text-warn",
    danger: "border-danger/40 bg-danger/10 text-danger",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/// Counts blocks, not seconds — the same unit the contract enforces. The
/// seconds figure beside it is a courtesy translation at 400ms a block; the
/// bar itself can never disagree with the chain.
export function BlockBar({
  left,
  total,
  tone = "brand",
  className = "",
}: {
  left: number;
  total: number;
  tone?: "brand" | "action";
  className?: string;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (left / total) * 100)) : 0;
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-surface-3 ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-200 ease-linear ${
          tone === "brand" ? "bg-brand" : "bg-action"
        }`}
        style={{width: `${pct}%`}}
      />
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  align = "left",
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <Label>{label}</Label>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Banner({tone, children}: {tone: "info" | "error"; children: ReactNode}) {
  return (
    <p
      className={[
        "rounded-xl border px-4 py-3 text-sm",
        tone === "error"
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-border bg-surface-2 text-muted",
      ].join(" ")}
    >
      {children}
    </p>
  );
}

export {ArrowRightIcon};
