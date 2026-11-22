# Yakunex Hub — Release Changelog

All notable changes to **Yakunex Hub** follow Semantic Versioning (`vMAJOR.MINOR.PATCH`):
- **Major (`vX.0.0`)**: Only bumped on an explicit Major System Update ("විශාල System Update එකක්").
- **Minor (`v1.X.0`)**: New features & enhancements.
- **Patch (`v1.0.X`)**: Bug fixes, security patches, and UI/UX polish.

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
