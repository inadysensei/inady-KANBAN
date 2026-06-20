import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import IceBoxRowActions from "@/components/IceBoxRowActions";
import TagBadge from "@/components/TagBadge";
import { ICON_SIZE, IceBoxIcon } from "@/components/ui/icons";
import { db } from "@/db/client";
import { tickets } from "@/db/schema";
import { readDateFormat } from "@/lib/app-settings";
import { formatDate } from "@/lib/date-format";
import { readTicketTags } from "@/lib/inady-kanban-config";
import { badgeClass, cardClass } from "@/lib/ui-classes";

// Read fresh from SQLite on every request, like the board; the move actions'
// revalidatePath("/icebox") keeps it in sync.
export const dynamic = "force-dynamic";

export default function IceBoxPage() {
  const iceboxTickets = db
    .select()
    .from(tickets)
    .where(eq(tickets.status, "icebox"))
    // The Ice Box has no in-column order (count-only on the board), so show the
    // most recently frozen first.
    .orderBy(desc(tickets.updatedAt))
    .all();
  // Reuse the board's one-join tag reader and index per ticket.
  const ticketTags = readTicketTags();
  const dateFormat = readDateFormat();

  return (
    <main className="mx-auto flex w-full min-h-screen max-w-[900px] flex-col gap-4 p-6">
      <Link
        href="/"
        className="w-fit text-sm text-muted hover:text-fg hover:underline"
      >
        ← inady KANBAN
      </Link>

      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-panel text-muted">
            <IceBoxIcon size={ICON_SIZE} aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Ice Box</h1>
            <p className="text-sm text-muted">
              Frozen items — not now, but not discarded. Revive one to To Do when
              you&apos;re ready.
            </p>
          </div>
        </div>
        <span className={badgeClass("neutral")}>{iceboxTickets.length}</span>
      </header>

      {iceboxTickets.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface/40 p-8 text-center text-sm text-muted">
          The Ice Box is empty. Drag a card onto the Ice Box tile on the board to
          freeze it here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {iceboxTickets.map((t) => {
            const tags = ticketTags[t.id] ?? [];
            return (
              <li
                key={t.id}
                className={cardClass("flex items-start justify-between gap-3 p-3")}
              >
                <div className="min-w-0 flex-1">
                  <Link href={`/tickets/${t.id}`} className="block min-w-0">
                    <div className="truncate text-sm font-medium text-fg transition-colors hover:text-accent">
                      {t.title}
                    </div>
                    <div
                      className="truncate font-mono text-[11px] text-muted"
                      title={t.workingDir}
                    >
                      {t.workingDir}
                    </div>
                  </Link>
                  {tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {tags.map((tag) => (
                        <TagBadge key={tag.id} tag={tag} size="xs" />
                      ))}
                    </div>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-faint">
                    <time dateTime={new Date(t.createdAt).toISOString()}>
                      Created {formatDate(t.createdAt, dateFormat)}
                    </time>
                    {t.deadline != null && (
                      <time dateTime={new Date(t.deadline).toISOString()}>
                        Due {formatDate(t.deadline, dateFormat)}
                      </time>
                    )}
                  </div>
                </div>
                <IceBoxRowActions id={t.id} title={t.title} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
