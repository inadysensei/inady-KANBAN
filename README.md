# inady KANBAN

> **Source-available, noncommercial.** Licensed under the [PolyForm Noncommercial
> License 1.0.0](LICENSE): free to use, modify, and share for any noncommercial
> purpose; commercial use is not granted. Because it restricts commercial use,
> this is **not** an OSI "open source" license — see [License](#license).

A localhost, single-user Kanban board that drives the **Cursor CLI**
(`cursor-agent`) or the **Claude CLI** (`claude`) from the browser, chosen per
session. Tickets flow through **To Do → Doing → WIP → Done**. Starting an
agent on a ticket auto-moves it to **Doing**; **WIP** is a parking lot for items
you want to set aside, and resuming work on a WIP ticket moves it back to
**Doing** automatically. You drag a ticket to **Done** manually when satisfied.

Each ticket can hold multiple agent sessions. A session runs the chosen CLI
inside a server-side PTY and streams to an in-browser terminal (xterm.js) over a
WebSocket.

## Requirements

- Node.js (tested on v25; native deps `better-sqlite3` / `node-pty` compile from
  source if no prebuild is available — Xcode Command Line Tools required on macOS).
- At least one of the agent CLIs installed, on `PATH`, and logged in (you choose
  which to use per session):
  - **Cursor** — [`cursor-agent`](https://docs.cursor.com/); log in with
    `cursor-agent login`.
  - **Claude** — [`claude`](https://docs.claude.com/en/docs/claude-code/overview);
    log in by running `claude` once and following the prompts.

## Setup

```bash
npm install
npm run db:push        # create tables in data/kanban.db (drizzle-kit push)
npm run seed           # optional: insert one sample ticket
npm run dev            # custom server (Next + WebSocket) on http://localhost:7373
```

Inspect the DB:

```bash
npm run db:studio      # drizzle-kit studio
```

> **Upgrading an existing DB:** there are no migration files, so `db:push` is the
> only upgrade path. The current `activity` column is nullable, so `db:push` adds
> it cleanly. Watch out, though: for a *non-null* column with existing rows,
> `db:push` may offer a **destructive "truncate"** prompt instead of an `ALTER` —
> don't accept it; abort and add the column by hand, e.g.
> `sqlite3 data/kanban.db 'ALTER TABLE agent_sessions ADD COLUMN activity text;'`.

### Working directories (repositories)

The **New ticket** form picks a working directory from a list you manage in
**Settings → Repositories**, rather than typing a path each time. Add a repo by
either typing an absolute path or clicking **Browse…** to pick a folder from the
macOS native chooser (other platforms: type the path). Until at least one repo
exists, the New ticket form blocks creation and links you to Settings.

The list lives in SQLite (the `repositories` table), not a config file. The
legacy `data/working-dirs.json` (a JSON array of absolute paths; see
`data/working-dirs.example.json`) is **imported once at first boot** into that
table, after which it's ignored — manage repos in Settings from then on.

### Open with (editors)

A ticket's detail page has an **Open with** split button that launches the
ticket's working directory in an editor: the primary button uses your default
editor; the **▾** caret lists the rest. Editors are managed in **Settings →
Open-with editors** (add / edit / delete, and pick exactly one default).

Each editor is a shell command run with its working directory set to the
ticket's folder, so `.` resolves there. Defaults seeded on first boot:

| Editor | Command |
|---|---|
| Cursor (classic) — default | `cursor --classic .` |
| VS Code | `code .` |
| Emacs | `emacs .` |

The command's binary must be on the **server's** `PATH`. Launch is best-effort
(detached, output ignored) — a bad command fails silently rather than erroring.

## How it works

- **Custom server** (`server.ts`, run via `tsx`): Next.js App Router request
  handler + a `ws` WebSocket server sharing one HTTP port. Next route handlers
  can't do WebSocket upgrades, hence the custom server. Run with `npm run dev`,
  **not** `next dev`.
- **WebSocket** `/ws/terminal/:sessionDbId`: the only Node network boundary. The
  client sends `start` / `stdin` / `resize` / `kill`; the server replies with
  `ready` / `stdout` / `exit` / `error`. Non-terminal upgrades (Next HMR) are
  forwarded to Next so fast-refresh keeps working.
- **PTY registry** (`src/lib/pty-registry.ts`): in-process `Map` of live PTYs.
  PTY exit → updates `agent_sessions.status`. WS close → kills the PTY
  (SIGTERM, then SIGKILL after 2s). On boot, leftover `running` rows are swept
  to `error`.
- **DB**: SQLite (`data/kanban.db`) via better-sqlite3 + Drizzle. Foreign keys
  are enabled so deleting a ticket cascades its sessions.

### Command shapes

Every session is an **interactive TUI** — there is no headless/one-shot mode. The
conversation id is pre-issued before the PTY launches, so the session always has
an id to attach to. The ticket title + description are wrapped as background and
prepended to your prompt (see `src/lib/prompt.ts`); on the initial launch that
prompt is passed as a **positional argument** the TUI auto-submits.

| CLI | New session | Resume |
|---|---|---|
| **Cursor** | `cursor-agent --resume <chat-id> "<prompt>"` | `cursor-agent --resume <chat-id>` |
| **Claude** | `claude --session-id <id> [--model …] [--effort …] "<prompt>"` | `claude --resume <id>` |

For Cursor the chat UUID is pre-issued with `cursor-agent create-chat`; for Claude
the UUID is generated locally and pinned with `--session-id` on first launch.

**Workspace trust & command approval.** Both CLIs keep **per-command approval on**
(no `--force` / bypass flags), so you approve tool calls in the terminal. On an
untrusted folder each CLI shows a one-time trust prompt; since a ticket points at
your own repo, the server auto-accepts it once (`a` for Cursor, Enter for Claude),
and trust persists per-workspace afterwards.

## MCP server (tickets for coding agents)

A local [MCP](https://modelcontextprotocol.io) server lets a coding agent
(Cursor / Claude) create, update and read board tickets directly. It runs
**locally with no authentication** (single user, localhost).

```bash
npm run mcp        # tsx mcp-server.ts — speaks MCP over stdio
```

It needs the board itself running (`npm run dev`) — the MCP server holds **no
ticket logic of its own**. Each tool is a thin call against the board's own
`/api/tickets` endpoints, which call the single source of truth in
`src/lib/ticket-core.ts`. So the MCP, the HTTP API and the board UI all change
tickets through one implementation; they can't drift apart. (Request/parse/error
shaping lives in `src/lib/inady-kanban-mcp-client.ts`, unit-tested with `fetch`
injected; `mcp-server.ts` only wires those calls to MCP tools.)

**Tools:**

| Tool | What it does |
|---|---|
| `inady_kanban_list_tickets` | List tickets, optionally filtered by `status` (`todo`/`doing`/`wip`/`done`) |
| `inady_kanban_get_ticket` | Fetch one ticket by id |
| `inady_kanban_create_ticket` | Create a `todo` ticket (`title` + absolute existing `workingDir` required; optional `description`, `memo`) |
| `inady_kanban_update_ticket` | Update an existing ticket's `title` / `description` / `workingDir` |

Edits made through the MCP don't `revalidatePath`, so an open board needs a
reload to show them (same as the `POST /api/tickets` external-caller path).

**Register it** (e.g. in your project's `.mcp.json` for Claude Code, or the
equivalent Cursor MCP config). Run the command from this repo's root:

```json
{
  "mcpServers": {
    "inady-kanban": {
      "command": "npx",
      "args": ["tsx", "mcp-server.ts"],
      "env": { "INADY_KANBAN_URL": "http://localhost:7373" }
    }
  }
}
```

`INADY_KANBAN_URL` is optional — it defaults to the local server
(`http://localhost:7373`, or `$PORT`).

## Agent status: working vs. your turn (hooks)

A live process alone can't tell **working** from **waiting for you**: an
interactive TUI keeps running while it sits at its prompt. So the board reports
the agent's activity through **hooks** the agent runs, which POST to this server:

- **busy** → a spinner (the agent is actively working)
- **awaiting** → an amber "your turn" badge + a desktop notification

If you **don't** configure hooks, the board can't know which it is, so it falls
back to the classic status dots — a green dot while running, red on error, etc.
The spinner therefore only ever appears once a hook has confirmed "busy".

When the board spawns an agent it injects two environment variables the hook can
read:

| Var | Value |
|---|---|
| `INADY_KANBAN_SESSION_ID` | this session's id (use it to identify the session) |
| `INADY_KANBAN_URL` | this server's base URL, e.g. `http://localhost:7373` |

The hook just POSTs (no body needed) to set the state:

- **Working** → `POST $INADY_KANBAN_URL/api/agent-sessions/$INADY_KANBAN_SESSION_ID/activity/busy`
- **Paused for you** → `POST $INADY_KANBAN_URL/api/agent-sessions/$INADY_KANBAN_SESSION_ID/activity/awaiting`

The state resets automatically whenever a session starts or ends.

### Claude

Add this to your **user** settings (`~/.claude/settings.json`) so it applies to
every repo, or to a project's `.claude/settings.json`. `SessionStart` +
`UserPromptSubmit` mark the agent **busy** (so the spinner shows while it works);
`Stop` (and optionally `Notification`) mark it **awaiting** you:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "[ -n \"$INADY_KANBAN_SESSION_ID\" ] && curl -sf -m 3 -X POST \"$INADY_KANBAN_URL/api/agent-sessions/$INADY_KANBAN_SESSION_ID/activity/busy\" >/dev/null 2>&1 || true" }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "[ -n \"$INADY_KANBAN_SESSION_ID\" ] && curl -sf -m 3 -X POST \"$INADY_KANBAN_URL/api/agent-sessions/$INADY_KANBAN_SESSION_ID/activity/busy\" >/dev/null 2>&1 || true" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "[ -n \"$INADY_KANBAN_SESSION_ID\" ] && curl -sf -m 3 -X POST \"$INADY_KANBAN_URL/api/agent-sessions/$INADY_KANBAN_SESSION_ID/activity/awaiting\" >/dev/null 2>&1 || true" }] }
    ],
    "Notification": [
      { "hooks": [{ "type": "command", "command": "[ -n \"$INADY_KANBAN_SESSION_ID\" ] && curl -sf -m 3 -X POST \"$INADY_KANBAN_URL/api/agent-sessions/$INADY_KANBAN_SESSION_ID/activity/awaiting\" >/dev/null 2>&1 || true" }] }
    ]
  }
}
```

(`Notification` is optional — it covers permission prompts and idle waits. The
`[ -n … ] || true` guard makes each hook a harmless no-op when Claude runs
outside the board.)

### Cursor

Add this to your **user** hooks (`~/.cursor/hooks.json`) so it applies to every
workspace, or to a project's `.cursor/hooks.json`. `sessionStart` +
`beforeSubmitPrompt` mark the agent **busy** (so the spinner shows while it
works); `stop` marks it **awaiting** you:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "[ -n \"$INADY_KANBAN_SESSION_ID\" ] && curl -sf -m 3 -X POST \"$INADY_KANBAN_URL/api/agent-sessions/$INADY_KANBAN_SESSION_ID/activity/busy\" >/dev/null 2>&1 || true" }
    ],
    "beforeSubmitPrompt": [
      { "command": "[ -n \"$INADY_KANBAN_SESSION_ID\" ] && curl -sf -m 3 -X POST \"$INADY_KANBAN_URL/api/agent-sessions/$INADY_KANBAN_SESSION_ID/activity/busy\" >/dev/null 2>&1 || true" }
    ],
    "stop": [
      { "command": "[ -n \"$INADY_KANBAN_SESSION_ID\" ] && curl -sf -m 3 -X POST \"$INADY_KANBAN_URL/api/agent-sessions/$INADY_KANBAN_SESSION_ID/activity/awaiting\" >/dev/null 2>&1 || true" }
    ]
  }
}
```

Use user-level hooks for inady KANBAN: the board starts `cursor-agent` in each
ticket's working directory, not in the inady KANBAN app repo. The `[ -n … ] || true`
guard makes each hook a harmless no-op when `cursor-agent` runs outside the
board. Cursor has no `Notification` hook — permission prompts won't flip the
badge to "your turn" until `stop` fires.

### Browser notification badge

When an agent finishes, fails, or needs your input while the tab is in the
background, `NotificationCenter` keeps an **unread count** and surfaces it
everywhere a browser can show one:

- the **favicon** (a red count bubble drawn onto the tab icon),
- the **tab title** prefix (`(3) ● …`),
- the **OS app badge** (`navigator.setAppBadge` — only visible for an installed
  PWA; a harmless no-op in a plain tab), and
- a red count on the bottom-right **bell**.

The count only accumulates while the tab is hidden and resets to zero the moment
you focus/return to it. This is independent of desktop-notification permission —
the badge shows even if you never grant notifications.

## License

**inady KANBAN** is **source-available** software, licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE).

- ✅ Free to use, modify, and share for any **noncommercial** purpose — personal
  projects, hobby and amateur use, research, education, and noncommercial
  organizations.
- ❌ **Commercial use is not granted** by this license.
- ℹ️ Because it restricts commercial use, this is **not** an OSI-approved
  "open source" license.

For commercial licensing, contact the author
([@inadysensei](https://github.com/inadysensei)).

Copyright © 2026 inadysensei.
