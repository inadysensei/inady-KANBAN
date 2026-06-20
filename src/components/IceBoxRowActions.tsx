"use client";

import { useState, useTransition } from "react";
import { deleteTicket, moveTicketToTodo } from "@/actions/tickets";
import { killTicketSessions } from "@/lib/agent-session-api";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import { ICON_SIZE_SM, StartIcon, TrashIcon } from "@/components/ui/icons";

/**
 * Per-row actions on the /icebox list: delete the ticket, or revive it to To Do.
 * Each runs as its own transition (so the buttons report their own state) but
 * both disable while either is in flight. On success the actions'
 * revalidatePath("/icebox") drops the row from the list.
 */
export default function IceBoxRowActions({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const [moving, startMove] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const busy = moving || deleting;

  function revive() {
    startMove(async () => {
      setError(null);
      try {
        await moveTicketToTodo(id);
      } catch (err) {
        console.error("moveTicketToTodo failed", err);
        setError("Failed to move — try again.");
      }
    });
  }

  function remove() {
    if (
      !window.confirm(
        `Delete "${title}"? Running agents on this ticket will be stopped. This can't be undone.`,
      )
    ) {
      return;
    }
    startDelete(async () => {
      setError(null);
      // deleteTicket cascade-deletes agent_sessions but can't reach live PTYs,
      // so stop them over the HTTP control plane first (as the detail page does).
      const { ok } = await killTicketSessions(id);
      if (!ok) {
        setError("Failed to stop agents — not deleted.");
        return;
      }
      try {
        await deleteTicket(id);
      } catch (err) {
        console.error("deleteTicket failed", err);
        setError("Failed to delete — try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <IconButton
          size="sm"
          tone="danger"
          aria-label={`Delete ticket ${title}`}
          disabled={busy}
          aria-busy={deleting}
          onClick={remove}
        >
          <TrashIcon size={ICON_SIZE_SM} />
        </IconButton>
        <Button
          variant="accent"
          size="sm"
          disabled={busy}
          aria-busy={moving}
          icon={<StartIcon size={ICON_SIZE_SM} />}
          onClick={revive}
        >
          {moving ? "Moving…" : "Move to To Do"}
        </Button>
      </div>
      {error && (
        <span className="text-[11px] text-danger" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
