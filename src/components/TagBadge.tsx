import type { Tag } from "@/db/schema";

/**
 * A colored tag pill. The tag's hex color drives a translucent background +
 * solid text + subtle border via inline styles (Tailwind can't take a runtime
 * color). Stored colors are normalized 6-digit hex (normalizeTagColor), so the
 * `${color}` + 2-hex alpha suffix yields a valid 8-digit RGBA.
 */
export default function TagBadge({
  tag,
  size = "sm",
}: {
  tag: Pick<Tag, "name" | "color">;
  size?: "sm" | "xs";
}) {
  const pad =
    size === "xs" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium leading-none ${pad}`}
      style={{
        backgroundColor: `${tag.color}24`,
        color: tag.color,
        border: `1px solid ${tag.color}55`,
      }}
    >
      {tag.name}
    </span>
  );
}
