# Yakunex Hub — Release Changelog

All notable changes to **Yakunex Hub** follow Semantic Versioning (`vMAJOR.MINOR.PATCH`):
- **Major (`vX.0.0`)**: Only bumped on an explicit Major System Update ("විශාල System Update එකක්").
- **Minor (`v1.X.0`)**: New features & enhancements.
- **Patch (`v1.0.X`)**: Bug fixes, security patches, and UI/UX polish.

---

## [v1.5.1] - 2026-11-26
### UI & UX (Yakunex Spatial 3D Liquid Glass Identity)
- **Apple 3D Liquid Glass Optical Design System (`globals.css`)**: Introduced Yakunex's signature visionOS / iOS 26 multi-layer specular glass primitives (`liquid-spatial-canvas`, `liquid-glass`, `liquid-glass-popover`, `liquid-glass-dock`, `liquid-orb`, `liquid-orb-gold`, `liquid-orb-ruby`, `liquid-video-pod`, `liquid-surface-adaptive`, `liquid-chat-canvas`, `liquid-bubble-own`, `liquid-bubble-peer`) with optical top-rim refraction, frosted backdrop blur/saturation, inner depth bevels, and tactile spring micro-interactions.
- **Yakunex Spatial Studio Redesign (`/meetings`, `/meet`, `MeetingStudio`)**: Replaced Zoom-style orange/blue lobby buttons and full-width black top/bottom bars with Yakunex's bespoke Spatial Command Deck, Spatial Mirror Pre-Join Check, Guest & Waiting Lounge capsules, floating Top HUD pills (`Orbital` / `Cinema` stage modes + 1-tap studio code), 3D Spatial Video Pods with concentric aura rings, floating Spatial Inspector, and a centered visionOS 3D Liquid Glass Control Dock (`Present`, `Suite`, `Spatial Shield`, `Spatial Board`, `Camera Studio`, `Spatial Breakout Pods`, `Polls & Q&A`).
- **Yakunex Liquid Glass Chat Redesign (`/chat` & In-Meeting Studio Chat)**: Replaced WhatsApp-style beige/dark backgrounds and green bubbles with an aurora-diffused `liquid-chat-canvas` stage, Champagne-Gold 3D glass own-message bubbles (`liquid-bubble-own`), frosted crystal peer bubbles (`liquid-bubble-peer`), `Whisper` direct-message pills, and floating 3D glass pill composers — with zero changes to backend APIs, WebRTC/LiveKit media logic, or other workspace modules.

---

## [v1.5.0] - 2026-11-25
### Security (World-Class Zero-Trust Hardening)
- **HKDF Cryptographic Key Separation (`RFC 5869`)**: Domain-separated signing and encryption keys for Access JWTs, Password-Reset/Invite JWTs, Meeting Guest HMAC tokens, Tamper-Evident Audit Chain HMACs, and AES-256-GCM 2FA secrets.
- **Zero-Leak Password Recovery & Strict JWT Enforcement**: Removed `resetToken`/`resetUrl` from `POST /api/auth/forgot-password` responses, enforced `typ === 'access'` + session fingerprints in `JwtAuthGuard` (blocking reset/invite token auth bypass and instantly revoking active tokens on password, role, or status change), and enforced `mustChangePassword` at the API guard layer.
- **Authenticator App Two-Factor Authentication (`RFC 6238 TOTP`) & Step-Up Auth**: Added TOTP 2FA setup, QR/URI provisioning, 8 single-use recovery codes, login OTP challenge, and Super Admin password step-up verification for Data Manager purges.
- **Global CSRF Shield, XSS Attachment Firewall & Public Rate-Limiting**: Added cookie-mutation Origin/`Sec-Fetch-Site`/`X-Requested-With` CSRF middleware, strict MIME & Data-URL sanitization across Chat, Meetings, Documents, and Avatars, `YH-XXXX-XXXX` high-entropy room codes, guest-verified TURN ICE config, HSTS + CSP headers, and complete `sessionStorage` cache wipe on logout.
- **GPS Privacy Isolation & Tamper-Evident Audit Chain**: Restricted team live GPS coordinates, trails, and breach counts on `GET /api/attendance` to Super Admin, HR (`ADMIN`), and `PROJECT_MANAGER`, and added HMAC-SHA256 hash chaining (`prevHash` → `hash`) to every `AuditLog` entry.

### Added & Improved
- **Google Maps Live Tracking Everywhere**: Upgraded `TeamLocationMap`, `AttendanceView`, and `AttendanceRulesSettings` to Google Maps (supporting both dynamic Super Admin `googleMapsApiKey` JS SDK mode with smooth in-place marker movement, Road/Satellite toggle, Auto-Follow, and pin-drop geofencing, plus instant key-free Google Maps live mode).
- **Jibble-Grade Time & Location UX**: Live ticking `HH:MM:SS` shift clock, pre-clock-in GPS zone distance checker, project/activity tagging & live activity switching on shifts, floating active-shift pill across pages, and interactive `All In / Working / On Break / Outside Zone / Out` roster synced with Google Maps.

### Fixed
- **Sri Lanka (`Asia/Colombo`) Shift Rollover & Attendance Bugs**: Unified all attendance, live-location, break, clock-out, and geofence sweep dates on `colomboClock().date` (fixing the `05:30 AM` UTC rollover bug), removed the stale `'2026-11-08'` fallback record, accumulated active break minutes on clock-out, and aligned initial clock-in geofence status with tracked role radius (`50m`).

---

## [v1.4.1] - 2026-11-22
### Added
- **Jibble-Style Intern Geofence & Live Attendance Rules**: Office GPS zone check (`50m` default radius with GPS accuracy hysteresis), 5-minute outside-zone grace window before unauthorized absence + HR/Super Admin alert, automatic late short-leave recording after `08:30`, work-day clock-in reminders (`08:15` & `08:30`), and tracking-lost alerts.
- **Team Live Location Map & Attendance Calendar**: Interactive live team location map (`team-location-map.tsx`), monthly attendance calendar (`attendance-calendar.tsx`), floating attendance assistant (`attendance-assistant.tsx`), and Super Admin attendance rules settings (`attendance-rules-settings.tsx`).

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
