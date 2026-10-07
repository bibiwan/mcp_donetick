# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`completedBy` on `donetick_complete_chore`.** The client already sent
  `completedBy` to DoneTick's `/chores/{id}/do`, but the tool's input schema
  did not expose it, so a completion was always credited to the caller. A
  circle admin can now record a chore as done by another member, which keeps
  points and least-completed rotation accurate when one person reports what
  another did. DoneTick rejects the field from non-admins.

## [2.1.0] - 2026-09-04

### Added

- **Streamable HTTP transport (`/mcp`).** The server now implements the
  current MCP Streamable HTTP transport in addition to the legacy SSE
  transport, using the same authentication, session cap and per-session
  DoneTick client as `/sse`. Existing SSE clients keep working unchanged
  against `/sse` and `/mcp/sse`; new clients should prefer `/mcp`.

## [2.0.1] - 2026-08-24

### Fixed

- **Chore descriptions are no longer a mix of HTML and plain text.** DoneTick
  stores this field as HTML — its web editor is a rich-text field, and the
  server rewrites `<img>` tags on read to re-sign attachments — but the
  connector wrote plain text, so an instance accumulated both
  `<p>Wipe the shelves</p>` and `Wipe the shelves` depending on where the chore
  was created. Now:
  - **On read**, `description` is always plain text. Paragraphs and `<br>`
    become newlines, list items gain a leading dash, entities are decoded, and
    images are named `[image: alt]` rather than vanishing. When the stored value
    actually contained markup, it is preserved alongside as `descriptionHtml`.
  - **On write**, plain text is wrapped into the minimal HTML the editor
    expects, so a multi-line description renders as written instead of
    collapsing into one run-on line. Input that is already HTML passes through
    untouched, so echoing back a value that was just read is safe.
  - An update that does not touch the description re-sends the stored markup
    rather than the normalized text, so unrelated edits cannot flatten it.

  Existing plain-text descriptions are left as they are: they read back
  identically, and every one of them is a single line, so nothing renders
  differently.

## [2.0.0] - 2026-08-23

Completion history, time tracking and per-subtask control, plus fixes for
several tools that were returning HTTP 400 or writing the wrong value. Every
endpoint was verified against a live DoneTick instance.

### Breaking

- **`donetick_get_chore` returns more fields.** It now merges
  `GET /chores/{id}` with `GET /chores/{id}/details`, adding `lastCompletedDate`,
  `lastCompletedBy`, `timeSpentSeconds`, `timerRunningSince` and
  `lastCompletionNotes`. DoneTick's `totalCompletedCount` is surfaced as
  `historyEntryCount`, because it counts every history row — reschedules and
  skips included — and reading it as a completion count is wrong.
- **The priority scale was documented backwards.** Tools advertised
  "0 = lowest, 5 = highest"; DoneTick treats **1 as the highest priority (P1)**
  and 4 as the lowest (P4), with 0 meaning none. Descriptions are corrected and
  the accepted range is now 0–4. Chores written through the old descriptions
  carry inverted priorities and need remapping (1↔4, 2↔3).
- **`donetick_set_priority` rejects 5.** DoneTick's endpoint validates
  `lt=5`, so 5 was always an HTTP 400. It is now refused client-side with a
  message naming the real range.
- **`donetick_update_chore` fails instead of writing blind.** It previously
  swallowed a failed read and sent empty `subTasks`/`labelsV2`, which deletes
  every subtask and label server-side. It now aborts with an explanatory error.

### Fixed

- **`donetick_set_due_date` was completely broken.** DoneTick requires
  `updatedAt` on `PUT /chores/{id}/dueDate` (`binding:"required"`), so every
  call returned `HTTP 400: 'DueDateReq.UpdatedAt' failed on the 'required' tag`.
  The connector now reads the chore and echoes its `updatedAt`, which also
  restores the intended optimistic-concurrency check.
- **Date-only values were rejected everywhere.** `YYYY-MM-DD` failed Go's
  RFC3339 binding with `parsing time "2026-09-01" as "2006-01-02T15:04:05Z07:00"`,
  despite the tool descriptions promising support. `YYYY-MM-DD` and
  `YYYY-MM-DD HH:mm` are now normalized to RFC3339, resolved in the configured
  timezone.
- **`donetick_create_chore` rejected `nextDueDate`** with a schema error
  ("must NOT have additional properties"), forcing a second `update_chore`
  call. It is now accepted as an alias of `dueDate`.
- **Subtask ordering was silently discarded.** DoneTick's model field is
  `orderId`, not `order`; every subtask landed at position 0 regardless of what
  was sent.
- **`donetick_create_chore` returned a bare id.** `POST /chores/` answers
  `{"res": 37}`, so callers received the number `37` instead of a chore. The
  connector now resolves it into the full object.
- **`donetick_set_subtasks` destroyed subtask identity.** Passing plain strings
  deleted and recreated every subtask, losing ids and completion state. Entries
  are now matched by id, or by name when no id is given, and the response says
  what was deleted.
- **`enabled` on `donetick_set_chore_notifications` is now optional**,
  defaulting to `true`, instead of failing validation on first use.
- Removed `setChoreStatus`, which called `PUT /chores/{id}/status` — a handler
  DoneTick defines but never routes (`// TODO: Not used in Routes`).
- Collection endpoints now use the exact trailing-slash paths gin registers,
  rather than relying on redirects.

### Added

- **Completion history** — `donetick_get_chore_history`, `donetick_get_history`,
  `donetick_modify_history_entry`, `donetick_delete_history_entry`. Entries
  carry a readable `statusName` (`completed`, `skipped`, `rescheduled`,
  `missed`, …), which is the only reliable way to tell a completion from an
  edit: `Chore.updatedAt` conflates both. Supports date ranges and status
  filters.
- **Time tracking** — `donetick_start_chore`, `donetick_pause_chore`,
  `donetick_get_chore_timer`, `donetick_reset_chore_timer`,
  `donetick_adjust_time_session`, `donetick_delete_time_session`. DoneTick does
  store per-chore durations; it simply has no field for logging time at
  completion.
- **Per-subtask control** — `donetick_complete_subtask`,
  `donetick_uncomplete_subtask`, `donetick_remove_subtask`, resolving subtasks
  by id or by name. Note that completing a recurring chore *clears* its
  subtasks rather than ticking them; this is DoneTick's own behaviour
  (`ResetSubtasksCompletion`) and is now documented in the tool description.
- **Archiving** — `donetick_list_archived_chores`, `donetick_archive_chore`,
  `donetick_unarchive_chore`, a reversible alternative to deletion.
- **Assignment and approval** — `donetick_set_chore_assignee`,
  `donetick_approve_chore`, `donetick_reject_chore`.
- **`donetick_get_thing_history`** for sensor and counter state changes.
- `completionWindow` and `requireApproval` on create and update.
- `DONETICK_TIMEZONE` (default `UTC`) and `DONETICK_DEFAULT_DUE_TIME`
  (default `18:00`) control how date-only inputs are resolved.
- `npm run smoke` runs `scripts/smoke-live.ts` against a real instance. It
  creates only `[mcp-test]`-prefixed objects, deletes them afterwards, and
  refuses to delete anything lacking that prefix.

### Changed

- Tool count: 37 → 57.
- Test suite: 92 → 293 tests. Coverage thresholds of 80% on statements,
  branches, functions and lines are now enforced by `npm test`, so the build
  fails if new code arrives untested.
- **Docker/GHCR is now the only distribution channel.** The npm publish job was
  removed: it had never actually run (its `if:` read an env var defined in the
  same step, which GitHub does not expose to that step's own condition), so the
  advertised `npx mcp-donetick` never resolved. It is not worth fixing — this is
  an HTTP SSE server, so it has to be hosted and reachable at a URL either way,
  which the container already handles. The `npx` references are gone from the
  docs.
- Release notes are read from this changelog instead of being hardcoded in the
  workflow, where they claimed "first official production release" on every tag.
- **The arm64 image now builds without emulation.** The Dockerfile's build stage
  is pinned to `$BUILDPLATFORM`: every production dependency is pure JavaScript
  and `tsc` emits identical output on any architecture, so nothing in it needs
  emulating. Under QEMU, `npm ci` died with
  `qemu: uncaught target signal 4 (Illegal instruction)` and hung the release.
  The runtime stage carries no `RUN`, so multi-arch images stay correct.
- Bumped `docker/build-push-action` to v6, which runs on Node 24 and no longer
  emits the Node 20 deprecation notice.

### Known limitations

- **Labels cannot be created or edited with an API key.** DoneTick mounts
  `/api/v1/labels` behind JWT-only middleware, unlike every other route. Reading
  falls back to extracting labels from chores. Manage them in the web UI.
- **No arbitrary duration can be logged.** `POST /chores/{id}/do` accepts no
  time-spent value, and DoneTick's manual-duration handler
  (`PUT /chores/{id}/timer`) exists in the source but is not routed. Use
  start/pause, or adjust a session's boundaries after the fact.
- **History windows are expressed in days.** DoneTick's `limit` parameter is a
  number of days, not of rows; `since`/`until` are applied client-side.

## [1.0.0] - 2026-08-21

- Initial release: 37 MCP tools over HTTP SSE covering chores, subtasks, things,
  triggers, labels, projects, circles and filters.
- Multi-arch Docker images on GHCR (`linux/amd64`, `linux/arm64`).
- OWASP hardening: timing-safe token comparison, SSRF protocol checks, security
  headers, payload caps, non-root container.

[2.1.0]: https://github.com/bibiwan/mcp_donetick/releases/tag/v2.1.0
[2.0.1]: https://github.com/bibiwan/mcp_donetick/releases/tag/v2.0.1
[2.0.0]: https://github.com/bibiwan/mcp_donetick/releases/tag/v2.0.0
[1.0.0]: https://github.com/bibiwan/mcp_donetick/releases/tag/v1.0.0
