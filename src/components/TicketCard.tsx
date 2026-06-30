"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import type { Tag, Ticket } from "@/db/schema";
import { sessionBadges } from "@/lib/agent-display";
import type { SessionStatusCounts } from "@/lib/board-order";
import {
  type DateFormat,
  daysUntil,
  deadlineLabel,
  formatDate,
} from "@/lib/date-format";
import type { TagChip } from "@/lib/tags";
import { cardClass } from "@/lib/ui-classes";
import SessionStatusIndicator from "@/components/SessionStatusIndicator";
import TagBadge from "@/components/TagBadge";
import TicketTagEditor from "@/components/TicketTagEditor";
import { DragIcon, ICON_SIZE } from "@/components/ui/icons";

export default function TicketCard({
  ticket,
  sessionCounts,
  tags,
  allTags,
  activeTagIds,
  onToggleTag,
  dateFormat,
  now,
}: {
  ticket: Ticket;
  sessionCounts?: SessionStatusCounts;
  tags?: TagChip[];
  /** Every configured tag — for the on-card tag editor's picker. */
  allTags: Tag[];
  /** Tag ids currently in the board filter — drives each chip's active state. */
  activeTagIds: string[];
  /** Toggle a tag in the board filter (a chip click). */
  onToggleTag: (tagId: string) => void;
  dateFormat: DateFormat;
  now: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const badges = sessionCounts ? sessionBadges(sessionCounts) : [];

  // Days-remaining countdown, shown only when a deadline is set. Overdue reads
  // red, due today/soon amber, otherwise the same faint tone as the dates.
  const deadlineDays =
    ticket.deadline != null ? daysUntil(ticket.deadline, now) : null;
  const deadlineTone =
    deadlineDays == null
      ? ""
      : deadlineDays < 0
        ? "text-danger"
        : deadlineDays <= 2
          ? "text-warn"
          : "text-faint";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cardClass(
        "flex items-start gap-2 p-2 transition-colors hover:border-line-strong",
      )}
    >
      {/* Dedicated drag handle so clicking the card body navigates without
          fighting the drag gesture. */}
      <button
        type="button"
        aria-label={`Drag ${ticket.title}`}
        className="mt-0.5 cursor-grab touch-none select-none rounded-sm text-faint hover:text-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <DragIcon size={ICON_SIZE} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link href={`/tickets/${ticket.id}`} className="min-w-0">
          <div className="truncate text-sm font-medium text-fg">
            {ticket.title}
          </div>
          <div
            className="truncate font-mono text-[11px] text-muted"
            title={ticket.workingDir}
          >
            {ticket.workingDir}
          </div>
          {deadlineDays != null && ticket.deadline != null && (
            <div className="mt-1 flex justify-end">
              <time
                dateTime={new Date(ticket.deadline).toISOString()}
                className={`text-[10px] font-medium ${deadlineTone}`}
              >
                Due {formatDate(ticket.deadline, dateFormat)} ·{" "}
                {deadlineLabel(deadlineDays)}
              </time>
            </div>
          )}
          <div className="mt-1 flex flex-wrap justify-end gap-x-2 text-right text-[10px] text-faint">
            <time dateTime={new Date(ticket.createdAt).toISOString()}>
              Created {formatDate(ticket.createdAt, dateFormat)}
            </time>
            {ticket.status === "done" && ticket.doneAt != null && (
              <time dateTime={new Date(ticket.doneAt).toISOString()}>
                Done {formatDate(ticket.doneAt, dateFormat)}
              </time>
            )}
          </div>
          {badges.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
              {badges.map(({ key, status, activity, count, visual }) => (
                <span
                  key={key}
                  title={`${count} ${visual.label}`}
                  aria-label={`${count} ${visual.label}`}
                  className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${visual.pill} ${
                    visual.needsAttention ? "ring-1 ring-current" : ""
                  }`}
                >
                  <SessionStatusIndicator
                    status={status}
                    activity={activity}
                    decorative
                  />
                  {count}
                </span>
              ))}
            </div>
          )}
        </Link>
        {/* Tags footer — lives *outside* the Link so a chip click filters the
            board (not navigates), with the edit affordance alongside the chips
            it edits. Extra top margin so it doesn't crowd the badges above. */}
        <div className="mt-2 flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {(tags ?? []).map((tag) => {
              const isActive = activeTagIds.includes(tag.id);
              return (
                <TagBadge
                  key={tag.id}
                  tag={tag}
                  size="xs"
                  active={isActive}
                  onClick={() => onToggleTag(tag.id)}
                  title={
                    isActive ? `Remove ${tag.name} filter` : `Filter by ${tag.name}`
                  }
                />
              );
            })}
          </div>
          <TicketTagEditor
            ticketId={ticket.id}
            ticketTitle={ticket.title}
            allTags={allTags}
            currentTagIds={(tags ?? []).map((t) => t.id)}
          />
        </div>
      </div>
    </div>
  );
}
