# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A localhost, single-user inady KANBAN board that drives the **Cursor/Claude CLI** (`cursor` or `claude`) from the browser. Tickets flow To Do → Doing → WIP → Done. Starting an agent on a ticket auto-moves it to Doing; WIP is a parking lot for items set aside, and resuming work on a WIP ticket (typing into a resumed session, re-running a session, or launching a new one) auto-moves it back to Doing — merely opening a session to read it is glance-safe and keeps the ticket parked; the user drags to Done manually. Each ticket holds multiple agent sessions, each running `cursor` or `claude` in a server-side PTY streamed to an in-browser xterm.js terminal over a WebSocket.

## Commands

```bash
npm install            # also runs postinstall (scripts/fix-node-pty.mjs)
npm run db:push        # create/sync SQLite tables via drizzle-kit push (no migration files)
npm run seed           # optional: insert one sample ticket
npm run dev            # custom server (Next + WebSocket) on http://localhost:7373
npm run build          # next build
npm run typecheck      # tsc --noEmit
npm test               # vitest run (unit tests)
npm run test:watch     # vitest watch — the Red/Green loop
npm run lint           # next lint (build does NOT fail on lint — see next.config.mjs)
npm run db:studio      # drizzle-kit studio
```

## IMPORTANT: Testing — Red/Green TDD

Follow **Red → Green → Refactor** for logic changes:

1. **Red** — write a failing `*.test.ts` beside the source that states the intended behavior; run `npm run test:watch` and see it fail.
2. **Green** — minimal code to pass.
3. **Refactor** — tidy up with the suite green.

- Tests live next to source (`src/**/*.test.ts`), Vitest, node environment.
- Unit-test the **pure logic**: `wrapPrompt` (prompt.ts), `filterStderr`/`createChat` (cursor-agent.ts), the per-CLI argv/trust specs (`AGENT_CLIS` in agent-cli.ts), the DnD ordering math (`computeDragResult`/`groupByStatus`/`orderDoneColumn`/`tallySessionCounts` in `src/lib/board-order.ts`, extracted out of `Board.tsx` precisely so it's testable), the display helpers (session-display.ts), `parseWorkingDirs`/`cleanChosenFolderPath` (working-dirs.ts), `pickDefaultEditor`/`normalizeEditorInput`/`DEFAULT_EDITORS` (editor-commands.ts), and the notification badge math (`shouldNotify`/`notificationBody`/`nextUnreadCount`/`formatBadgeCount` in notification-display.ts). These modules pull no React/drizzle/node-pty (schema is `import type`, erased), so they load in the node test env.
- **Coverage** (`npm run coverage`) is gated at **100%** but scoped to `prompt.ts` + `cursor-agent.ts` + `agent-cli.ts` only (see `vitest.config.ts`). Per t-wada, coverage is a tool, not a target: don't widen the gate to chase a number by mocking integration code. `board-order.ts` is tested but deliberately left out of the gate.
- The PTY/WebSocket lifecycle and DB wiring are **integration** concerns — verify by running the app, not by mocking `node-pty` in Vitest.

## Definition of Done — review & refactor gate

After implementing a feature or non-trivial change, it is NOT done until:

1. The test suite is green (`npm test`).
2. You've run a **two-perspective review** of the change — delegate to the `react-next-reviewer` and `senior-vp-reviewer` subagents (run them in parallel; they recommend, you apply).
3. You've applied the agreed refactors **incrementally, re-running `npm test` after each step** so the suite stays green throughout (add unit tests for any pure logic you extract).
4. The full gate passes: `npm test` + `npm run typecheck` + `npm run build`.

Run **`/review-refactor`** to drive steps 1–4 end-to-end. Reviews must preserve behavior and must not revert the intentional design decisions above.

## Architecture — the load-bearing ideas

### Two module graphs, one process
`server.ts` (run by `tsx`) and Next's bundled Server Actions/components are **separate module graphs in the same Node process**. This drives several rules:

- **DB connection is a shared singleton.** `src/db/client.ts` exports a lazy `Proxy` over a `globalThis`-cached better-sqlite3 handle, so both graphs share one connection. The proxy is *lazy on purpose*: opening at import time made `next build`'s parallel page-data workers contend (`SQLITE_BUSY`). Don't make `db` eager.
- **The PTY registry Map is NOT shared.** Only `server.ts` (via `src/lib/pty-registry.ts`) ever touches live PTYs. **Server Actions must never import `pty-registry`** — they'd get a different, empty Map (and pull `node-pty` into the wrong bundle). PTY lifecycle is driven entirely over the WebSocket.
- **The session event bus IS shared** (`src/lib/board-events.ts`): a `globalThis`-cached `EventEmitter` (same pattern as the db handle). `pty-registry` publishes running/finished/error/killed `SessionEvent`s (plus hook-driven *activity* events carrying `activity`); the SSE endpoint in `server.ts` fans them out to every tab, where `NotificationCenter` (layout-mounted) refreshes the route and fires desktop notifications (including an "agent needs your input" one on `activity: "awaiting"`). It also keeps an **unread badge** (count of notify-worthy events received while the tab is hidden, reset on focus) and reflects it on the favicon (canvas), the tab title prefix, the OS app badge (`navigator.setAppBadge`, best-effort), and the bell — independent of notification permission. The pure count math lives in `src/lib/notification-display.ts` (`shouldNotify`/`notificationBody`/`nextUnreadCount`/`formatBadgeCount`, unit-tested); the DOM side effects stay in the component. Clients import only the `SessionEvent` *type* — `node:events` must never enter the client bundle.
- **Import convention is deliberate**: `src/db/**` and `src/lib/**` use **relative imports** (loaded by both `tsx` and Next); `src/actions`, `src/app`, `src/components` use the `@/` alias (Next-bundled only). Keep `node-pty` / `better-sqlite3` out of the client bundle — they're declared in `serverExternalPackages` (next.config.mjs).

### WebSocket terminal (`server.ts` + `src/lib/terminal-protocol.ts`)
- One endpoint: `/ws/terminal/:sessionDbId`. Protocol is JSON frames — client `start`/`stdin`/`resize`/`kill` ↔ server `ready`/`replay`/`stdout`/`exit`/`error`.
- HTTP control plane (custom server only, not Server Actions): `POST /api/agent-sessions/:id/kill`, `POST /api/agent-sessions/:id/activity/(awaiting|busy)` (hook-driven activity overlay — see below), `POST /api/tickets/:id/kill-sessions`, `POST /api/tickets` (create a ticket from outside the Next app — e.g. an import script — via the shared `insertTicket`; body capped, does NOT `revalidatePath` so open boards need a reload), `GET /api/tickets` (list, optional `?status=`, via `listTickets`), `GET /api/tickets/:id` (read one, via `getTicket`), `PATCH /api/tickets/:id` (update fields, via `updateTicketFields`; like the create endpoint it does NOT `revalidatePath`), `GET /api/agent-sessions/live-count`, `GET /api/events` (SSE stream of `SessionEvent`s; writes are guarded against destroyed responses). The ticket GET/PATCH/POST routes are what the **inady KANBAN MCP server** (`mcp-server.ts`) drives — see "inady KANBAN MCP server" below.
- The upgrade handler forwards **non-terminal** upgrades to Next's HMR via `app.getUpgradeHandler()` (which must be obtained **after** `app.prepare()`). Never `socket.destroy()` other paths or dev fast-refresh breaks.

### PTY lifecycle & connection ownership (`pty-registry.ts` + `handleTerminal` in `server.ts`)
- `startSession` spawns a new PTY or **attaches** to an already-running one (background). Returns `{ status, connId, replay }`; only the attached `connId` may `stdin`/`resize`/`kill`. A second tab is rejected while one attachment is live.
- **Detach on WS close** — navigating away does **not** kill the PTY; stdout while detached is buffered (scrollback cap in `agent-limits.ts`) and sent as `replay` on reconnect.
- `killSession` **deletes the registry slot synchronously**, then SIGTERM → SIGKILL after 2s. Also marks DB-only `running` rows ended (for HTTP kill without a live PTY).
- `proc.onExit` updates the DB and notifies the attached handler only if that proc still owns the slot.
- On boot: `sweepOrphanAgentProcesses()` (PID file from `agent-pid-store.ts`) → `sweepRunningSessions()` (stale DB `running` → `error`).
- Concurrent limit: default **20** live spawns (`INADY_KANBAN_MAX_CONCURRENT_AGENTS`); `createAgentSession` also checks DB `running` count inside its insert transaction.
- **React Strict Mode is disabled** (next.config.mjs) because the `<Terminal>` mount effect spawns a real PTY; the dev double-invoke would double-spawn/kill.

### Agent CLI invocation (`src/lib/agent-cli.ts` + `src/lib/cursor-agent.ts`)
- Every session is an **interactive TUI** driven by one of two CLIs, chosen per session (`agent_sessions.agent`: `"cursor"` | `"claude"`). `AGENT_CLIS` holds each CLI's bin (env-overridable: `CURSOR_AGENT_BIN`, `CLAUDE_BIN`), argv builder, trust-prompt regex/answer, and output filter. There is no headless/one-shot mode (removed deliberately).
- The conversation UUID is **pre-issued** before the PTY launches (so `agent_sessions.agentSessionId` exists first):
  - **cursor**: `cursor-agent create-chat` in the ticket's `working_dir` (cursor-agent.ts); launch is `--resume <id> "<prompt>"`, re-open is `--resume <id>`.
  - **claude**: a locally generated UUID, pinned at launch via `--session-id <id> "<prompt>"`; re-open is `--resume <id>`.
  In both, the initial prompt is a **positional arg** the TUI auto-submits (no stdin pre-feed; survives a trust dialog). Per-command approval stays on (no `--force` / bypass flags).
- **Workspace trust**: both CLIs prompt on untrusted dirs; `pty-registry` watches the stream for the CLI's `trustPromptRe` and auto-sends its `trustAnswer` once (`a` for cursor, Enter for claude); trust persists per-workspace after that. cursor's `filterStderr` drops known harmless noise lines without reflowing the stream; claude output passes through verbatim.
- The DB column behind `agentSessionId` is still physically named `cursor_session_id` — kept deliberately, since `db:push` has no migration files and a rename would be destructive.
- Session status: `running` / `finished` (exit 0) / `error` (non-zero or crash sweep) / `killed` (user-initiated stop — kill paths mark `killed`, not `error`).
- **Activity overlay** (`agent_sessions.activity`: `"busy" | "awaiting" | null`): orthogonal to `status` — a hook-reported view of a `running` session. It's **not** detected from output; the agent's own hooks report it. `startSession` injects `INADY_KANBAN_SESSION_ID` + `INADY_KANBAN_URL` into the PTY env so the user's `SessionStart`/`UserPromptSubmit` (→ `busy`) and `Stop`/`Notification` (→ `awaiting`) hooks can `POST …/activity/(busy|awaiting)`; `setSessionActivity` sets it (idempotent, publishes an activity `SessionEvent`) and `markEnded`/(re)start/sweep clear it to null. The UI maps a running session by activity: **busy** → spinner, **awaiting** → amber "your turn" badge, **null (no hook)** → the classic green dot (we don't guess) — `sessionVisual`/`sessionBadges` in agent-display.ts, `tallySessionCounts` in board-order.ts. So the spinner only appears once a hook confirms `busy`; without hooks the board keeps the original green/red status dots. (`activity` is nullable, so `db:push` adds it cleanly.) See README "Agent status: working vs. your turn".

### Data flow (board ↔ DB)
- Pages are Server Components reading SQLite directly with `export const dynamic = "force-dynamic"`; Server Actions (`src/actions/`) mutate and call `revalidatePath`.
- **Ticket create/read/update each have one source of truth** in `src/lib/ticket-core.ts` (relative imports, no `next/cache`, loads in both module graphs): `insertTicket` (create), `getTicket`/`listTickets` (read), `updateTicketFields` (update editable fields; tags stay separate via `setTicketTags`). The Server Actions wrap these with `revalidatePath` (`createTicket`→`insertTicket`, `updateTicket`→`updateTicketFields`+tags); the `POST /api/tickets` / `GET /api/tickets[/:id]` / `PATCH /api/tickets/:id` endpoints (server.ts) call them directly for external callers. Don't reintroduce a second insert/update path — the board UI, the HTTP API, and the MCP server must all go through these.
- DnD: `Board.tsx` is a thin dispatcher — the ordering math is the pure `computeDragResult` in `src/lib/board-order.ts`, which returns either a `move` (fractional `position` = average of neighbors) or a `reorder` (integer renumber when the gap < ε). `Board` applies the result via `useOptimistic` + `moveTicket`/`reorderColumn`. Status labels live in `src/lib/ticket-display.ts`; agent labels/logos/status-dot colors in `src/lib/agent-display.ts` (client-safe — never put display data in agent-cli.ts, which pulls `node:child_process`).
- **Done column shows only the latest 10** (by `updatedAt` desc — `orderDoneColumn`); the page queries done tickets with `LIMIT 10` plus a total count. `computeDragResult` still requires position-sorted input, so `Board` keeps two groupings: `byStatus` (position order, for drag math) and `displayByStatus` (Done re-sorted by recency, render only). Within-Done drags are ignored; any drag *into* Done kills the ticket's agents first (both `move` and `reorder` shapes).
- The **auto Doing transition** lives in `createAgentSession` (pre-issue conversation UUID → INSERT session `running` → set ticket `doing`, in one transaction) — "execution started" is the trigger, before the PTY runs. Resuming an *existing* session is the other "resume work" funnel: the first keystroke into a session terminal (`Terminal`'s `onFirstInput`) calls the `resumeTicket` action, which pulls a parked **WIP** ticket back into Doing (no-op for any other status). Triggering on first *input* — not on open — keeps WIP a glance-safe parking lot: merely opening/auto-restoring a session to read it doesn't un-park the ticket, but typing to the agent does. This covers both the explicit SessionList "open" click and the passive auto-open-on-load path, since both mount the same `Terminal`.
- SQLite foreign keys are enabled per-connection in `client.ts` (`PRAGMA foreign_keys = ON`), so deleting a ticket cascades its `agent_sessions`.
- **Repositories & editors are DB-backed, managed in Settings** (`repositories`, `editors` tables). DB readers (`readWorkingDirs`/`listRepositories`/`listEditors`) sit with the other list-readers in `src/lib/inady-kanban-config.ts`; CRUD is in `src/actions/{repositories,editors}.ts`. `readWorkingDirs` runs paths through the pure `parseWorkingDirs` (working-dirs.ts) — the same helper that normalizes the one-shot legacy-file import. The shared `assertValidWorkingDir` (absolute + existing dir) also lives in working-dirs.ts (deduped out of the ticket/template actions).
- **Boot-time defaults** (`bootstrapDefaults` in `src/lib/bootstrap.ts`, called from `server.ts` after `app.prepare()`): one-shot import of the legacy `data/working-dirs.json` into `repositories` + seed of the default `editors` (Cursor classic/VS Code/Emacs), guarded by `app_settings.seeded` plus per-table empty checks so clearing a list stays cleared. Errors are swallowed (logs a `db:push` hint) so the server still boots before the tables exist.
- **macOS folder picker**: `pickRepositoryDirectory` (server action) shells out to `osascript`'s `choose folder`; the pure output cleaner is `cleanChosenFolderPath` (working-dirs.ts, unit-tested). Non-darwin throws a friendly message and the UI falls back to direct path entry.
- **"Open with"** (`openInEditor` server action, `OpenWithButton` split button on the ticket page): runs the editor's command via `spawn(shell:true, detached, stdio:"ignore")` with `cwd` = the ticket's working dir (so `.` resolves there; the path is never interpolated — fine for this localhost single-user tool). Editors keep an **exactly-one-default** invariant enforced in transactions (saveEditor/setDefaultEditor/deleteEditor); `pickDefaultEditor` (editor-commands.ts, client-safe + tested) returns the flagged default else the first by order.

### inady KANBAN MCP server (`mcp-server.ts`)
A local, no-auth MCP server (stdio, `@modelcontextprotocol/sdk`) that lets a coding agent create/update/read tickets. Run with `npm run mcp` (`tsx mcp-server.ts`); it needs the board server running. **It holds no ticket logic** — each tool is a thin call through `src/lib/inady-kanban-mcp-client.ts` (a `fetch`-based HTTP client) to the board's own `/api/tickets` endpoints, which call ticket-core. So MCP, the HTTP API, and the board UI share **one** implementation — this is the load-bearing design rule for this feature; don't give the MCP its own DB/logic path. The client is the only unit-tested piece (pure, `fetch` injected — same philosophy as the other `src/lib` helpers); `mcp-server.ts` and the new server.ts routes are integration, verified by running. Tools: `inady_kanban_list_tickets`, `inady_kanban_get_ticket`, `inady_kanban_create_ticket`, `inady_kanban_update_ticket`. Target URL is `$INADY_KANBAN_URL` (else the local server). Stdio transport means **nothing may go to stdout except protocol frames** — diagnostics use `console.error`. See README "MCP server".
