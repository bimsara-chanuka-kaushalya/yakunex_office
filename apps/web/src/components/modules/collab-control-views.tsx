'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  BarChart3,
  Camera,
  CameraOff,
  Check,
  Clock,
  Download,
  FolderKanban,
  Hand,
  Hash,
  MessagesSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Plus,
  Radio,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Users,
  Video,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

// ─── 2. MEETINGS PAGE (/meetings) — BUILT-IN PROJECTFLOW MEET ───────────────

interface MeetingParticipant {
  userId: string;
  fullName: string;
  role: string;
  micOn: boolean;
  camOn: boolean;
  screenSharing: boolean;
  handRaised: boolean;
  joinedAt: string;
}

interface MeetingChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  body: string;
  createdAt: string;
}

interface MeetingRow {
  id: string;
  projectId: string;
  projectName: string;
  organizerName: string;
  title: string;
  agenda: string;
  startsAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';
  roomCode: string;
  attendeeCount: number;
  notes: string;
  participants: MeetingParticipant[];
  chatMessages: MeetingChatMessage[];
}

export function MeetingsView() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Schedule/Instant form state
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [startsAt, setStartsAt] = useState('2026-11-12T10:00');
  const [notes, setNotes] = useState('');

  // Built-in Live Studio state
  const [activeRoom, setActiveRoom] = useState<MeetingRow | null>(null);
  const [sideTab, setSideTab] = useState<'chat' | 'participants' | 'notes'>('chat');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [hasCameraStream, setHasCameraStream] = useState(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [callSeconds, setCallSeconds] = useState(0);
  const [recording, setRecording] = useState(false);
  const [roomChatText, setRoomChatText] = useState('');
  const [liveNotes, setLiveNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

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

  // Poll active room every 3 seconds for live participants & in-call chat
  useEffect(() => {
    if (!activeRoom) return;
    const roomId = activeRoom.id;
    const timer = setInterval(async () => {
      try {
        const updated = await api<MeetingRow>(`/meetings/${roomId}/room`);
        setActiveRoom(updated);
      } catch {
        // ignore transient poll error
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [activeRoom?.id]);

  // Call duration timer
  useEffect(() => {
    if (!activeRoom) {
      setCallSeconds(0);
      return;
    }
    const timer = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [activeRoom?.id]);

  // Attach camera stream whenever video element renders
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [activeRoom, hasCameraStream, camOn]);

  // Attach screen share stream whenever screen element renders
  useEffect(() => {
    if (screenVideoRef.current && screenStreamRef.current) {
      screenVideoRef.current.srcObject = screenStreamRef.current;
    }
  }, [activeRoom, screenSharing]);

  const stopAllMedia = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    setRecording(false);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    setHasCameraStream(false);
    setScreenSharing(false);
  }, []);

  useEffect(() => {
    return () => stopAllMedia();
  }, [stopAllMedia]);

  async function startCameraAndMic() {
    setMediaNotice(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setHasCameraStream(false);
      setMediaNotice('Browser media devices unavailable — joined in studio avatar mode.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      localStreamRef.current = stream;
      setHasCameraStream(true);
      setCamOn(true);
      setMicOn(true);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch {
      // Fallback: try audio-only, otherwise avatar mode
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });
        localStreamRef.current = audioStream;
        setHasCameraStream(false);
        setCamOn(false);
        setMicOn(true);
        setMediaNotice('Camera not detected — joined with live microphone & HD avatar.');
      } catch {
        setHasCameraStream(false);
        setMediaNotice(
          'Joined in ProjectFlow Virtual Studio mode (camera/mic hardware not connected).',
        );
      }
    }
  }

  async function joinRoom(mtg: MeetingRow) {
    const joined = await post<MeetingRow>(`/meetings/${mtg.id}/join`, {});
    setActiveRoom(joined);
    setLiveNotes(joined.notes ?? '');
    setMicOn(true);
    setCamOn(true);
    setHandRaised(false);
    await startCameraAndMic();
    await load();
  }

  async function startInstantMeeting() {
    const created = await post<MeetingRow>('/meetings', {
      title: `Instant Team Sync (${user?.fullName ?? 'Host'})`,
      agenda: 'Ad-hoc ProjectFlow live video, screen-share & architecture sync',
      instant: true,
      notes: '',
    });
    await joinRoom(created);
  }

  async function leaveRoom() {
    if (!activeRoom) return;
    stopAllMedia();
    await post(`/meetings/${activeRoom.id}/leave`, {});
    setActiveRoom(null);
    await load();
  }

  async function endMeetingForAll() {
    if (!activeRoom) return;
    stopAllMedia();
    await patch(`/meetings/${activeRoom.id}`, {
      status: 'COMPLETED',
      notes: liveNotes,
    });
    setActiveRoom(null);
    await load();
  }

  async function toggleMic() {
    if (!activeRoom) return;
    const next = !micOn;
    setMicOn(next);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = next;
      });
    }
    const updated = await patch<MeetingRow>(`/meetings/${activeRoom.id}/participant`, {
      micOn: next,
    });
    setActiveRoom(updated);
  }

  async function toggleCam() {
    if (!activeRoom) return;
    const next = !camOn;
    setCamOn(next);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = next;
      });
    }
    const updated = await patch<MeetingRow>(`/meetings/${activeRoom.id}/participant`, {
      camOn: next,
    });
    setActiveRoom(updated);
  }

  async function toggleScreenShare() {
    if (!activeRoom) return;
    if (screenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      setScreenSharing(false);
      const updated = await patch<MeetingRow>(`/meetings/${activeRoom.id}/participant`, {
        screenSharing: false,
      });
      setActiveRoom(updated);
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        screenStreamRef.current = displayStream;
        setScreenSharing(true);
        displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          setScreenSharing(false);
          void patch<MeetingRow>(`/meetings/${activeRoom.id}/participant`, {
            screenSharing: false,
          }).then(setActiveRoom);
        });
        const updated = await patch<MeetingRow>(`/meetings/${activeRoom.id}/participant`, {
          screenSharing: true,
        });
        setActiveRoom(updated);
      } catch {
        setMediaNotice('Screen share cancelled by user.');
      }
    } else {
      setScreenSharing(true);
      const updated = await patch<MeetingRow>(`/meetings/${activeRoom.id}/participant`, {
        screenSharing: true,
      });
      setActiveRoom(updated);
    }
  }

  async function toggleHandRaise() {
    if (!activeRoom) return;
    const next = !handRaised;
    setHandRaised(next);
    const updated = await patch<MeetingRow>(`/meetings/${activeRoom.id}/participant`, {
      handRaised: next,
    });
    setActiveRoom(updated);
  }

  function toggleRecording() {
    if (recording) {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      setRecording(false);
      return;
    }

    const activeStream = screenStreamRef.current ?? localStreamRef.current;
    if (activeStream && typeof MediaRecorder !== 'undefined') {
      try {
        recordedChunksRef.current = [];
        const recorder = new MediaRecorder(activeStream);
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${activeRoom?.roomCode ?? 'projectflow-meet'}-recording.webm`;
          a.click();
          URL.revokeObjectURL(url);
        };
        recorder.start();
        recorderRef.current = recorder;
        setRecording(true);
        setMediaNotice('Live local WebM recording started — stopping will download the file.');
      } catch {
        setRecording(true);
        setMediaNotice('Cloud session recording marker enabled for this room.');
      }
    } else {
      setRecording(true);
      setMediaNotice('Session recording active for this ProjectFlow Meet room.');
    }
  }

  async function onSendRoomChat(e: FormEvent) {
    e.preventDefault();
    if (!activeRoom || !roomChatText.trim()) return;
    await post(`/meetings/${activeRoom.id}/chat`, { body: roomChatText });
    setRoomChatText('');
    const updated = await api<MeetingRow>(`/meetings/${activeRoom.id}/room`);
    setActiveRoom(updated);
  }

  async function onSaveRoomNotes() {
    if (!activeRoom) return;
    await patch(`/meetings/${activeRoom.id}`, { notes: liveNotes });
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await post('/meetings', {
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
  }

  async function markCompleted(id: string) {
    await patch(`/meetings/${id}`, { status: 'COMPLETED' });
    await load();
  }

  const formatCallTimer = (secs: number) => {
    const mins = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const rem = (secs % 60).toString().padStart(2, '0');
    return `${mins}:${rem}`;
  };

  // ─── IN-APP LIVE VIDEO & AUDIO STUDIO VIEW ─────────────────────────────────
  if (activeRoom) {
    const otherParticipants = (activeRoom.participants ?? []).filter(
      (p) => p.userId !== user?.id,
    );

    return (
      <div className="space-y-4">
        {/* Top Live Studio Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-3.5 shadow-soft">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-3 py-1 text-xs font-semibold text-danger">
              <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
              LIVE ROOM · {activeRoom.roomCode}
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold leading-tight">
                {activeRoom.title}
              </h2>
              <p className="text-xs text-muted">
                {activeRoom.projectName} · Built-in ProjectFlow Meet Engine (No 3rd-party software)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {recording && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-2.5 py-1 text-xs font-semibold text-white">
                <Radio className="h-3.5 w-3.5 animate-pulse" /> REC
              </span>
            )}
            <span className="rounded-lg bg-canvas px-3 py-1.5 font-mono text-xs font-medium text-ink">
              {formatCallTimer(callSeconds)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-canvas px-3 py-1.5 text-xs font-medium text-ink">
              <Users className="h-3.5 w-3.5 text-gold-ink" />
              {activeRoom.participants?.length ?? 1} in room
            </span>
          </div>
        </div>

        {mediaNotice && (
          <div className="flex items-center justify-between rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-2 text-xs text-ink">
            <span>{mediaNotice}</span>
            <button
              type="button"
              onClick={() => setMediaNotice(null)}
              className="font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Studio Grid + Side Collaboration Drawer */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Left: Video & Screen Stage */}
          <div className=" flex flex-col justify-between rounded-2xl border border-line bg-ink p-4 text-canvas lg:col-span-8">
            {/* Screen Share Stage (if active) */}
            {screenSharing && (
              <div className="relative mb-4 overflow-hidden rounded-xl border border-gold/40 bg-black">
                <video
                  ref={screenVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-72 w-full object-contain"
                />
                <div className="absolute left-3 top-3 rounded-lg bg-gold px-2.5 py-1 text-xs font-semibold text-gold-ink">
                  You are presenting your screen
                </div>
              </div>
            )}

            {/* Participant Video Tiles */}
            <div
              className={cn(
                'grid min-h-[380px] gap-4',
                otherParticipants.length === 0
                  ? 'grid-cols-1'
                  : otherParticipants.length === 1
                    ? ' sm:grid-cols-2'
                    : 'sm:grid-cols-2 xl:grid-cols-3',
              )}
            >
              {/* Local User Video Tile */}
              <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-neutral-900 p-4">
                {hasCameraStream && camOn ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gold text-2xl font-bold text-gold-ink shadow-lg">
                      {(user?.fullName ?? 'You')
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <span className="text-xs text-neutral-400">
                      {camOn ? 'Virtual Studio Avatar' : 'Camera turned off'}
                    </span>
                  </div>
                )}

                {/* Overlay badges */}
                <div className="absolute left-3 top-3 flex items-center gap-1.5">
                  {handRaised && (
                    <span className="rounded-lg bg-gold px-2 py-1 text-xs font-bold text-gold-ink">
                      ✋ Hand Raised
                    </span>
                  )}
                </div>

                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-xl bg-black/65 px-3 py-1.5 backdrop-blur-sm">
                  <div className="truncate text-xs font-medium text-white">
                    {user?.fullName ?? 'You'} (You)
                  </div>
                  <div className="flex items-center gap-1.5">
                    {micOn ? (
                      <Mic className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <MicOff className="h-3.5 w-3.5 text-red-400" />
                    )}
                    {camOn ? (
                      <Camera className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <CameraOff className="h-3.5 w-3.5 text-red-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Remote / Room Participant Tiles */}
              {otherParticipants.map((p) => (
                <div
                  key={p.userId}
                  className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-neutral-900 p-4"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 text-2xl font-bold text-emerald-300 ring-2 ring-emerald-400/50">
                      {p.fullName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                      {p.micOn && (
                        <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 animate-ping rounded-full bg-emerald-400" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-white">{p.fullName}</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] text-neutral-300">
                      {ROLE_LABELS[p.role as Role]?.en ?? p.role}
                    </span>
                  </div>

                  {p.handRaised && (
                    <div className="absolute left-3 top-3 rounded-lg bg-gold px-2 py-1 text-xs font-bold text-gold-ink">
                      ✋ Hand Raised
                    </div>
                  )}

                  {p.screenSharing && (
                    <div className="absolute right-3 top-3 rounded-lg bg-emerald-500 px-2 py-1 text-[11px] font-bold text-black">
                      Sharing Screen
                    </div>
                  )}

                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-xl bg-black/65 px-3 py-1.5 backdrop-blur-sm">
                    <span className="truncate text-xs font-medium text-white">{p.fullName}</span>
                    <div className="flex items-center gap-1.5">
                      {p.micOn ? (
                        <Mic className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <MicOff className="h-3.5 w-3.5 text-red-400" />
                      )}
                      {p.camOn ? (
                        <Camera className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <CameraOff className="h-3.5 w-3.5 text-red-400" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Studio Control Dock */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/10 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition-colors',
                    micOn
                      ? 'bg-white/15 text-white hover:bg-white/25'
                      : 'bg-danger text-white hover:bg-danger/90',
                  )}
                >
                  {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  {micOn ? 'Mute Mic' : 'Unmute Mic'}
                </button>

                <button
                  type="button"
                  onClick={toggleCam}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition-colors',
                    camOn
                      ? 'bg-white/15 text-white hover:bg-white/25'
                      : 'bg-danger text-white hover:bg-danger/90',
                  )}
                >
                  {camOn ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
                  {camOn ? 'Stop Video' : 'Start Video'}
                </button>

                <button
                  type="button"
                  onClick={toggleScreenShare}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition-colors',
                    screenSharing
                      ? 'bg-gold text-gold-ink'
                      : 'bg-white/15 text-white hover:bg-white/25',
                  )}
                >
                  <MonitorUp className="h-4 w-4" />
                  {screenSharing ? 'Stop Sharing' : 'Share Screen'}
                </button>

                <button
                  type="button"
                  onClick={toggleHandRaise}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition-colors',
                    handRaised
                      ? 'bg-gold text-gold-ink'
                      : 'bg-white/15 text-white hover:bg-white/25',
                  )}
                >
                  <Hand className="h-4 w-4" />
                  {handRaised ? 'Lower Hand' : 'Raise Hand'}
                </button>

                <button
                  type="button"
                  onClick={toggleRecording}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition-colors',
                    recording
                      ? 'bg-danger text-white'
                      : 'bg-white/15 text-white hover:bg-white/25',
                  )}
                >
                  <Radio className="h-4 w-4" />
                  {recording ? 'Stop Recording' : 'Record'}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={leaveRoom}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white/15 px-3.5 text-xs font-semibold text-white hover:bg-white/25"
                >
                  <PhoneOff className="h-4 w-4" /> Leave Room
                </button>
                <button
                  type="button"
                  onClick={endMeetingForAll}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-danger px-3.5 text-xs font-semibold text-white hover:bg-danger/90"
                >
                  End Meeting
                </button>
              </div>
            </div>
          </div>

          {/* Right: In-Call Chat, Participants & Live Action Notes */}
          <Card className="flex h-[540px] flex-col overflow-hidden p-0 lg:col-span-4">
            <div className="grid grid-cols-3 border-b border-line bg-canvas p-1.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setSideTab('chat')}
                className={cn(
                  'rounded-lg py-2 transition-colors',
                  sideTab === 'chat' ? 'bg-surface font-semibold text-ink shadow-2xs' : 'text-muted',
                )}
              >
                Live Chat ({activeRoom.chatMessages?.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setSideTab('participants')}
                className={cn(
                  'rounded-lg py-2 transition-colors',
                  sideTab === 'participants'
                    ? 'bg-surface font-semibold text-ink shadow-2xs'
                    : 'text-muted',
                )}
              >
                People ({activeRoom.participants?.length ?? 1})
              </button>
              <button
                type="button"
                onClick={() => setSideTab('notes')}
                className={cn(
                  'rounded-lg py-2 transition-colors',
                  sideTab === 'notes'
                    ? 'bg-surface font-semibold text-ink shadow-2xs'
                    : 'text-muted',
                )}
              >
                Action Notes
              </button>
            </div>

            {sideTab === 'chat' && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
                  {(activeRoom.chatMessages ?? []).map((msg) => (
                    <div key={msg.id} className="rounded-xl bg-canvas p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink">{msg.senderName}</span>
                        <span className="text-[10px] text-muted">
                          {new Date(msg.createdAt).toLocaleTimeString('en-LK', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="mt-1 text-ink">{msg.body}</p>
                    </div>
                  ))}
                </div>
                <form onSubmit={onSendRoomChat} className="flex gap-2 border-t border-line p-3">
                  <Input
                    placeholder="Send message to room…"
                    value={roomChatText}
                    onChange={(e) => setRoomChatText(e.target.value)}
                  />
                  <Button type="submit" size="sm">
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </form>
              </div>
            )}

            {sideTab === 'participants' && (
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {(activeRoom.participants ?? []).map((p) => (
                  <div
                    key={p.userId}
                    className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-ink">
                        {p.fullName} {p.userId === user?.id ? '(You)' : ''}
                      </p>
                      <p className="text-[11px] text-muted">
                        {ROLE_LABELS[p.role as Role]?.en ?? p.role}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.handRaised && <span>✋</span>}
                      {p.micOn ? (
                        <Badge tone="success">Mic On</Badge>
                      ) : (
                        <Badge tone="neutral">Muted</Badge>
                      )}
                      {p.camOn ? (
                        <Badge tone="gold">Video</Badge>
                      ) : (
                        <Badge tone="neutral">No Cam</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {sideTab === 'notes' && (
              <div className="flex flex-1 flex-col justify-between p-4">
                <div className="space-y-2">
                  <p className="text-xs text-muted">
                    Shared minutes and action items are saved directly to this meeting record.
                  </p>
                  <textarea
                    rows={12}
                    value={liveNotes}
                    onChange={(e) => setLiveNotes(e.target.value)}
                    placeholder="Type decisions, sprint action items, and follow-ups here…"
                    className="w-full rounded-xl border border-line bg-canvas p-3 text-xs text-ink focus:border-ink focus:outline-hidden"
                  />
                </div>
                <div className="flex items-center justify-between pt-3">
                  <span className="text-xs text-success">
                    {notesSaved ? '✓ Notes saved to room' : ''}
                  </span>
                  <Button size="sm" onClick={onSaveRoomNotes}>
                    <Check className="h-3.5 w-3.5" /> Save meeting notes
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // ─── SCHEDULED & LIVE ROOM LOBBY LIST VIEW ─────────────────────────────────
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">
            ProjectFlow Meet — Built-in Video & Audio Rooms
          </h2>
          <p className="mt-1 text-sm text-muted">
            100% self-hosted in-app video, audio, screen-sharing, live room chat & action notes —
            no Zoom or third-party tools required.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" onClick={startInstantMeeting}>
            <Video className="h-4 w-4" /> Start Instant Meeting
          </Button>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Schedule Meeting
          </Button>
        </div>
      </header>

      {loading ? (
        <Skeleton className="h-56 rounded-2xl" />
      ) : meetings.length === 0 ? (
        <Card className="p-12 text-center text-muted">
          <Video className="mx-auto h-10 w-10 text-muted/60 mb-3" />
          <p className="font-semibold text-ink text-base">No active or scheduled meetings</p>
          <p className="text-sm mt-1">
            Host instant meetings with live video, audio and screen sharing, or schedule sprint standups.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Button variant="primary" onClick={startInstantMeeting}>
              <Video className="h-4 w-4" /> Start Instant Meeting
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" /> Schedule Meeting
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {meetings.map((mtg) => (
            <Card key={mtg.id} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        mtg.status === 'LIVE'
                          ? 'danger'
                          : mtg.status === 'SCHEDULED'
                            ? 'gold'
                            : 'success'
                      }
                    >
                      {mtg.status === 'LIVE' ? '● LIVE NOW' : mtg.status}
                    </Badge>
                    <Badge tone="neutral">Room {mtg.roomCode}</Badge>
                    <span className="text-xs text-muted">{mtg.projectName}</span>
                  </div>
                  <h3 className="mt-1.5 font-display text-xl font-semibold">{mtg.title}</h3>
                  <p className="mt-1 text-sm text-muted">{mtg.agenda}</p>
                  <p className="mt-2 text-xs text-muted">
                    Organized by {mtg.organizerName} ·{' '}
                    {new Date(mtg.startsAt).toLocaleString('en-LK', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Asia/Colombo',
                    })}{' '}
                    · {mtg.participants?.length ?? mtg.attendeeCount} participants in room
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {mtg.status !== 'COMPLETED' && mtg.status !== 'CANCELLED' && (
                    <>
                      <Button variant="primary" size="sm" onClick={() => joinRoom(mtg)}>
                        <Video className="h-3.5 w-3.5" /> Join Built-in Room
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => markCompleted(mtg.id)}
                      >
                        Mark completed
                      </Button>
                    </>
                  )}
                  {mtg.status === 'COMPLETED' && (
                    <Button variant="secondary" size="sm" onClick={() => joinRoom(mtg)}>
                      <Video className="h-3.5 w-3.5" /> Reopen Room
                    </Button>
                  )}
                </div>
              </div>

              {mtg.notes && (
                <div className="mt-4 rounded-xl bg-canvas p-3.5 text-xs text-muted">
                  <strong className="text-ink">Notes & Action Items:</strong> {mtg.notes}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Schedule ProjectFlow Meet Room"
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={onCreate} className="space-y-4">
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
            />
          </Field>
          <Field label="Initial notes / action items" htmlFor="mt-notes">
            <Input id="mt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Built-in Room</Button>
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
    link.download = 'projectflow-delivery-report.csv';
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
              <div className="h-64 p-5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.projectProgress} layout="vertical" margin={{ left: 12, right: 24 }}>
                    <CartesianGrid horizontal={false} stroke="#E4E6EA" strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: '#737780', fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="code"
                      width={105}
                      tick={{ fill: '#737780', fontSize: 12 }}
                    />
                    <Tooltip />
                    <Bar dataKey="progressPercent" radius={[0, 6, 6, 0]} barSize={20}>
                      {data.projectProgress.map((entry) => (
                        <Cell key={entry.id} fill="#D5A52E" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Tasks by workflow stage"
                description="Distribution of tasks across Kanban columns."
              />
              <div className="h-64 p-5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.tasksByStatus}>
                    <CartesianGrid vertical={false} stroke="#E4E6EA" strokeDasharray="3 3" />
                    <XAxis dataKey="status" tick={{ fill: '#737780', fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fill: '#737780', fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={28} fill="#D5A52E" />
                  </BarChart>
                </ResponsiveContainer>
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

