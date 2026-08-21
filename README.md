# 🚀 DoneTick MCP Server (Model Context Protocol SSE)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/Tests-88%20Passed%20(100%25)-brightgreen.svg)]()
[![OWASP Hardened](https://img.shields.io/badge/Security-OWASP%20Hardened-green.svg)]()
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)]()

A complete, production-ready **Model Context Protocol (MCP)** server implementing **HTTP Server-Sent Events (SSE)** for **[DoneTick](https://donetick.com)** (self-hosted chores and task management).

Compatible with **Mistral Le Chat**, **Claude Desktop**, **LibreChat**, **n8n**, **Open WebUI**, and any MCP client.

---

## 📋 Features

The server provides **37 specialized MCP tools** covering 100% of the DoneTick API:

### 1. 📝 Chores & Tasks (`donetick_*`)
- `donetick_list_chores`: List tasks with rich filters (search, project, assignee, completion status, due dates).
- `donetick_get_chore`: Retrieve complete task details (recurrence, assignees, subtasks, labels, triggers).
- `donetick_create_chore`: Create a chore with due date, recurrence, priority (0-5), points, project, subtasks, labels, smart notifications, and sensor triggers.
- `donetick_update_chore`: Partial or full chore updates (name, description, due date, project, priority, labels, subtasks, thing linking).
- `donetick_complete_chore`: Complete a chore and automatically schedule its next recurrence.
- `donetick_undo_chore`: Undo the last completion of a chore.
- `donetick_delete_chore`: Permanently delete a chore.
- `donetick_set_due_date`: Quickly adjust the due date of a chore.
- `donetick_set_priority`: Set priority level (0 = lowest to 5 = urgent).
- `donetick_skip_chore`: Skip the current recurrence of a recurring task.
- `donetick_nudge_chore`: Send a reminder nudge to the assigned user.
- `donetick_set_chore_notifications`: Configure reminders (due date, predue, nagging overdue, completion).

### 2. 🧩 Subtasks Management (`donetick_*`)
- `donetick_set_subtasks`: Replace or set the entire subtask list for a chore.
- `donetick_add_subtask`: Add a new subtask to a chore without modifying existing subtasks.

### 3. 🏷️ Labels & Tags (`donetick_*`)
- `donetick_list_labels`: List all labels in DoneTick (with automatic fallback resilience).
- `donetick_create_label`: Create a new label (name, color).
- `donetick_update_label`: Update a label name or color.
- `donetick_delete_label`: Delete a label.
- `donetick_set_chore_labels`: Replace all labels attached to a chore.
- `donetick_add_chore_label`: Add a label to a chore by label ID or by name.

### 4. ⚡ Smart Things & Event Triggers (`donetick_*`)
- `donetick_list_things`: List all connected devices, appliances, and counters.
- `donetick_create_thing`: Create a new Thing (type, state).
- `donetick_update_thing`: Update a Thing's metadata.
- `donetick_set_thing_state`: Update a sensor/counter state (e.g. coffee counter = 100, bin = full), automatically triggering linked tasks!
- `donetick_delete_thing`: Delete a Thing.
- `donetick_link_thing_chore`: Link a Thing to a Chore with custom trigger conditions (`eq`, `neq`, `gt`, `lt`, `gte`, `lte`).
- `donetick_unlink_thing_chore`: Detach a Thing trigger from a Chore.

### 5. 📁 Projects (`donetick_*`)
- `donetick_list_projects`: List all circle projects.
- `donetick_create_project`: Create a project with color and icon.
- `donetick_update_project`: Update a project.
- `donetick_delete_project`: Delete a project.

### 6. 👥 Circles, Members & Filters (`donetick_*`)
- `donetick_get_circle_info`: Information about the user circle.
- `donetick_list_members`: List circle members for task assignment.
- `donetick_list_filters`: List custom filters.

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
    image: ghcr.io/yourusername/mcp-donetick:latest
    container_name: mcp-donetick
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - HOST=0.0.0.0
      - DONETICK_URL=http://donetick:2021
      - DONETICK_TOKEN=
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
   - **URL**: `https://<your-server-host>:3000/sse`
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

# Run full test suite with coverage
npm test

# Build TypeScript
npm run build

# Start local server
npm start
```

---

## 📄 License

MIT License. Feel free to use, modify, and distribute.
