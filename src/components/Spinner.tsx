/**
 * The "working" spinner shared by every place an agent is busy:
 * session rows, board-card badges, and the live terminal header. Purely
 * visual — callers may override size/border via `className`, and the owning
 * element supplies any a11y label.
 *
 * Honors `prefers-reduced-motion`: under reduced motion it renders a static
 * ring (still reads as "in progress" via the caller's label) instead of
 * spinning, which is a known vestibular trigger.
 */
export default function Spinner({
  className = "h-3 w-3 border-2",
}: {
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full border-line-strong border-t-accent motion-safe:animate-spin ${className}`}
    />
  );
}
