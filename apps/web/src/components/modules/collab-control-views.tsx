'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  BarChart3,
  Check,
  Clock,
  Copy,
  Download,
  FolderKanban,
  Hash,
  KeyRound,
  MessagesSquare,
  Plus,
  Search,
  Send,
  Settings,
  Users,
  Video,
} from 'lucide-react';
import {
  MeetingStudio,
  PreJoinGreenRoom,
  type MeetingRow,
} from '@/components/modules/meeting-studio';
import { useAuth, useLang } from '@/components/providers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { api, patch, post, put } from '@/lib/api';
import { ROLE_LABELS, type Role } from '@/lib/permissions';
import { cn } from '@/lib/cn';

// ─── 1. TEAM CHAT PAGE (/chat) ───────────────────────────────────────────────

interface ChatChannel {
  id: string;
  name: string;
  type: 'PROJECT' | 'DEPARTMENT' | 'GROUP' | 'DIRECT';
  description: string;
  projectName: string | null;
}

interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  body: string;
  createdAt: string;
}

export function ChatView() {
  const { lang } = useLang();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeId, setActiveId] = useState<string>('ch_general');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');

  const loadChannels = useCallback(async () => {
    const chs = await api<ChatChannel[]>('/chat/channels');
    setChannels(chs);
    if (chs.length > 0 && !chs.some((c) => c.id === activeId)) {
      setActiveId(chs[0].id);
    }
  }, [activeId]);

  const loadMessages = useCallback(async (channelId: string) => {
    setMessages(await api<ChatMessage[]>(`/chat/channels/${channelId}/messages`));
  }, []);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    if (activeId) void loadMessages(activeId);
  }, [activeId, loadMessages]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await post(`/chat/channels/${activeId}/messages`, { body: text });
    setText('');
    await loadMessages(activeId);
  }

  async function onCreateChannel(e: FormEvent) {
    e.preventDefault();
    const created = await post<ChatChannel>('/chat/channels', {
      name: newChannelName,
      description: newChannelDesc,
      type: 'GROUP',
    });
    setModalOpen(false);
    setNewChannelName('');
    setNewChannelDesc('');
    await loadChannels();
    setActiveId(created.id);
  }

  const activeChannel = channels.find((c) => c.id === activeId);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Team & Project Chat</h2>
          <p className="mt-1 text-sm text-muted">
            Dedicated channels for project delivery, engineering guilds and announcements.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> New channel
        </Button>
      </header>

      <Card className="grid min-h-[540px] overflow-hidden md:grid-cols-[260px_1fr]">
        <aside className="border-b border-line bg-canvas/50 p-3 md:border-b-0 md:border-r">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Channels ({channels.length})
          </p>
          <ul className="space-y-1">
            {channels.map((ch) => (
              <li key={ch.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(ch.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                    ch.id === activeId
                      ? 'bg-gold/15 font-medium text-gold-strong'
                      : 'text-ink hover:bg-surface',
                  )}
                >
                  <Hash className="h-4 w-4 shrink-0 text-gold" />
                  <span className="truncate">{ch.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex flex-col">
          <div className="border-b border-line px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-gold" />
              <h3 className="font-semibold text-ink">{activeChannel?.name ?? 'general'}</h3>
              {activeChannel?.projectName && (
                <Badge tone="gold">{activeChannel.projectName}</Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">{activeChannel?.description}</p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center text-muted">
                <MessagesSquare className="h-8 w-8 text-muted/60 mb-2" />
                <p className="font-semibold text-ink text-sm">No messages in #{activeChannel?.name ?? 'channel'} yet</p>
                <p className="text-xs mt-1">Start the conversation by sending the first message below.</p>
              </div>
            ) : (
              messages.map((msg) => (
              <div key={msg.id} className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-semibold text-gold">
                  {msg.senderName.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1 rounded-2xl border border-line bg-canvas/40 px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-ink">{msg.senderName}</span>
                    <Badge>{ROLE_LABELS[msg.senderRole as Role]?.[lang] ?? msg.senderRole}</Badge>
                    <span className="text-[11px] text-muted">
                      {new Date(msg.createdAt).toLocaleTimeString('en-LK', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Asia/Colombo',
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink">{msg.body}</p>
                </div>
              </div>
            )))}
          </div>

          <form onSubmit={onSend} className="flex gap-2 border-t border-line p-4">
            <Input
              placeholder={`Message #${activeChannel?.name ?? 'channel'}…`}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button type="submit">
              <Send className="h-4 w-4" /> Send
            </Button>
          </form>
        </div>
      </Card>

      <Modal open={modalOpen} title="Create chat channel" onClose={() => setModalOpen(false)}>
        <form onSubmit={onCreateChannel} className="space-y-4">
          <Field label="Channel name" htmlFor="ch-name">
            <Input
              id="ch-name"
              required
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="e.g. prj-lankamed-portal"
            />
          </Field>
          <Field label="Purpose / description" htmlFor="ch-desc">
            <Input
              id="ch-desc"
              required
              value={newChannelDesc}
              onChange={(e) => setNewChannelDesc(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create channel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── 2. MEETINGS PAGE (/meetings) — ZOOM-GRADE WEBRTC STUDIO ───────────────

export function MeetingsView() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Schedule form state
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [startsAt, setStartsAt] = useState(() => new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');

  // Join by room code & pre-join green room state
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [preJoin, setPreJoin] = useState<
    | { mode: 'existing'; meeting: MeetingRow }
    | { mode: 'instant'; title: string; agenda: string }
    | null
  >(null);
  const [activeSession, setActiveSession] = useState<{
    room: MeetingRow;
    micOn: boolean;
    camOn: boolean;
  } | null>(null);
  const handledUrlParamRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMeetings(await api<MeetingRow[]>('/meetings'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Periodically refresh meeting lobby list while not inside a call
  useEffect(() => {
    if (activeSession || preJoin) return;
    const t = setInterval(() => {
      void api<MeetingRow[]>('/meetings').then(setMeetings).catch(() => undefined);
    }, 6000);
    return () => clearInterval(t);
  }, [activeSession, preJoin]);

  // Auto-open Pre-Join Green Room if user navigated via ?room=YH-ROOM-XXX invite link
  useEffect(() => {
    if (handledUrlParamRef.current || loading || typeof window === 'undefined') return;
    const code = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase();
    if (!code) return;
    handledUrlParamRef.current = true;
    const match = meetings.find((m) => m.roomCode.toUpperCase() === code || m.id.toUpperCase() === code);
    if (match) {
      setPreJoin({ mode: 'existing', meeting: match });
    } else {
      setRoomCodeInput(code);
    }
  }, [loading, meetings]);

  const confirmPreJoin = async ({ micOn, camOn }: { micOn: boolean; camOn: boolean }) => {
    if (!preJoin) return;
    setJoining(true);
    setJoinError(null);
    try {
      let joined: MeetingRow;
      if (preJoin.mode === 'instant') {
        joined = await post<MeetingRow>('/meetings', {
          title: preJoin.title,
          agenda: preJoin.agenda,
          instant: true,
          micOn,
          camOn,
        });
      } else {
        joined = await post<MeetingRow>(`/meetings/${preJoin.meeting.id}/join`, {
          micOn,
          camOn,
        });
      }
      setPreJoin(null);
      setActiveSession({ room: joined, micOn, camOn });
      void load();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Unable to enter meeting room.');
    } finally {
      setJoining(false);
    }
  };

  const onJoinByCode = async (e: FormEvent) => {
    e.preventDefault();
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) return;
    setJoinError(null);
    const localMatch = meetings.find(
      (m) => m.roomCode.toUpperCase() === code || m.id.toUpperCase() === code,
    );
    if (localMatch) {
      setRoomCodeInput('');
      setPreJoin({ mode: 'existing', meeting: localMatch });
      return;
    }
    setJoining(true);
    try {
      const joined = await post<MeetingRow>('/meetings/join-by-code', {
        roomCode: code,
        micOn: true,
        camOn: true,
      });
      setRoomCodeInput('');
      setActiveSession({ room: joined, micOn: true, camOn: true });
      void load();
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Invalid meeting room code.');
    } finally {
      setJoining(false);
    }
  };

  const onSchedule = async (e: FormEvent) => {
    e.preventDefault();
    await post<MeetingRow>('/meetings', {
      title,
      agenda,
      startsAt: new Date(startsAt).toISOString(),
      notes,
    });
    setModalOpen(false);
    setTitle('');
    setAgenda('');
    setNotes('');
    await load();
  };

  const markCompleted = async (id: string) => {
    await patch(`/meetings/${id}`, { status: 'COMPLETED' });
    await load();
  };

  const copyInvite = async (mtg: MeetingRow) => {
    const url = `${window.location.origin}/meetings?room=${mtg.roomCode}`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopiedId(mtg.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (activeSession) {
    return (
      <MeetingStudio
        initialRoom={activeSession.room}
        initialMicOn={activeSession.micOn}
        initialCamOn={activeSession.camOn}
        currentUser={{
          id: user?.id ?? '',
          fullName: user?.fullName ?? 'You',
          role: user?.role ?? 'STAFF',
        }}
        onExited={() => {
          setActiveSession(null);
          void load();
        }}
        onMeetingUpdated={(updated) => {
          setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }}
      />
    );
  }

  if (preJoin) {
    const meetingTitle =
      preJoin.mode === 'instant' ? preJoin.title : preJoin.meeting.title;
    const roomCode =
      preJoin.mode === 'instant' ? 'NEW ROOM' : preJoin.meeting.roomCode;
    const organizerName =
      preJoin.mode === 'instant'
        ? user?.fullName ?? 'You'
        : preJoin.meeting.organizerName;

    return (
      <div className="space-y-4">
        {joinError && (
          <div className="mx-auto max-w-4xl rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-500">
            {joinError}
          </div>
        )}
        <PreJoinGreenRoom
          meetingTitle={meetingTitle}
          roomCode={roomCode}
          organizerName={organizerName}
          userName={user?.fullName ?? 'You'}
          joining={joining}
          onCancel={() => {
            setPreJoin(null);
            setJoinError(null);
          }}
          onJoin={(opts) => void confirmPreJoin(opts)}
        />
      </div>
    );
  }

  const liveCount = meetings.filter((m) => m.status === 'LIVE').length;
  const activePeople = meetings.reduce((sum, m) => sum + (m.participants?.length ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">
            Yakunex Hub Meet — Live Video & Screen Share
          </h2>
          <p className="mt-1 text-sm text-muted">
            Zoom-grade peer-to-peer HD video, crystal clear two-way audio, screen sharing,
            reactions & live room chat inside your browser.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <form onSubmit={onJoinByCode} className="flex items-center gap-2">
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <Input
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value)}
                placeholder="Room code (YH-ROOM-...)"
                className="h-10 w-48 pl-9 text-xs uppercase"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={joining || !roomCodeInput.trim()}>
              Join Code
            </Button>
          </form>

          <Button
            variant="primary"
            onClick={() =>
              setPreJoin({
                mode: 'instant',
                title: `${user?.fullName ?? 'Team'}'s Instant Meeting`,
                agenda: 'Live video sync & screen share huddle',
              })
            }
          >
            <Video className="h-4 w-4" /> New Meeting
          </Button>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Schedule
          </Button>
        </div>
      </header>

      {joinError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-500">
          {joinError}
        </div>
      )}

      {/* Quick overview strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Live Rooms"
          value={String(liveCount)}
          hint={liveCount > 0 ? 'Active calls happening now' : 'Start an instant call anytime'}
          icon={<Video className="h-5 w-5" />}
        />
        <StatCard
          label="People In Call"
          value={String(activePeople)}
          hint="Connected with live mic & camera"
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Scheduled Rooms"
          value={String(meetings.filter((m) => m.status === 'SCHEDULED').length)}
          hint="Upcoming team standups & reviews"
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {loading ? (
        <Skeleton className="h-56 rounded-2xl" />
      ) : meetings.length === 0 ? (
        <Card className="p-12 text-center text-muted">
          <Video className="mx-auto mb-3 h-10 w-10 text-muted/60" />
          <p className="font-display text-lg font-semibold text-ink">
            No active or scheduled meetings yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm">
            Start a new instant video meeting with screen sharing or schedule a sprint review room.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button
              variant="primary"
              onClick={() =>
                setPreJoin({
                  mode: 'instant',
                  title: `${user?.fullName ?? 'Team'}'s Instant Meeting`,
                  agenda: 'Live video sync & screen share huddle',
                })
              }
            >
              <Video className="h-4 w-4" /> Start Instant Meeting
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" /> Schedule Meeting
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {meetings.map((mtg) => {
            const inCallCount = mtg.participants?.length ?? 0;
            const isLive = mtg.status === 'LIVE';
            return (
              <Card key={mtg.id} className="flex flex-col justify-between p-5">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          isLive
                            ? 'danger'
                            : mtg.status === 'SCHEDULED'
                              ? 'gold'
                              : 'success'
                        }
                      >
                        {isLive ? '● LIVE NOW' : mtg.status}
                      </Badge>
                      <Badge tone="neutral">{mtg.roomCode}</Badge>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyInvite(mtg)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted transition hover:bg-canvas hover:text-ink"
                    >
                      {copiedId === mtg.id ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-500" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" /> Invite Link
                        </>
                      )}
                    </button>
                  </div>

                  <h3 className="mt-2.5 font-display text-lg font-semibold text-ink">
                    {mtg.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{mtg.agenda}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span>Host: {mtg.organizerName}</span>
                    <span>
                      {new Date(mtg.startsAt).toLocaleString('en-LK', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: 'Asia/Colombo',
                      })}
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-ink">
                      <Users className="h-3.5 w-3.5 text-gold-600" />
                      {inCallCount > 0 ? `${inCallCount} in call` : 'Waiting to start'}
                    </span>
                  </div>

                  {mtg.notes && (
                    <div className="mt-3 rounded-xl bg-canvas px-3 py-2 text-xs text-muted">
                      <strong className="text-ink">Notes:</strong> {mtg.notes}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3.5">
                  <Button
                    variant={isLive ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setPreJoin({ mode: 'existing', meeting: mtg })}
                  >
                    <Video className="h-3.5 w-3.5" />{' '}
                    {mtg.status === 'COMPLETED' ? 'Reopen & Join' : 'Join Meeting'}
                  </Button>
                  {mtg.status !== 'COMPLETED' && mtg.status !== 'CANCELLED' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void markCompleted(mtg.id)}
                    >
                      End / Complete
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Schedule Yakunex Hub Meet Room"
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={onSchedule} className="space-y-4">
          <Field label="Meeting title" htmlFor="mt-title">
            <Input
              id="mt-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Architecture Review & Sprint Demo"
            />
          </Field>
          <Field label="Date & time" htmlFor="mt-time">
            <Input
              id="mt-time"
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
          <Field label="Agenda" htmlFor="mt-agenda">
            <Input
              id="mt-agenda"
              required
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="Topics to cover & screen share walkthrough"
            />
          </Field>
          <Field label="Initial notes / action items" htmlFor="mt-notes">
            <Input id="mt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Meeting Room</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── 3. REPORTS PAGE (/reports) ──────────────────────────────────────────────

interface ReportsData {
  projectProgress: Array<{
    id: string;
    code: string;
    name: string;
    clientName: string;
    status: string;
    budget: number;
    progressPercent: number;
    totalTasks: number;
    completedTasks: number;
    hoursLogged: number;
  }>;
  bugsBySeverity: Array<{ severity: string; count: number }>;
  tasksByStatus: Array<{ status: string; count: number }>;
  totalBillableMinutes: number;
  totalNonBillableMinutes: number;
}

export function ReportsView() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<ReportsData>('/reports/summary')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  function exportCsv() {
    if (!data) return;
    const header = 'Code,Project Name,Client,Status,Budget (LKR),Progress (%),Tasks Completed,Total Tasks,Hours Logged\n';
    const rows = data.projectProgress
      .map(
        (p) =>
          `"${p.code}","${p.name}","${p.clientName}","${p.status}",${p.budget},${p.progressPercent},${p.completedTasks},${p.totalTasks},${p.hoursLogged}`,
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'yakunex-hub-delivery-report.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Analytics & Reports</h2>
          <p className="mt-1 text-sm text-muted">
            Executive delivery metrics, billable hour utilization and defect distribution.
          </p>
        </div>
        <Button onClick={exportCsv} disabled={!data}>
          <Download className="h-4 w-4" /> Export CSV report
        </Button>
      </header>

      {loading || !data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Average project completion"
              value={`${Math.round(
                data.projectProgress.reduce((s, p) => s + p.progressPercent, 0) /
                  Math.max(1, data.projectProgress.length),
              )}%`}
              hint="Across active portfolio"
              icon={<FolderKanban className="h-4 w-4" />}
            />
            <StatCard
              label="Billable hours logged"
              value={`${(data.totalBillableMinutes / 60).toFixed(1)}h`}
              hint="Verified client delivery"
              icon={<Clock className="h-4 w-4" />}
            />
            <StatCard
              label="Total contracted budget"
              value={`LKR ${(
                data.projectProgress.reduce((s, p) => s + p.budget, 0) / 1_000_000
              ).toFixed(1)}M`}
              hint="Active client contracts"
              icon={<BarChart3 className="h-4 w-4" />}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Project completion (%)"
                description="Delivery progress across active projects."
              />
              <div className="flex h-64 flex-col justify-center gap-3 overflow-y-auto p-5">
                {data.projectProgress.length === 0 ? (
                  <p className="text-center text-xs text-muted">No active projects yet.</p>
                ) : (
                  data.projectProgress.map((entry) => (
                    <div key={entry.id} className="grid grid-cols-[96px_1fr_42px] items-center gap-3 text-xs">
                      <span className="truncate font-mono font-medium text-muted" title={entry.name}>
                        {entry.code}
                      </span>
                      <div className="h-4 w-full overflow-hidden rounded-r-md bg-canvas">
                        <div
                          className="h-full rounded-r-md bg-[#D5A52E] transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, entry.progressPercent))}%` }}
                        />
                      </div>
                      <span className="text-right font-semibold tabular-nums text-text">
                        {entry.progressPercent}%
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Tasks by workflow stage"
                description="Distribution of tasks across Kanban columns."
              />
              <div className="flex h-64 flex-col justify-center gap-3 p-5">
                {(() => {
                  const maxCount = Math.max(...data.tasksByStatus.map((s) => s.count), 1);
                  return data.tasksByStatus.map((stage) => {
                    const pct = Math.round((stage.count / maxCount) * 100);
                    return (
                      <div key={stage.status} className="grid grid-cols-[110px_1fr_36px] items-center gap-3 text-xs">
                        <span className="truncate font-medium text-muted">{stage.status}</span>
                        <div className="h-4 w-full overflow-hidden rounded-r-md bg-canvas">
                          <div
                            className="h-full rounded-r-md bg-[#D5A52E] transition-all duration-300"
                            style={{ width: `${stage.count > 0 ? Math.max(pct, 6) : 0}%` }}
                          />
                        </div>
                        <span className="text-right font-semibold tabular-nums text-text">{stage.count}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Project delivery & budget summary"
              description="Detailed breakdown included in CSV exports."
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[740px] text-left text-sm">
                <thead className="bg-canvas/60 text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-5 py-3">Code & Project</th>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Tasks</th>
                    <th className="px-5 py-3">Hours</th>
                    <th className="px-5 py-3">Budget</th>
                    <th className="px-5 py-3 text-right">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.projectProgress.map((p) => (
                    <tr key={p.id} className="hover:bg-canvas/40">
                      <td className="px-5 py-3.5">
                        <p className="font-mono text-xs text-muted">{p.code}</p>
                        <p className="font-medium text-ink">{p.name}</p>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted">{p.clientName}</td>
                      <td className="px-5 py-3.5">
                        <Badge tone="gold">{p.status}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        {p.completedTasks}/{p.totalTasks}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs">{p.hoursLogged}h</td>
                      <td className="px-5 py-3.5 text-xs">LKR {p.budget.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-right font-semibold">{p.progressPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── 4. AUDIT LOGS PAGE (/audit-logs) ────────────────────────────────────────

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { fullName: string } | null;
}

export function AuditLogsView() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api<AuditRow[]>('/audit-logs')
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      l.entityType.toLowerCase().includes(q) ||
      (l.actor?.fullName.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-3xl font-semibold">Security Audit Logs</h2>
        <p className="mt-1 text-sm text-muted">
          Append-only record of authentication events, role assignments and workspace modifications.
        </p>
      </header>

      <Card className="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Filter audit trail by action (e.g. LOGIN_SUCCESS), actor or entity…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="p-6">
            <Skeleton className="h-48" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-canvas/60 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3">Timestamp (Asia/Colombo)</th>
                  <th className="px-5 py-3">Actor</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Entity</th>
                  <th className="px-5 py-3">IP & Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-xs text-muted">
                      No security audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-canvas/40">
                    <td className="px-5 py-3.5 font-mono text-xs text-muted">
                      {new Date(row.createdAt).toLocaleString('en-LK', {
                        dateStyle: 'medium',
                        timeStyle: 'medium',
                        timeZone: 'Asia/Colombo',
                      })}
                    </td>
                    <td className="px-5 py-3.5 font-medium">
                      {row.actor?.fullName ?? 'System'}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge
                        tone={
                          row.action.includes('FAILED') || row.action.includes('LOCKED')
                            ? 'danger'
                            : 'gold'
                        }
                      >
                        {row.action}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      <span className="font-medium text-ink">{row.entityType}</span>
                      {row.entityId && (
                        <span className="ml-1 font-mono text-muted">({row.entityId})</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted">
                      {row.ipAddress ?? '127.0.0.1'}
                      {row.metadata ? ` · ${JSON.stringify(row.metadata)}` : ''}
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── 5. SETTINGS & RBAC MATRIX PAGE (/settings) ──────────────────────────────

interface SettingsPayload {
  settings: {
    name: string;
    slug: string;
    timezone: string;
    workDayStart: string;
    workDayEnd: string;
    idleTimeoutMinutes: number;
    enforceSingleTimer: boolean;
    requirePasswordRotationDays: number;
  };
  roleMatrix: Record<Role, string[]>;
  permissionCatalog: string[];
}

const ROLES_ORDER: Role[] = ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF', 'INTERN'];

export function SettingsView() {
  const { lang } = useLang();
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Colombo');
  const [workDayStart, setWorkDayStart] = useState('08:30');
  const [workDayEnd, setWorkDayEnd] = useState('17:30');
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState('10');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<SettingsPayload>('/settings');
    setData(res);
    setName(res.settings.name);
    setTimezone(res.settings.timezone);
    setWorkDayStart(res.settings.workDayStart);
    setWorkDayEnd(res.settings.workDayEnd);
    setIdleTimeoutMinutes(String(res.settings.idleTimeoutMinutes));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveOrgSettings(e: FormEvent) {
    e.preventDefault();
    await put('/settings', {
      name,
      timezone,
      workDayStart,
      workDayEnd,
      idleTimeoutMinutes: Number(idleTimeoutMinutes),
    });
    setSavedNotice('Organization profile and working policies saved.');
    setTimeout(() => setSavedNotice(null), 3000);
    await load();
  }

  async function toggleRolePermission(role: Role, permKey: string) {
    if (!data || role === 'SUPER_ADMIN') return;
    const current = new Set(data.roleMatrix[role] ?? []);
    if (current.has(permKey)) current.delete(permKey);
    else current.add(permKey);
    await put('/settings/role-permissions', { role, permissions: [...current] });
    setSavedNotice(`Updated default permissions for ${ROLE_LABELS[role][lang]}.`);
    setTimeout(() => setSavedNotice(null), 3000);
    await load();
  }

  if (!data) {
    return <Skeleton className="h-72 rounded-2xl" />;
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-3xl font-semibold">Settings & Role Permissions</h2>
        <p className="mt-1 text-sm text-muted">
          Company profile, working schedule policies and the global Role → Permission matrix.
        </p>
      </header>

      {savedNotice && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {savedNotice}
        </div>
      )}

      <Card>
        <CardHeader
          title="Organization profile & work policy"
          description="Applies across attendance, time tracking and reporting."
        />
        <form onSubmit={saveOrgSettings} className="space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Company name" htmlFor="st-name">
              <Input
                id="st-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Default timezone" htmlFor="st-tz">
              <Select id="st-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                <option value="Asia/Colombo">Asia/Colombo (GMT+05:30)</option>
                <option value="UTC">UTC</option>
                <option value="Europe/London">Europe/London</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Workday start" htmlFor="st-start">
              <Input
                id="st-start"
                type="time"
                value={workDayStart}
                onChange={(e) => setWorkDayStart(e.target.value)}
              />
            </Field>
            <Field label="Workday end" htmlFor="st-end">
              <Input
                id="st-end"
                type="time"
                value={workDayEnd}
                onChange={(e) => setWorkDayEnd(e.target.value)}
              />
            </Field>
            <Field label="Idle timeout (minutes)" htmlFor="st-idle">
              <Input
                id="st-idle"
                type="number"
                min={5}
                max={60}
                value={idleTimeoutMinutes}
                onChange={(e) => setIdleTimeoutMinutes(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit">Save settings</Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Role → Permission Matrix"
          description="Click any cell to grant or revoke a default permission for a role. Super Admin always holds all permissions."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-canvas/60 uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">Permission Key</th>
                {ROLES_ORDER.map((r) => (
                  <th key={r} className="px-4 py-3 text-center">
                    {ROLE_LABELS[r][lang]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.permissionCatalog.map((perm) => (
                <tr key={perm} className="hover:bg-canvas/40">
                  <td className="px-4 py-2.5 font-mono font-medium text-ink">{perm}</td>
                  {ROLES_ORDER.map((role) => {
                    const enabled = data.roleMatrix[role]?.includes(perm);
                    const locked = role === 'SUPER_ADMIN';
                    return (
                      <td key={role} className="px-4 py-2.5 text-center">
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => toggleRolePermission(role, perm)}
                          className={cn(
                            'inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors',
                            enabled
                              ? 'border-gold bg-gold/20 text-gold-strong'
                              : 'border-line bg-canvas text-transparent',
                            locked && 'cursor-not-allowed opacity-70',
                          )}
                          aria-label={`${perm} for ${role}`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

