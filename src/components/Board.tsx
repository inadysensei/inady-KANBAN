"use client";

import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { moveTicket, reorderColumn } from "@/actions/tickets";
import { killTicketSessions } from "@/lib/agent-session-api";
import {
  computeDragResult,
  groupByStatus,
  orderDoneColumn,
  type SessionStatusCounts,
  type Update,
} from "@/lib/board-order";
import type { DateFormat } from "@/lib/date-format";
import type { TagChip } from "@/lib/tags";
import { STATUS_LABELS } from "@/lib/ticket-display";
import type { Ticket } from "@/db/schema";
import { TICKET_STATUSES } from "@/db/schema";
import Column from "./Column";

/**
 * Prefer the droppable the pointer is actually inside (`pointerWithin`) so a
 * short or empty column — WIP, which is often empty — is a reliable drop target
 * instead of snapping to a taller neighbor's nearest corner. `closestCorners`
 * alone resolved a drop *aimed at WIP* onto the adjacent (taller) Done column,
 * which silently kills the ticket's agents — a destructive misfire. Fall back to
 * `closestCorners` when there's no pointer (KeyboardSensor) or the pointer is
 * outside every column. `pointerWithin` sorts the droppables the pointer is
 * inside by mean distance to their corners, so a hovered card's small rect
 * outranks its enclosing column → within-column ordering still works.
 */
const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0
    ? pointerCollisions
    : closestCorners(args);
};

export default function Board({
  tickets,
  sessionCounts,
  ticketTags,
  doneTotal,
  dateFormat,
  now,
}: {
  tickets: Ticket[];
  sessionCounts: Record<string, SessionStatusCounts>;
  /** ticketId → its tag chips (board display). */
  ticketTags: Record<string, TagChip[]>;
  doneTotal: number;
  dateFormat: DateFormat;
  /** Server render time, for the deadline countdown (see page.tsx). */
  now: number;
}) {
  const [optimistic, applyOptimistic] = useOptimistic(
    tickets,
    (state: Ticket[], updates: Update[]) =>
      state.map((t) => {
        const u = updates.find((x) => x.id === t.id);
        return u ? { ...t, status: u.status, position: u.position } : t;
      }),
  );
  const [, startTransition] = useTransition();
  const [dragError, setDragError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // computeDragResult requires position-sorted columns (groupByStatus output);
  // Done *displays* by recency, so keep a separate render-only grouping.
  const byStatus = useMemo(
    () => groupByStatus(optimistic, TICKET_STATUSES),
    [optimistic],
  );
  const displayByStatus = useMemo(
    () => ({ ...byStatus, done: orderDoneColumn(byStatus.done) }),
    [byStatus],
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const fromStatus = optimistic.find((t) => t.id === activeId)?.status;

    const result = computeDragResult(byStatus, activeId, String(over.id));
    if (!result) return;

    const toStatus =
      result.kind === "move" ? result.update.status : result.status;
    // Done renders by recency, so a within-Done drag has no visible meaning —
    // and a reorder there would renumber only the 10 fetched tickets.
    if (fromStatus === "done" && toStatus === "done") return;

    startTransition(async () => {
      setDragError(null);
      // Entering Done stops the ticket's agents, whichever shape the drag took
      // (a drop can also resolve to a column-wide reorder).
      if (toStatus === "done" && fromStatus !== "done") {
        const { ok } = await killTicketSessions(activeId);
        if (!ok) {
          setDragError("Failed to stop agents — ticket was not moved to Done.");
          return;
        }
      }
      if (result.kind === "move") {
        applyOptimistic([result.update]);
        await moveTicket(
          result.update.id,
          result.update.status,
          result.update.position,
        );
      } else {
        applyOptimistic(result.updates);
        await reorderColumn(result.status, result.orderedIds);
      }
    });
  }

  return (
    <div className="flex w-full min-h-0 min-w-0 flex-1 flex-col">
      <DndContext
        // Stable id: dnd-kit otherwise numbers its aria-describedby element with
        // a module-global counter, which drifts between SSR and the client and
        // triggers a hydration mismatch.
        id="board-dnd"
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragEnd={onDragEnd}
      >
        {dragError && (
          <p className="text-sm text-danger" role="alert">
            {dragError}
          </p>
        )}
        <div className="flex w-full min-h-0 min-w-0 flex-1 gap-4 overflow-x-auto pb-4">
          {TICKET_STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              title={STATUS_LABELS[status]}
              tickets={displayByStatus[status]}
              sessionCounts={sessionCounts}
              ticketTags={ticketTags}
              totalOverride={status === "done" ? doneTotal : undefined}
              dateFormat={dateFormat}
              now={now}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
