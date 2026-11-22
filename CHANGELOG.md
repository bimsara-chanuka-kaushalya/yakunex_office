# Yakunex Hub — Release Changelog

All notable changes to **Yakunex Hub** follow Semantic Versioning (`vMAJOR.MINOR.PATCH`):
- **Major (`vX.0.0`)**: Only bumped on an explicit Major System Update ("විශාල System Update එකක්").
- **Minor (`v1.X.0`)**: New features & enhancements.
- **Patch (`v1.0.X`)**: Bug fixes, security patches, and UI/UX polish.

---

## [v1.3.1] - 2026-11-22
### Fixed
- **Profile Access & Approval Governance**: Restricted profile data editing to Super Admin, Admin, and HR (`HR` / `Admin` edits route to Super Admin approval in Approval Center; Super Admin edits apply immediately).
- **DP Approval Workflow**: Allowed all employees to customize and upload their own DP while routing non-HR/Admin DP uploads to HR / Super Admin approval before publishing.
- **Profile UI Cleanup**: Removed the Sri Lanka Payroll, EPF & Bank SLIPS Details section from `/profile`.

---

## [v1.3.0] - 2026-11-22
### Added
- **Interactive Profile Picture (DP) Customizer**: Added drag-to-reposition, zoom slider (`100%–300%`), 90° rotation, circular framing guide, and crisp 256×256 JPEG export before uploading.
- **Super Admin Module Access & Admin Tools**: Live per-role sidebar visibility rules (`SHOWN` / `LOCKED` / `HIDDEN` via `/api/module-access`) and Super Admin workspace management tools.

### Fixed
- **Global DP Sync Across All Surfaces**: Added `avatarUrl` to `toAuthUser()` in `AuthService` and switched `AuthProvider.reload()` to uncached `liveGet('/auth/me')` so uploading a new DP updates Sidebar, Topbar, Chat, Users, and Profile immediately.
- **Profile Header Cleanup**: Removed the truncated employee selector dropdown from the `/profile` header.

---

## [v1.2.1] - 2026-11-22
### Security & Reliability
- **LiveKit SFU Enforced Screen-Share Approval**: Default meeting `screenShareMode` is now `APPROVAL_REQUIRED`; LiveKit `canPublishSources` and `RoomServiceClient.updateParticipant` enforce screen-share permissions live at the media server level, and clients require server acceptance before announcing or rendering remote screen shares.
- **Meeting Camera / Mic / TURN Reliability**: Added a 4-second local media change grace window to prevent stale polls from reverting mic/cam toggles, triggered ICE restarts when dynamic TURN servers load behind strict NATs, and tuned default video startup to 720p @ 24fps.

---

## [v1.2.0] - 2026-11-22
### Added
- **WhatsApp-Grade Team Chat Rewrite**: Per-user unread counts (`chatReads` + `POST /api/chat/channels/:id/read`), `lastMessage` previews, `ALL / UNREAD / DIRECT / GROUPS` filters, mobile split-screen view, optimistic message sending with retry, auto-linkified URLs, and peer DM names/avatars.
- **Real-Time Meeting Push Stream ("Doorbell" SSE) & 3G ETag Optimization**: `GET /api/meetings/:id/stream` and guest push streams wake calls instantly while `?etag=...` returns compact `{ unchanged: true }` responses on 3G.
- **Super Admin Meeting Deletion & Cleanup**: `DELETE /api/meetings/:id` and `DELETE /api/meetings/ended` with audit logging, final non-restartable ended meetings, and instant 403 waiting-room stop.

---

## [v1.1.1] - 2026-11-22
### Performance & UX
- **Silent, Instant Live-Sync**: Replaced per-component SSE connections with a single shared `/api/workspace/live-stream` connection per tab and `isSilentRefresh()` background updates so views never flash loading skeletons during live refreshes.
- **Request Deduplication & Smart Polling**: Shared concurrent `liveGet` calls within 1s across widgets (excluding `/meetings` signaling) and scaled down backup polling when SSE streams are healthy.

---

## [v1.1.0] - 2026-11-22
### Added
- **Role-Based "My Day" Daily Workspace** (`GET /api/my-day` + `My day`, `Team`, `HR desk`, and `Company` dashboard panels with blocker reporting, daily standup, intern reflection, and bulk approval actions).
- **Global `Ctrl+K / ⌘K` Command Palette** for instant navigation and daily actions (Clock in/out, Break, Stop timer, Request leave, Instant meeting for non-interns).
- **Chat Channel Deep-Link** (`/chat?channel=<id>`) for direct jump-in from My Day.

---

## [v1.0.0] - 2026-11-22
### Initial Production Baseline Release
- Enterprise RBAC & 6-Tier Access Control (Super Admin, Admin, Management/HR/PM/ACC, Core Staff, Intern).
- Full Workforce Suite: Attendance with Office GPS Geofencing, Live Time Tracker, Leave Management (with 10-day Intern cap & Sri Lanka Poya/Mercantile Calendar), Sri Lanka APIT + EPF/ETF/SLIPS Payroll v2.
- Delivery & Project Suite: Projects, Jira-style Drag-and-Drop Kanban Tasks, Sprints & Burndown, Bugs & QA, Versioned Documents, External Client Portal, GitHub PR Webhook HMAC integration.
- Collaboration Suite: Role-based Team Chat, Zoom-grade LiveKit SFU/Mesh Video Meetings with 3G adaptive bitrate, Waiting Room, Passcode & Private Chat isolation.
- Enterprise Finance & Governance: Client Tax Invoicing (SSCL 2.5% + VAT 18%), Approval Center, Assets, Performance, Security Audit Logs, Active Sessions, and 3-way serverless snapshot concurrency merge.
- System-wide Semantic Versioning baseline (`v1.0.0`) across Web, API, PDF exports, Client Portal, and Health endpoints.
