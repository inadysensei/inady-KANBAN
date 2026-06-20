"use client";

import { useDndContext, useDroppable } from "@dnd-kit/core";
import Link from "next/link";
import { ICON_SIZE_SM, IceBoxIcon } from "@/components/ui/icons";

/**
 * Count-only "Ice Box" tile shown next to To Do. Two jobs in one element:
 *  - a `next/link` to the `/icebox` list page (the whole tile is clickable), and
 *  - a drop target (`useDroppable({ id: "icebox" })`). The id matches the empty
 *    `icebox` bucket `groupByStatus` builds, so a card dropped here flows through
 *    `computeDragResult` → `moveTicket(id, "icebox", …)` like any column drop.
 * The count is the server-provided total (Board's `iceboxTotal`), so it updates a
 * beat after a drop lands (`revalidatePath`), not optimistically.
 */
export default function IceBoxTile({ count }: { count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: "icebox" });
  // While a card is being dragged, this tile is a drop target, not a link — so a
  // pointer-up that ends a drag over it must not also navigate to /icebox.
  const { active } = useDndContext();
  const noun = count === 1 ? "ticket" : "tickets";

  return (
    <Link
      ref={setNodeRef}
      href="/icebox"
      onClick={(e) => {
        if (active) e.preventDefault();
      }}
      aria-label={`Ice Box: ${count} ${noun}. Open the Ice Box list.`}
      className={`group flex w-22 shrink-0 flex-col items-center justify-between gap-2 rounded-lg border bg-surface/40 p-2 text-center transition-colors hover:border-line-strong hover:bg-surface focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60 ${
        isOver ? "border-accent bg-accent/10" : "border-line"
      }`}
    >
      <span className="rounded-md bg-panel px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
        Ice Box
      </span>
      <span className="flex flex-col items-center gap-1" aria-hidden>
        <IceBoxIcon size={ICON_SIZE_SM} className="text-faint" />
        <span className="text-3xl font-semibold tabular-nums leading-none text-fg">
          {count}
        </span>
        <span className="text-[10px] leading-none text-faint">{noun}</span>
      </span>
      <span
        className="text-[10px] font-medium text-muted transition-colors group-hover:text-accent"
        aria-hidden
      >
        View →
      </span>
    </Link>
  );
}
