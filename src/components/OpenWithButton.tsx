"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { openInEditor } from "@/actions/editors";
import type { Editor } from "@/db/schema";
import { pickDefaultEditor } from "@/lib/editor-commands";
import { CaretIcon, FolderIcon, ICON_SIZE_SM } from "@/components/ui/icons";

/**
 * Split button: the primary action opens the ticket's working dir in the
 * default editor; the ▾ caret reveals the full editor list. Editors are managed
 * in Settings. Best-effort — the server spawns the editor detached with stdio
 * ignored, so a successful launch isn't confirmable and a bad command (e.g. a
 * binary not on PATH) fails silently. The inline error only appears when the
 * action itself rejects (no editor configured, or an invalid working dir).
 */
export default function OpenWithButton({
  ticketId,
  editors,
}: {
  ticketId: string;
  editors: Editor[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const defaultEditor = pickDefaultEditor(editors);

  // Dismiss the menu with Escape (parity with AppHeader's menu).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!defaultEditor) {
    return (
      <Link
        href="/settings#editors"
        className="text-xs text-muted underline hover:text-fg"
      >
        Configure an editor to enable “Open with”
      </Link>
    );
  }

  const launch = (editorId: string) => {
    setOpen(false);
    setError(null);
    startTransition(async () => {
      try {
        await openInEditor(ticketId, editorId);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="relative inline-flex">
        <button
          type="button"
          disabled={pending}
          onClick={() => launch(defaultEditor.id)}
          title={`Open in ${defaultEditor.name} (${defaultEditor.command})`}
          className="flex items-center gap-1.5 rounded-l-md border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:bg-panel focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50"
        >
          <FolderIcon size={ICON_SIZE_SM} />
          {pending ? "Opening…" : `Open with ${defaultEditor.name}`}
        </button>
        <button
          type="button"
          disabled={pending}
          aria-label="Choose an editor"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-ml-px flex items-center justify-center rounded-r-md border border-line-strong bg-surface px-2 py-1 text-muted transition-colors hover:bg-panel hover:text-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50"
        >
          <CaretIcon size={ICON_SIZE_SM} />
        </button>
        {open && (
          <>
            <button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
            />
            <nav
              aria-label="Open with"
              className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-md border border-line bg-panel py-1 shadow-lg"
            >
              {editors.map((editor) => (
                <button
                  key={editor.id}
                  type="button"
                  onClick={() => launch(editor.id)}
                  title={editor.command}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-muted hover:bg-surface hover:text-fg focus-visible:outline-hidden focus-visible:bg-surface focus-visible:text-fg"
                >
                  <span>{editor.name}</span>
                  {editor.isDefault && (
                    <span className="text-[10px] text-faint">default</span>
                  )}
                </button>
              ))}
            </nav>
          </>
        )}
      </div>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
