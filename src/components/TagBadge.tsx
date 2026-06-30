import type { Tag } from "@/db/schema";

/**
 * A colored tag pill. The tag's hex color drives a translucent background +
 * solid text + subtle border via inline styles (Tailwind can't take a runtime
 * color). Stored colors are normalized 6-digit hex (normalizeTagColor), so the
 * `${color}` + 2-hex alpha suffix yields a valid 8-digit RGBA.
 *
 * Static by default (a `<span>`). Pass `onClick` to render it as a clickable
 * `<button>` — the board uses this for tag-click filtering — and `active` for
 * the selected (filtering) treatment.
 */
export default function TagBadge({
  tag,
  size = "sm",
  active = false,
  onClick,
  title,
}: {
  tag: Pick<Tag, "name" | "color">;
  size?: "sm" | "xs";
  /** Stronger fill + solid border — the chip is currently an active filter. */
  active?: boolean;
  /** When set, render an interactive `<button>` (a filter toggle) not a span. */
  onClick?: () => void;
  title?: string;
}) {
  const pad =
    size === "xs" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-xs";
  const base = `inline-flex items-center rounded-full font-medium leading-none ${pad}`;
  // Active = stronger fill + a solid (full-opacity) border so the selected chip
  // reads as "on" against any tag color, with no assumption about text contrast
  // on a filled pill.
  const style = {
    backgroundColor: `${tag.color}${active ? "40" : "24"}`,
    color: tag.color,
    border: `1px solid ${tag.color}${active ? "" : "55"}`,
  };

  if (!onClick) {
    return (
      <span className={base} style={style} title={title}>
        {tag.name}
      </span>
    );
  }
  return (
    <button
      type="button"
      // The chip sits on a card; stop the click from bubbling to card-level
      // handlers (and `type=button` keeps it out of any form submit).
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-pressed={active}
      title={title}
      className={`${base} cursor-pointer transition-colors hover:brightness-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60`}
      style={style}
    >
      {tag.name}
    </button>
  );
}
