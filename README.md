# inady KANBAN

> **Source-available · noncommercial.** Free to use, modify, and share for any
> noncommercial purpose under the [PolyForm Noncommercial License 1.0.0](LICENSE).
> Commercial use is not granted — and because of that it is **not** an OSI
> "open source" license. See [License](#license).

A Kanban board you run on your own machine that lets you start and watch
**Cursor** and **Claude** coding-agent CLIs straight from your browser. Each card
is a task; you move it across **To Do → Doing → WIP → Done** as the work
progresses, and each card can run real agent sessions in a live terminal.

![](/docs/board.svg)

## What it does

- 🧑‍💻 **Run agents from a board** — start a `cursor-agent` or `claude` session on any card; it runs in a real terminal right in your browser.
- 🗂️ **Kanban flow** — starting an agent moves a card to **Doing**; **WIP** is a parking lot for things you set aside; you drag to **Done** when you're happy.
- 🧵 **Many sessions per card, always live** — run several agents per task and reconnect whenever; sessions keep running in the background even if you close the tab.
- 🟢 **See who needs you** — at a glance, tell whether an agent is **working** or **waiting for your input** (with optional hooks).
- 🤖 **Agents can manage the board** — a built-in MCP server lets an agent create and update tickets itself.
- 🔒 **Local & private** — one user, no login, all data in a local SQLite file on your machine.

## Quick start

You need **Node.js** and at least one agent CLI, installed and logged in:

| CLI | Install | Log in |
|---|---|---|
| **Cursor** | [`cursor-agent`](https://docs.cursor.com/) | `cursor-agent login` |
| **Claude** | [`claude`](https://docs.claude.com/en/docs/claude-code/overview) | run `claude` once and follow the prompts |

> 💡 On macOS the native modules (`better-sqlite3`, `node-pty`) build from source, so you may need the Xcode Command Line Tools.

```bash
npm install
npm run db:push   # create the local database (data/kanban.db)
npm run dev       # start the app
```

Now open **http://localhost:7373**. (Optional: `npm run seed` adds one sample ticket to get you started.)

## Using the board

1. **Add a repository** — open **Settings → Repositories** and add the folder your agents should work in (type a path, or **Browse…** on macOS). You need at least one before you can create a ticket.
2. **Create a ticket** — click **New ticket**, give it a title, choose the repository, and describe what you want done.
3. **Start an agent** — on the ticket, start a session and pick **Cursor** or **Claude**. The ticket moves to **Doing**, a terminal opens, and you chat with the agent and approve its actions there.
4. **Park or finish** — drag a ticket to **WIP** to set it aside, or to **Done** when it's complete. (Re-opening a parked ticket and typing to its agent pulls it back into Doing automatically.)
5. **Open in your editor** — each ticket has an **Open with** button that launches its folder in your editor.

<details>
<summary><b>Repositories & editors — a few details</b></summary>

**Repositories** live in the database (the `repositories` table), not a config file. A legacy `data/working-dirs.json` (see `data/working-dirs.example.json`) is imported once on first boot, then ignored — manage repos in Settings from then on.

**Editors** are managed in **Settings → Open-with editors** (add / edit / delete, with exactly one default). Each is a shell command run with its working directory set to the ticket's folder, so `.` resolves there. Seeded defaults:

| Editor | Command |
|---|---|
| Cursor (classic) — default | `cursor --classic .` |
| VS Code | `code .` |
| Emacs | `emacs .` |

The command's binary must be on the **server's** `PATH`. Launch is best-effort (detached) — a bad command just fails silently.

</details>

## Working vs. waiting for you

A running agent looks the same whether it's hard at work or sitting waiting for your reply. If you add a couple of small **hooks** to Cursor/Claude, the board can tell the difference and show it on the card:

- 🟢 **working** — a spinner
- 🟡 **your turn** — an amber badge, plus a desktop notification

Without hooks you simply get a plain "running" dot — everything still works, the board just can't guess what the agent is doing. When the board launches an agent it sets two environment variables the hook reads — `INADY_KANBAN_SESSION_ID` and `INADY_KANBAN_URL` — and the hook POSTs back to report the state.

<details>
<summary><b>Hook setup — copy-paste for Claude & Cursor</b></summary>

**Claude** — add to your user settings (`~/.claude/settings.json`) or a project's `.claude/settings.json`:

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

**Cursor** — add to your user hooks (`~/.cursor/hooks.json`) or a project's `.cursor/hooks.json`:

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

`SessionStart` / `UserPromptSubmit` mark the agent **busy**; `Stop` (and Claude's optional `Notification`) mark it **awaiting** you. The state resets whenever a session starts or ends. The `[ -n … ] || true` guard makes each hook a harmless no-op when the CLI runs outside the board, so it's safe to keep in your global config.

</details>

## Let agents manage the board (MCP)

Run a small [MCP](https://modelcontextprotocol.io) server so a coding agent can create, read, and update tickets itself:

```bash
npm run mcp
```

It needs the board running (`npm run dev`) and talks to it over HTTP — it has **no database of its own**, so the board UI, its HTTP API, and the MCP all change tickets the same way. Tools: `inady_kanban_list_tickets`, `inady_kanban_get_ticket`, `inady_kanban_create_ticket`, `inady_kanban_update_ticket`.

<details>
<summary><b>Register it with Claude Code / Cursor</b></summary>

Add to your project's `.mcp.json` (or the equivalent Cursor MCP config), run from this repo's root:

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

`INADY_KANBAN_URL` is optional — it defaults to the local server. Tickets changed through the MCP need a board reload to show up (same as any external change).

</details>

## How it works

A custom **Next.js + WebSocket server** (`server.ts`) serves the board and streams each agent's terminal. Agents run in server-side **PTYs** piped to an in-browser terminal (xterm.js); data lives in **SQLite** via Drizzle. Every session is a normal **interactive** CLI run — there's no unattended/headless mode, so you always approve what the agent does. Configuration is optional (see [`.env.example`](.env.example)).

<details>
<summary><b>A little more detail</b></summary>

- **Custom server** (`server.ts`, run via `tsx`): a Next.js App Router handler plus a `ws` WebSocket server on one port. Run it with `npm run dev`, **not** `next dev`.
- **WebSocket** `/ws/terminal/:sessionId`: the client sends `start` / `stdin` / `resize` / `kill`; the server replies `ready` / `stdout` / `exit` / `error`. Closing the tab detaches but keeps the agent running; output is buffered and replayed when you reconnect.
- **Sessions**: the conversation id is created before launch, so a card always has something to reattach to. New run: `cursor-agent --resume <id> "<prompt>"` / `claude --session-id <id> "<prompt>"`; resume: `--resume <id>`. On an untrusted folder the one-time trust prompt is auto-accepted (it's your own repo).
- **Database**: SQLite at `data/kanban.db`. There are no migration files, so `db:push` is the upgrade path.

> ⚠️ **Upgrading an existing DB:** for a new *non-null* column on a table with rows, `db:push` may offer a destructive **"truncate"** — don't accept it; abort and add the column by hand, e.g. `sqlite3 data/kanban.db 'ALTER TABLE agent_sessions ADD COLUMN activity text;'`.

For the full architecture, see [`CLAUDE.md`](CLAUDE.md).

</details>

## License

**inady KANBAN** is **source-available** software under the
[PolyForm Noncommercial License 1.0.0](LICENSE):

- ✅ Free for any **noncommercial** purpose — personal projects, hobby use, research, education, and noncommercial organizations.
- ❌ **Commercial use is not granted.**
- ℹ️ Because it restricts commercial use, this is **not** an OSI-approved "open source" license.

For commercial licensing, contact the author ([@inadysensei](https://github.com/inadysensei)).

Copyright © 2026 inadysensei.
