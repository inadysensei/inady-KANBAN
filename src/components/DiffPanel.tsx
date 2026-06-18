"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type DiffFile,
  type DiffLineType,
  type DiffPayload,
  parseDiff,
} from "@/lib/diff-view";
import { fetchTicketDiff } from "@/lib/ticket-diff-api";
import { cx } from "@/lib/ui-classes";
import Spinner from "@/components/Spinner";
import IconButton from "@/components/ui/IconButton";
import { CloseIcon, ICON_SIZE_SM, RefreshIcon } from "@/components/ui/icons";

// Per-line coloring for the unified diff (semantic tokens from globals.css).
const LINE_CLASS: Record<DiffLineType, string> = {
  add: "bg-ok/10 text-ok",
  del: "bg-danger/10 text-danger",
  hunk: "bg-accent/10 text-accent",
  context: "text-muted",
};

/** "old → new" on a rename, otherwise the single path. */
function fileTitle(file: DiffFile): string {
  if (file.oldPath && file.newPath && file.oldPath !== file.newPath) {
    return `${file.oldPath} → ${file.newPath}`;
  }
  return file.path;
}

/**
 * In-board diff review for a ticket's working dir. Fetches `git diff HEAD` (+
 * untracked files) on mount and re-fetches whenever `refreshSignal` changes —
 * the parent derives that from session state, so an agent finishing (via the WS
 * exit or the SSE-driven refresh) refreshes the diff with no manual reload.
 * Renders per-file collapsible sections with red/green line coloring; non-git
 * dirs and clean trees read as "no changes", and an oversize diff is truncated
 * with an "open in editor" hint. Imports only pure helpers + a fetch — no PTY.
 */
export default function DiffPanel({
  ticketId,
  refreshSignal,
  onClose,
}: {
  ticketId: string;
  refreshSignal: string;
  onClose?: () => void;
}) {
  const [data, setData] = useState<DiffPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped by the manual refresh button to re-run the fetch effect.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchTicketDiff(ticketId, ac.signal)
      .then((payload) => {
        if (ac.signal.aborted) return;
        setData(payload);
        setLoading(false);
      })
      .catch((err) => {
        if (ac.signal.aborted) return; // unmount / refetch — ignore
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => ac.abort();
  }, [ticketId, refreshSignal, reloadKey]);

  const files = useMemo(
    () => (data?.status === "ok" ? parseDiff(data.diff) : []),
    [data],
  );
  const totals = useMemo(
    () =>
      files.reduce(
        (acc, f) => ({
          add: acc.add + f.additions,
          del: acc.del + f.deletions,
        }),
        { add: 0, del: 0 },
      ),
    [files],
  );

  const untracked = data?.untracked ?? [];
  const hasContent = files.length > 0 || untracked.length > 0;

  return (
    <div
      id="ticket-diff-panel"
      className="flex max-h-[45vh] min-h-0 flex-col rounded-md border border-line bg-surface"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold">Diff</span>
          {data?.status === "ok" && hasContent && (
            <span className="text-faint tabular-nums">
              {files.length > 0 && (
                <>
                  {files.length} {files.length === 1 ? "file" : "files"}
                  {(totals.add > 0 || totals.del > 0) && " · "}
                </>
              )}
              {totals.add > 0 && <span className="text-ok">+{totals.add}</span>}
              {totals.add > 0 && totals.del > 0 && " "}
              {totals.del > 0 && (
                <span className="text-danger">−{totals.del}</span>
              )}
              {untracked.length > 0 && (
                <span className="text-faint">
                  {" "}
                  · {untracked.length} new
                </span>
              )}
            </span>
          )}
          {loading && data && <Spinner />}
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            size="sm"
            aria-label="Refresh diff"
            disabled={loading}
            onClick={() => setReloadKey((k) => k + 1)}
          >
            <RefreshIcon size={ICON_SIZE_SM} />
          </IconButton>
          {onClose && (
            <IconButton size="sm" aria-label="Hide diff" onClick={onClose}>
              <CloseIcon size={ICON_SIZE_SM} />
            </IconButton>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !data ? (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted">
            <Spinner />
            Loading diff…
          </div>
        ) : error ? (
          <p className="px-3 py-3 text-xs text-danger" role="alert">
            Failed to load diff: {error}
          </p>
        ) : data?.status === "error" ? (
          <p className="px-3 py-3 text-xs text-danger" role="alert">
            Could not run git{data.error ? `: ${data.error}` : "."}
          </p>
        ) : data?.status === "not-applicable" ? (
          <p className="px-3 py-3 text-xs text-faint">
            No diff available — this working directory isn’t a git repository (or
            has no commits yet).
          </p>
        ) : !hasContent ? (
          <p className="px-3 py-3 text-xs text-faint">
            No tracked changes — the working tree matches HEAD.
          </p>
        ) : (
          <>
            {data?.truncated && (
              <p className="border-b border-line px-3 py-2 text-xs text-warn">
                Diff truncated at the size limit — open the working directory in
                your editor to review the rest.
              </p>
            )}
            {untracked.length > 0 && (
              <details open className="border-b border-line">
                <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium text-fg hover:bg-panel">
                  New files ({untracked.length})
                </summary>
                <ul className="px-3 pb-2 font-mono text-xs text-ok">
                  {untracked.map((path) => (
                    <li key={path} className="truncate" title={path}>
                      + {path}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {files.map((file, i) => (
              <details
                key={`${file.path}:${i}`}
                open
                className="border-b border-line last:border-b-0"
              >
                <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-1.5 text-xs font-medium hover:bg-panel">
                  <span className="truncate font-mono" title={fileTitle(file)}>
                    {fileTitle(file)}
                  </span>
                  <span className="shrink-0 tabular-nums text-[10px]">
                    {file.additions > 0 && (
                      <span className="text-ok">+{file.additions}</span>
                    )}
                    {file.additions > 0 && file.deletions > 0 && " "}
                    {file.deletions > 0 && (
                      <span className="text-danger">−{file.deletions}</span>
                    )}
                  </span>
                </summary>
                {file.binary ? (
                  <p className="px-3 pb-2 text-xs text-faint">
                    Binary file — not shown.
                  </p>
                ) : (
                  // content-visibility skips paint/layout for file blocks
                  // scrolled out of view — keeps a near-cap diff responsive
                  // without changing what's rendered.
                  <div className="overflow-x-auto [content-visibility:auto] [contain-intrinsic-size:auto_300px]">
                    <div className="min-w-fit font-mono text-xs leading-[1.5]">
                      {file.lines.map((line, j) => (
                        <div
                          key={j}
                          className={cx("whitespace-pre px-3", LINE_CLASS[line.type])}
                        >
                          {line.text === "" ? " " : line.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </details>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
