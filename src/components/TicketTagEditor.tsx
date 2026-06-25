"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { updateTicket } from "@/actions/tickets";
import type { Tag } from "@/db/schema";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import TagPicker from "@/components/TagPicker";
import { CloseIcon, ICON_SIZE, ICON_SIZE_SM, TagIcon } from "@/components/ui/icons";

/**
 * Bottom-right tag affordance on a board card: a tag icon that opens a small
 * modal editing *only* this ticket's tags, so they can be changed without
 * opening the ticket page. The full tag list is threaded down from the server
 * page (clients can't read the DB); the current selection comes from the card's
 * own chips. Saving goes through the shared `updateTicket` action — passing only
 * `tagIds` leaves every other field untouched.
 */
export default function TicketTagEditor({
  ticketId,
  ticketTitle,
  allTags,
  currentTagIds,
}: {
  ticketId: string;
  ticketTitle: string;
  allTags: Tag[];
  currentTagIds: string[];
}) {
  const router = useRouter();
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(currentTagIds);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  function openEditor() {
    // Re-seed from the latest props on each open so a change made elsewhere
    // (the ticket page, another tab) is reflected.
    setSelected(currentTagIds);
    setError(null);
    setOpen(true);
  }

  function close() {
    if (!saving) setOpen(false);
  }

  // Move focus into the dialog on open and close it on Escape — mirroring the
  // dismiss idiom in AppHeader / OpenWithButton. `saving` is a dep because
  // close() reads it (a mid-save Escape is a no-op, like the backdrop click).
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving]);

  function save() {
    // Saving an unchanged selection would still touch the ticket's updatedAt
    // (updateTicketFields always bumps it), which re-sorts a Done card to the
    // top of its column and broadcasts a needless TicketEvent. Skip the write
    // when nothing changed — order-insensitive, since chip order is fixed (tag
    // position) but TagPicker appends toggles in click order.
    const unchanged =
      selected.length === currentTagIds.length &&
      selected.every((id) => currentTagIds.includes(id));
    if (unchanged) {
      setOpen(false);
      return;
    }
    setError(null);
    startSave(async () => {
      try {
        await updateTicket(ticketId, { tagIds: selected });
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <>
      {/* Bare button (like the drag handle) so the card stays uncluttered. */}
      <button
        type="button"
        aria-label={`Edit tags for ${ticketTitle}`}
        title="Edit tags"
        onClick={openEditor}
        className="rounded-sm text-faint transition-colors hover:text-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <TagIcon size={ICON_SIZE_SM} />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={close}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            tabIndex={-1}
            className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-line bg-panel p-6 shadow-2xl focus-visible:outline-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 id={headingId} className="min-w-0 text-base font-semibold">
                Tags ·{" "}
                <span className="font-normal text-muted" title={ticketTitle}>
                  {ticketTitle}
                </span>
              </h2>
              <IconButton
                size="sm"
                className="-mr-2 -mt-2 shrink-0"
                onClick={close}
                aria-label="Close"
              >
                <CloseIcon size={ICON_SIZE} />
              </IconButton>
            </div>
            <TagPicker tags={allTags} selected={selected} onChange={setSelected} />
            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={saving} onClick={close}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={saving}
                aria-busy={saving}
                onClick={save}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
