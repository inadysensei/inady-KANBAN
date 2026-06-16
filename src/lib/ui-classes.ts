/**
 * Pure class-name resolvers for the unified design system. No React/DOM — these
 * just build Tailwind strings from the semantic tokens (see tailwind.config.ts
 * + globals.css), so the look of every button/input/card/badge lives in one
 * tested place instead of being copy-pasted per component.
 */

/** Join class fragments, dropping falsy ones (tiny local clsx). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * `primary` is the one filled CTA (accent). The rest are outline buttons:
 * `secondary` (neutral), `ghost` (bare), and the semantic tints `destructive`
 * (red), `success` (green), and `accent` (violet) for color-coded actions.
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "success"
  | "accent";
export type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50 disabled:pointer-events-none";

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "gap-1.5 px-2.5 py-1 text-xs",
  md: "gap-2 px-3 py-1.5 text-sm",
};

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent/90",
  secondary: "border border-line-strong bg-surface text-fg hover:bg-panel",
  ghost: "text-muted hover:bg-surface hover:text-fg",
  destructive: "border border-danger/40 text-danger hover:bg-danger/10",
  success: "border border-ok/40 text-ok hover:bg-ok/10",
  accent: "border border-accent/40 text-accent hover:bg-accent/10",
};

export function buttonClass(
  opts: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    extra?: string;
  } = {},
): string {
  const { variant = "primary", size = "md", extra } = opts;
  return cx(BUTTON_BASE, BUTTON_SIZE[size], BUTTON_VARIANT[variant], extra);
}

export type IconButtonTone = "default" | "danger" | "accent";

const ICON_BUTTON_BASE =
  "inline-flex items-center justify-center rounded-md border border-line text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50 disabled:pointer-events-none";

const ICON_BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
};

const ICON_BUTTON_TONE: Record<IconButtonTone, string> = {
  default: "hover:bg-surface hover:text-fg",
  danger: "hover:border-danger/40 hover:bg-danger/10 hover:text-danger",
  accent: "hover:border-accent/40 hover:bg-accent/10 hover:text-accent",
};

export function iconButtonClass(
  opts: {
    tone?: IconButtonTone;
    size?: ButtonSize;
    extra?: string;
  } = {},
): string {
  const { tone = "default", size = "md", extra } = opts;
  return cx(
    ICON_BUTTON_BASE,
    ICON_BUTTON_SIZE[size],
    ICON_BUTTON_TONE[tone],
    extra,
  );
}

const INPUT_BASE =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint transition-colors focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50";

/** Shared field treatment for inputs / textareas / selects. */
export function inputClass(extra?: string): string {
  return cx(INPUT_BASE, extra);
}

const CARD_BASE = "rounded-lg border border-line bg-card";

/** Bordered card surface; callers add their own padding via `extra`. */
export function cardClass(extra?: string): string {
  return cx(CARD_BASE, extra);
}

export type BadgeTone = "neutral" | "ok" | "warn" | "danger" | "accent";

const BADGE_BASE =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium leading-none";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-panel text-muted",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/15 text-danger",
  accent: "bg-accent/15 text-accent",
};

export function badgeClass(tone: BadgeTone = "neutral", extra?: string): string {
  return cx(BADGE_BASE, BADGE_TONE[tone], extra);
}
