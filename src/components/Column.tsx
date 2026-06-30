"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Tag, Ticket, TicketStatus } from "@/db/schema";
import type { SessionStatusCounts } from "@/lib/board-order";
import type { DateFormat } from "@/lib/date-format";
import type { TagChip } from "@/lib/tags";
import { badgeClass } from "@/lib/ui-classes";
import TicketCard from "./TicketCard";

/** Per-status tint for the column title chip — colors just the title (not the
 *  whole column), reusing the semantic tokens: To Do = neutral, Doing = accent,
 *  WIP = amber (parked / set aside), Done = green. */
const HEADER_TONE: Record<TicketStatus, string> = {
  todo: "bg-panel text-muted",
  doing: "bg-accent/15 text-accent",
  wip: "bg-warn/15 text-warn",
  done: "bg-ok/15 text-ok",
  // Ice Box is never rendered as a Column (it's the count-only IceBoxTile); this
  // entry exists only to satisfy the Record<TicketStatus> type.
  icebox: "bg-panel text-muted",
};

export default function Column({
  status,
  title,
  tickets,
  sessionCounts,
  ticketTags,
  allTags,
  activeTagIds,
  onToggleTag,
  totalOverride,
  dateFormat,
  now,
}: {
  status: TicketStatus;
  title: string;
  tickets: Ticket[];
  sessionCounts: Record<string, SessionStatusCounts>;
  /** ticketId → its tag chips (board display). */
  ticketTags: Record<string, TagChip[]>;
  /** Every configured tag — for each card's on-card tag editor. */
  allTags: Tag[];
  /** Tag ids in the board filter — threaded to each card's chips. */
  activeTagIds: string[];
  /** Toggle a tag in the board filter (a card chip click). */
  onToggleTag: (tagId: string) => void;
  /** When the column is truncated (Done shows only the latest N), the true
   *  total — rendered as "shown / total". */
  totalOverride?: number;
  dateFormat: DateFormat;
  /** Server render time, threaded to each card's deadline countdown. */
  now: number;
}) {
  // The column itself is droppable so cards can be dropped into empty space /
  // an empty column (over.id === status).
  const { setNodeRef, isOver } = useDroppable({ id: status });

  const truncated = totalOverride != null && totalOverride > tickets.length;

  return (
    <div className="flex min-w-72 flex-1 basis-0 flex-col rounded-lg border border-line bg-surface/40">
      <div className="flex items-center justify-between px-3 py-2.5">
        <h2
          className={`rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider ${HEADER_TONE[status]}`}
        >
          {title}
        </h2>
        <span
          className={badgeClass("neutral")}
          title={truncated ? `Showing the latest ${tickets.length}` : undefined}
        >
          {truncated ? `${tickets.length} / ${totalOverride}` : tickets.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-1 flex-col gap-2 p-2 transition-colors ${
          isOver ? "bg-accent/10" : ""
        }`}
      >
        <SortableContext
          items={tickets.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tickets.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              sessionCounts={sessionCounts[t.id]}
              tags={ticketTags[t.id]}
              allTags={allTags}
              activeTagIds={activeTagIds}
              onToggleTag={onToggleTag}
              dateFormat={dateFormat}
              now={now}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
