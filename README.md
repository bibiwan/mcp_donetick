# 🚀 DoneTick MCP Server (Model Context Protocol)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/Tests-88%20Passed%20(100%25)-brightgreen.svg)]()
[![OWASP Hardened](https://img.shields.io/badge/Security-OWASP%20Hardened-green.svg)]()
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)]()

A complete, production-ready **Model Context Protocol (MCP)** server for **[DoneTick](https://donetick.com)** (self-hosted chores and task management). Supports the current **Streamable HTTP** transport (`/mcp`) as well as the legacy **HTTP Server-Sent Events (SSE)** transport (`/sse`) for older clients.

Compatible with **Mistral Le Chat**, **Claude Desktop**, **LibreChat**, **n8n**, **Open WebUI**, and any MCP client.

---

## 📋 Features

The server provides **57 specialized MCP tools** covering the DoneTick API,
including completion history and time tracking. Every endpoint is verified
against a live instance by `npm run smoke`.

### 1. 📝 Chores & Tasks (`donetick_*`)
- `donetick_list_chores`: List tasks with filters (search, project, status).
- `donetick_get_chore`: Full task details — recurrence, assignees, subtasks, labels, triggers — plus `lastCompletedDate`, `lastCompletedBy` and `timeSpentSeconds`.
- `donetick_create_chore`: Create a chore with due date, recurrence, priority, points, project, subtasks, labels, notifications, approval and sensor triggers.
- `donetick_update_chore`: Partial or full updates. Aborts rather than writing blind if the chore cannot be read first.
- `donetick_complete_chore`: Complete a chore and schedule its next recurrence. A circle admin can pass `completedBy` to credit the member who did it.
- `donetick_undo_chore`: Undo the last completion.
- `donetick_delete_chore`: Permanently delete a chore (prefer archiving).
- `donetick_set_due_date`: Set, change, or **clear** a due date.
- `donetick_set_priority`: Set priority — **1 is highest (P1)**, 4 lowest, 0 none.
- `donetick_skip_chore`: Skip the current recurrence.
- `donetick_nudge_chore`: Send a reminder nudge to the assignee.
- `donetick_set_chore_notifications`: Configure reminders (due date, predue, nagging, completion).
- `donetick_set_chore_project`, `donetick_set_chore_assignee`: Reassign a chore.

### 2. 📊 Completion History (`donetick_*`)
- `donetick_get_chore_history`: Every completion, skip, reschedule and miss for one chore, with a readable `statusName` and a summary. This is the only reliable way to tell "done" from "edited" — `updatedAt` conflates both.
- `donetick_get_history`: Circle-wide activity, filterable by date range and status.
- `donetick_modify_history_entry`: Correct when a completion was logged, or its notes.
- `donetick_delete_history_entry`: Remove a mistaken entry.

### 3. ⏱️ Time Tracking (`donetick_*`)
- `donetick_start_chore` / `donetick_pause_chore`: Run the per-chore timer.
- `donetick_get_chore_timer`: Total time spent plus each work session.
- `donetick_reset_chore_timer`: Clear the accumulated time.
- `donetick_adjust_time_session` / `donetick_delete_time_session`: Correct history after the fact.

### 4. 🧩 Subtasks (`donetick_*`)
- `donetick_set_subtasks`: Replace the whole list. Destructive, but preserves ids and completion state by matching on name.
- `donetick_add_subtask`: Append one subtask, leaving the others intact.
- `donetick_complete_subtask` / `donetick_uncomplete_subtask`: Tick one subtask, by id or by name.
- `donetick_remove_subtask`: Delete one subtask without rewriting the list.

> **Note:** completing a recurring chore *clears* its subtasks rather than
> ticking them. That is DoneTick's own behaviour, readying the next occurrence.

### 5. 🗄️ Archiving & Approval (`donetick_*`)
- `donetick_list_archived_chores`, `donetick_archive_chore`, `donetick_unarchive_chore`: Reversible alternative to deletion.
- `donetick_approve_chore`, `donetick_reject_chore`: Review completions on chores with `requireApproval`.

### 6. 🏷️ Labels & Tags (`donetick_*`)
- `donetick_list_labels`: List labels, falling back to extracting them from chores.
- `donetick_create_label`, `donetick_update_label`, `donetick_delete_label`: **See the limitation below** — these require a JWT.
- `donetick_set_chore_labels`, `donetick_add_chore_label`: Attach labels to a chore.

### 7. ⚡ Smart Things & Event Triggers (`donetick_*`)
- `donetick_list_things`, `donetick_create_thing`, `donetick_update_thing`, `donetick_delete_thing`.
- `donetick_set_thing_state`: Update a sensor or counter, automatically triggering linked tasks.
- `donetick_get_thing_history`: Every state a thing has held, and when.
- `donetick_link_thing_chore` / `donetick_unlink_thing_chore`: Trigger conditions (`eq`, `neq`, `gt`, `lt`, `gte`, `lte`).

### 8. 📁 Projects (`donetick_*`)
- `donetick_list_projects`, `donetick_create_project`, `donetick_update_project`, `donetick_delete_project`.

### 9. 👥 Circles, Members & Filters (`donetick_*`)
- `donetick_get_circle_info`, `donetick_list_members`, `donetick_list_filters`.

---

## 📅 Dates and priorities

**Dates.** DoneTick binds every date to a Go `time.Time`, so it only accepts
RFC3339. The connector additionally accepts `YYYY-MM-DD` and
`YYYY-MM-DD HH:mm`, resolving them in `DONETICK_TIMEZONE` (default `UTC`) at
`DONETICK_DEFAULT_DUE_TIME` (default `18:00`). Set both if you want
"due tomorrow" to mean a sensible local hour rather than midnight UTC.

**Priorities.** DoneTick counts **down**: `1` is the highest priority, shown as
a red P1 in the web UI, and `4` is the lowest; `0` means no priority. Versions
before 2.0.0 documented this backwards, so chores written through the old
descriptions may carry inverted values.

---

## ⚠️ Known limitations

- **Labels cannot be created or edited with an API key.** DoneTick mounts
  `/api/v1/labels` behind JWT-only middleware, unlike every other route.
  Reading falls back to extracting labels from chores; manage them in the web UI.
- **No arbitrary duration can be logged.** `POST /chores/{id}/do` accepts no
  time-spent value, and DoneTick's manual-duration handler is defined but never
  routed. Use start/pause, or adjust a session's boundaries afterwards.
- **History windows are in days.** DoneTick's `limit` is a number of days, not
  of rows; `since`/`until` are applied client-side after the fetch.

---

## 🔒 Security & OWASP Hardening

- **OWASP A01 & A07 (Access Control & Timing Attacks)**: Constant-time authentication token validation (`crypto.timingSafeEqual`).
- **OWASP A02 (Cryptographic Failures & Information Leakage)**: Secret redaction in logs and safe `/health` telemetry without credentials.
- **OWASP A03 (Injection & SSRF)**: Strict protocol sanitization (`http:`, `https:`) preventing protocol injection or SSRF (`file://`, `gopher://`).
- **OWASP A04 (Denial of Service)**: Strict JSON body payload limits (`1mb`) and active SSE session caps with connection pruning.
- **OWASP A05 (Security Misconfiguration)**: Hardened HTTP headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 0`, `Referrer-Policy: no-referrer`, `X-Powered-By` disabled). Non-root Docker execution (`USER node`).

---

## 🐳 Quick Start with Docker

### 1. Create a `docker-compose.yml`

```yaml
services:
  mcp-donetick:
    image: ghcr.io/bibiwan/mcp_donetick:latest
    container_name: mcp-donetick
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - HOST=0.0.0.0
      - DONETICK_URL=http://donetick:2021
      - DONETICK_TOKEN=
      # Resolves date-only inputs such as "2026-08-30" to a local hour
      - DONETICK_TIMEZONE=Europe/Paris
      - DONETICK_DEFAULT_DUE_TIME=18:00
      - MCP_AUTH_TOKEN=
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

### 2. Launch the container

```bash
docker compose up -d
```

---

## 🤖 Connect with Mistral Le Chat

1. In **[Mistral Le Chat](https://chat.mistral.ai/)**, go to **Settings** ➔ **Tools & MCP** (or **Connectors**).
2. Click **"Add MCP Server"**.
3. Fill in the connection settings:
   - **Name**: `DoneTick`
   - **URL**: `https://<your-server-host>:3000/mcp` (Streamable HTTP, recommended). Use `/sse` instead if your client only supports the legacy SSE transport.
   - **Authentication**: `Bearer Token`
   - **Token**: `<Your DoneTick API Token>` (generated in DoneTick ➔ Settings ➔ API Token)
4. Save and start chatting!

### Example Prompts:
- *"What chores are overdue or due today?"*
- *"Create a chore 'Clean espresso machine' for next Sunday with high priority and subtasks: 'Backflush grouphead', 'Descale boiler'."*
- *"Link chore #21 to my coffee counter (Thing #11) to trigger whenever counter >= 100."*
- *"Mark task #5 as completed with 20 points."*

---

## 🧪 Development & Testing

```bash
# Install dependencies
npm install

# Run the test suite with coverage.
# Enforces an 80% floor on statements, branches, functions and lines.
npm test

# Build TypeScript
npm run build

# Start local server
npm start
```

### Live smoke test

The unit suite mocks axios, so it proves the payloads are shaped as intended —
not that DoneTick accepts them. Before tagging a release, run the smoke test
against a real instance:

```bash
DONETICK_URL=https://donetick.example DONETICK_TOKEN=xxx npm run smoke
```

It creates only objects prefixed `[mcp-test]`, exercises every endpoint the
connector uses, deletes what it created, and refuses to delete anything lacking
that prefix. Existing chores are never modified.

---

## 📄 License

MIT License. Feel free to use, modify, and distribute.
