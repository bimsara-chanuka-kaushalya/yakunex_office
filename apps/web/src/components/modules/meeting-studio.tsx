'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  Camera,
  CameraOff,
  Check,
  ChevronUp,
  Copy,
  Download,
  FileText,
  Hand,
  LayoutGrid,
  Maximize2,
  MessagesSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Radio,
  Send,
  Smile,
  Sparkles,
  Users,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/field';
import { liveGet, patch, post } from '@/lib/api';
import { cn } from '@/lib/cn';

export interface MeetingParticipant {
  userId: string;
  fullName: string;
  role: string;
  micOn: boolean;
  camOn: boolean;
  screenSharing: boolean;
  screenStreamId?: string | null;
  handRaised: boolean;
  joinedAt: string;
}

export interface MeetingChatMessage {
  id: string;
  senderId?: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface MeetingRow {
  id: string;
  roomCode: string;
  projectId: string | null;
  projectName: string;
  organizerName: string;
  title: string;
  agenda: string;
  startsAt: string;
  endsAt: string;
  status: 'LIVE' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  attendeeCount: number;
  notes: string;
  participants: MeetingParticipant[];
  chatMessages: MeetingChatMessage[];
}

interface MeetingSignalItem {
  id?: string;
  seq: number;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  type: string;
  payload: Record<string, unknown> | null;
  createdAt: number;
}

interface FloatingReaction {
  id: string;
  userId: string;
  userName: string;
  emoji: string;
}

interface CurrentUserInfo {
  id: string;
  fullName: string;
  role: string;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};

const QUICK_REACTIONS = ['👍', '👏', '❤️', '🎉', '😂', '🔥'];

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'YH';
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Tunes WebRTC RTCRtpSender bitrates & degradation preference for crisp HD video and studio audio. */
async function tuneSenderQuality(
  sender: RTCRtpSender,
  profile: 'cam-video' | 'screen-video' | 'mic-audio' | 'screen-audio',
): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    const maxBitrate =
      profile === 'screen-video'
        ? 4_500_000
        : profile === 'cam-video'
          ? 2_000_000
          : profile === 'screen-audio'
            ? 192_000
            : 96_000;
    params.encodings[0].maxBitrate = maxBitrate;
    if (profile === 'screen-video') {
      params.degradationPreference = 'maintain-resolution';
    } else if (profile === 'cam-video') {
      params.degradationPreference = 'balanced';
    }
    await sender.setParameters(params);
  } catch {
    // Some browsers disallow tuning before negotiation settles
  }
}

/** Dedicated hidden audio playback component per peer/screen so voice & screen sound stay clear across layout changes. */
function RemoteAudioPlayer({
  stream,
  muted = false,
  volume = 1,
  onAutoplayBlocked,
}: {
  stream: MediaStream | undefined;
  muted?: boolean;
  volume?: number;
  onAutoplayBlocked: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackSig = stream?.getAudioTracks().map((t) => `${t.id}:${t.readyState}`).join(',') ?? '';

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = muted;
    el.volume = Math.max(0, Math.min(1, volume));
  }, [muted, volume]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !stream) return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      el.srcObject = null;
      return;
    }

    const audioOnly = new MediaStream(audioTracks);
    el.srcObject = audioOnly;
    el.muted = muted;
    el.volume = Math.max(0, Math.min(1, volume));
    el.play().catch(() => {
      onAutoplayBlocked();
    });
  }, [muted, onAutoplayBlocked, stream, trackSig, volume]);

  return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
}

/** Binds a MediaStream cleanly to a <video> element without triggering React srcObject resets. */
function VideoCanvas({
  stream,
  mirrored = false,
  className,
}: {
  stream: MediaStream | null | undefined;
  mirrored?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!stream) {
      el.srcObject = null;
      return;
    }
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    el.play().catch(() => undefined);
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={cn(
        'h-full w-full object-cover',
        mirrored && '-scale-x-100',
        className,
      )}
    />
  );
}

/** Reusable Participant Video / Avatar Tile */
function ParticipantTile({
  participant,
  stream,
  isSelf,
  isSpeaking,
  reaction,
  compact = false,
  canHostControl,
  onHostMute,
}: {
  participant: MeetingParticipant;
  stream: MediaStream | null | undefined;
  isSelf: boolean;
  isSpeaking: boolean;
  reaction?: string;
  compact?: boolean;
  canHostControl?: boolean;
  onHostMute?: (userId: string) => void;
}) {
  const hasLiveVideo =
    participant.camOn &&
    Boolean(stream?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled));

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-[#111827] transition-all duration-200',
        compact ? 'aspect-video w-full shrink-0' : 'aspect-video w-full',
        isSpeaking && participant.micOn
          ? 'border-[#10B981] ring-2 ring-[#10B981]/50 shadow-[0_0_24px_rgba(16,185,129,0.25)]'
          : 'border-white/10',
      )}
    >
      {hasLiveVideo ? (
        <VideoCanvas stream={stream} mirrored={isSelf} />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#161F30] via-[#111827] to-[#0B0F17] p-4">
          <div
            className={cn(
              'flex items-center justify-center rounded-full font-display font-bold text-white shadow-lg ring-4',
              compact ? 'h-12 w-12 text-base' : 'h-20 w-20 text-2xl',
              isSpeaking && participant.micOn
                ? 'bg-gradient-to-br from-[#10B981] to-[#059669] ring-[#10B981]/30'
                : 'bg-gradient-to-br from-[#D4A843] to-[#9A7222] ring-white/10',
            )}
          >
            {getInitials(participant.fullName)}
          </div>
          {!compact && (
            <p className="mt-2.5 text-xs font-medium text-white/60">
              {participant.camOn ? 'Connecting camera...' : 'Camera is off'}
            </p>
          )}
        </div>
      )}

      {/* Hand raised / Screen sharing badges */}
      <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
        {participant.handRaised && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-slate-950 shadow">
            <Hand className="h-3 w-3" /> Hand Raised
          </span>
        )}
        {participant.screenSharing && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow">
            <MonitorUp className="h-3 w-3" /> Presenting
          </span>
        )}
      </div>

      {/* Host quick mute hover button */}
      {canHostControl && !isSelf && participant.micOn && onHostMute && (
        <button
          type="button"
          onClick={() => onHostMute(participant.userId)}
          className="absolute right-3 top-3 hidden items-center gap-1 rounded-full bg-rose-600/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow transition hover:bg-rose-500 group-hover:inline-flex"
        >
          <MicOff className="h-3 w-3" /> Mute
        </button>
      )}

      {/* Floating emoji reaction */}
      {reaction && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="animate-bounce text-5xl drop-shadow-lg">{reaction}</span>
        </div>
      )}

      {/* Bottom nameplate */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
              participant.micOn ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/90 text-white',
            )}
          >
            {participant.micOn ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
          </span>
          <span className="truncate text-xs font-semibold text-white">
            {participant.fullName}
            {isSelf ? ' (You)' : ''}
          </span>
        </div>
        {!compact && (
          <span className="ml-2 shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/75">
            {participant.role}
          </span>
        )}
      </div>
    </div>
  );
}

/** Zoom-Style In-Call Studio with real WebRTC P2P Video, Audio, Screen Share & Room Controls */
export function MeetingStudio({
  initialRoom,
  initialMicOn,
  initialCamOn,
  currentUser,
  onExited,
  onMeetingUpdated,
}: {
  initialRoom: MeetingRow;
  initialMicOn: boolean;
  initialCamOn: boolean;
  currentUser: CurrentUserInfo;
  onExited: (endedForAll?: boolean) => void;
  onMeetingUpdated?: (room: MeetingRow) => void;
}) {
  const [room, setRoom] = useState<MeetingRow>(initialRoom);
  const [micOn, setMicOn] = useState(initialMicOn);
  const [camOn, setCamOn] = useState(initialCamOn);
  const [screenOn, setScreenOn] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'gallery' | 'speaker'>('gallery');
  const [sideTab, setSideTab] = useState<'closed' | 'participants' | 'chat' | 'notes'>('chat');
  const [unreadChat, setUnreadChat] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [notesDraft, setNotesDraft] = useState(initialRoom.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);
  const [showReactionTray, setShowReactionTray] = useState(false);
  const [showLeaveMenu, setShowLeaveMenu] = useState(false);
  const [deviceMenu, setDeviceMenu] = useState<'mic' | 'cam' | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [selectedCamId, setSelectedCamId] = useState<string>('');
  const [recording, setRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [screenAudioMuted, setScreenAudioMuted] = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState<Record<string, boolean>>({});
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteCamStreams, setRemoteCamStreams] = useState<Record<string, MediaStream>>({});
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Record<string, MediaStream>>({});

  // Refs for WebRTC stability across closures & async signal callbacks
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteCamStreamsRef = useRef<Record<string, MediaStream>>({});
  const remoteScreenStreamsRef = useRef<Record<string, MediaStream>>({});
  const remoteScreenStreamIdsRef = useRef<Record<string, string>>({});
  const remoteScreenTrackIdsRef = useRef<Record<string, string>>({});
  const remoteScreenAudioTrackIdsRef = useRef<Record<string, string>>({});
  const participantsRef = useRef<MeetingParticipant[]>(initialRoom.participants);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const pendingRenegotiateRef = useRef<Set<string>>(new Set());
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const seenSignalIdsRef = useRef<Set<string>>(new Set());
  const iceBatchRef = useRef<
    Map<string, { timer: ReturnType<typeof setTimeout> | null; candidates: RTCIceCandidateInit[] }>
  >(new Map());
  const lastSignalSeqRef = useRef<number>(0);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const lastChatCountRef = useRef<number>(initialRoom.chatMessages?.length ?? 0);
  const micOnRef = useRef(micOn);
  const camOnRef = useRef(camOn);
  const sideTabRef = useRef(sideTab);

  micOnRef.current = micOn;
  camOnRef.current = camOn;
  sideTabRef.current = sideTab;
  participantsRef.current = room.participants;

  const canHostControl = useMemo(() => {
    const r = currentUser.role.toUpperCase();
    return (
      room.organizerName === currentUser.fullName ||
      r === 'SUPER_ADMIN' ||
      r === 'ADMIN' ||
      r === 'MANAGER' ||
      r === 'DIRECTOR' ||
      r === 'PM'
    );
  }, [currentUser.fullName, currentUser.role, room.organizerName]);

  const showToast = useCallback((msg: string) => {
    setBannerNotice(msg);
  }, []);

  useEffect(() => {
    if (!bannerNotice) return;
    const t = setTimeout(() => setBannerNotice(null), 4000);
    return () => clearTimeout(t);
  }, [bannerNotice]);

  // Call elapsed timer
  useEffect(() => {
    const timer = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Recording elapsed timer
  useEffect(() => {
    if (!recording) {
      setRecordingSec(0);
      return;
    }
    const t = setInterval(() => setRecordingSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Keep unread chat counter accurate
  useEffect(() => {
    const count = room.chatMessages?.length ?? 0;
    if (sideTab === 'chat') {
      setUnreadChat(0);
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (count > lastChatCountRef.current) {
      setUnreadChat((u) => u + (count - lastChatCountRef.current));
    }
    lastChatCountRef.current = count;
  }, [room.chatMessages, sideTab]);

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices.filter((d) => d.kind === 'audioinput'));
      setVideoDevices(devices.filter((d) => d.kind === 'videoinput'));
    } catch {
      // Ignore permission restrictions before capture
    }
  }, []);

  const sendSignal = useCallback(
    async (toUserId: string, type: string, payload: unknown) => {
      try {
        await post(`/meetings/${room.id}/signal`, {
          toUserId,
          type,
          payload,
        });
      } catch {
        // Non-fatal; polling/renegotiation handles recovery
      }
    },
    [room.id],
  );

  // Sync localStreamRef state cleanly
  const commitLocalStream = useCallback((stream: MediaStream | null) => {
    localStreamRef.current = stream;
    setLocalStream(stream ? new MediaStream(stream.getTracks()) : null);
  }, []);

  // Capture initial local media on mount (camera + mic according to pre-join settings)
  useEffect(() => {
    let active = true;
    async function initMedia() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
      if (!initialMicOn && !initialCamOn) {
        await refreshDevices();
        return;
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: initialMicOn
            ? {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,
              }
            : false,
          video: initialCamOn
            ? { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
            : false,
        });
      } catch {
        // Fallback: try audio-only if camera failed/unavailable
        if (initialMicOn) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,
              },
              video: false,
            });
            if (active && initialCamOn) {
              setCamOn(false);
              void patch(`/meetings/${initialRoom.id}/participant`, { camOn: false });
              showToast('Camera unavailable — joined with microphone audio.');
            }
          } catch {
            if (active) {
              setMicOn(false);
              setCamOn(false);
              void patch(`/meetings/${initialRoom.id}/participant`, {
                micOn: false,
                camOn: false,
              });
              showToast('Microphone/camera not detected or blocked — joined as viewer.');
            }
          }
        }
      }

      if (!active) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }

      if (stream) {
        stream.getVideoTracks().forEach((t) => {
          t.contentHint = 'motion';
        });
        commitLocalStream(stream);
        const aTrack = stream.getAudioTracks()[0];
        const vTrack = stream.getVideoTracks()[0];
        if (aTrack) setSelectedMicId(aTrack.getSettings().deviceId ?? '');
        if (vTrack) setSelectedCamId(vTrack.getSettings().deviceId ?? '');
        await refreshDevices();
      }
    }

    void initMedia();

    return () => {
      active = false;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
    };
  }, [commitLocalStream, initialCamOn, initialMicOn, initialRoom.id, refreshDevices, showToast]);

  // Attach local camera/mic + screen tracks into a peer connection and apply HD bitrate tuning
  const attachOutgoingTracks = useCallback((pc: RTCPeerConnection) => {
    const camStream = localStreamRef.current;
    if (camStream) {
      for (const track of camStream.getTracks()) {
        const already = pc.getSenders().some((s) => s.track?.id === track.id);
        if (!already) {
          const sender = pc.addTrack(track, camStream);
          void tuneSenderQuality(sender, track.kind === 'video' ? 'cam-video' : 'mic-audio');
        }
      }
    }
    const scrStream = screenStreamRef.current;
    if (scrStream) {
      for (const track of scrStream.getTracks()) {
        const already = pc.getSenders().some((s) => s.track?.id === track.id);
        if (!already) {
          const sender = pc.addTrack(track, scrStream);
          void tuneSenderQuality(sender, track.kind === 'video' ? 'screen-video' : 'screen-audio');
        }
      }
    }
  }, []);

  const flushIceBatch = useCallback(
    async (peerId: string) => {
      const entry = iceBatchRef.current.get(peerId);
      if (!entry || entry.candidates.length === 0) return;
      const candidates = entry.candidates.splice(0, entry.candidates.length);
      entry.timer = null;
      await sendSignal(peerId, 'ice-batch', { candidates });
    },
    [sendSignal],
  );

  const queueIceCandidate = useCallback(
    (peerId: string, candidate: RTCIceCandidateInit) => {
      let entry = iceBatchRef.current.get(peerId);
      if (!entry) {
        entry = { timer: null, candidates: [] };
        iceBatchRef.current.set(peerId, entry);
      }
      entry.candidates.push(candidate);
      if (!entry.timer) {
        entry.timer = setTimeout(() => {
          void flushIceBatch(peerId);
        }, 120);
      }
    },
    [flushIceBatch],
  );

  const renegotiatePeer = useCallback(
    async (peerId: string) => {
      const pc = pcsRef.current.get(peerId);
      if (!pc || pc.connectionState === 'closed') return;
      if (makingOfferRef.current.get(peerId) || pc.signalingState !== 'stable') {
        pendingRenegotiateRef.current.add(peerId);
        return;
      }
      pendingRenegotiateRef.current.delete(peerId);
      try {
        makingOfferRef.current.set(peerId, true);
        attachOutgoingTracks(pc);
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') {
          pendingRenegotiateRef.current.add(peerId);
          return;
        }
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          await sendSignal(peerId, 'offer', {
            sdp: pc.localDescription.toJSON(),
            screenStreamId: screenStreamRef.current?.id ?? null,
            screenTrackId: screenStreamRef.current?.getVideoTracks()[0]?.id ?? null,
            screenAudioTrackId: screenStreamRef.current?.getAudioTracks()[0]?.id ?? null,
          });
        }
      } catch {
        pendingRenegotiateRef.current.add(peerId);
      } finally {
        makingOfferRef.current.set(peerId, false);
      }
    },
    [attachOutgoingTracks, sendSignal],
  );

  const closePeer = useCallback((peerId: string) => {
    const iceEntry = iceBatchRef.current.get(peerId);
    if (iceEntry?.timer) clearTimeout(iceEntry.timer);
    iceBatchRef.current.delete(peerId);
    pendingRenegotiateRef.current.delete(peerId);

    const pc = pcsRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.onsignalingstatechange = null;
      pc.close();
      pcsRef.current.delete(peerId);
    }
    pendingIceRef.current.delete(peerId);
    makingOfferRef.current.delete(peerId);
    delete remoteCamStreamsRef.current[peerId];
    delete remoteScreenStreamsRef.current[peerId];
    delete remoteScreenStreamIdsRef.current[peerId];
    delete remoteScreenTrackIdsRef.current[peerId];
    delete remoteScreenAudioTrackIdsRef.current[peerId];
    setRemoteCamStreams((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    setRemoteScreenStreams((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const getOrCreatePeer = useCallback(
    (peerId: string): RTCPeerConnection => {
      const existing = pcsRef.current.get(peerId);
      if (existing && existing.connectionState !== 'closed') return existing;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcsRef.current.set(peerId, pc);
      attachOutgoingTracks(pc);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          queueIceCandidate(peerId, event.candidate.toJSON());
        }
      };

      pc.onsignalingstatechange = () => {
        if (pc.signalingState === 'stable' && pendingRenegotiateRef.current.has(peerId)) {
          pendingRenegotiateRef.current.delete(peerId);
          setTimeout(() => void renegotiatePeer(peerId), 60);
        }
      };

      pc.ontrack = (event) => {
        const incomingStream = event.streams[0] ?? new MediaStream([event.track]);
        const peerMeta = participantsRef.current.find((p) => p.userId === peerId);
        const declaredScreenId =
          remoteScreenStreamIdsRef.current[peerId] ?? peerMeta?.screenStreamId ?? undefined;
        const declaredTrackId = remoteScreenTrackIdsRef.current[peerId];
        const declaredAudioTrackId = remoteScreenAudioTrackIdsRef.current[peerId];
        const existingCam = remoteCamStreamsRef.current[peerId];
        const existingScr = remoteScreenStreamsRef.current[peerId];

        const isScreenTrack =
          Boolean(declaredScreenId && incomingStream.id === declaredScreenId) ||
          Boolean(declaredTrackId && event.track.id === declaredTrackId) ||
          Boolean(declaredAudioTrackId && event.track.id === declaredAudioTrackId) ||
          Boolean(existingScr && existingScr.id === incomingStream.id) ||
          (event.track.kind === 'video' && Boolean(peerMeta?.screenSharing) && !peerMeta?.camOn) ||
          (event.track.kind === 'video' &&
            existingCam !== undefined &&
            existingCam.id !== incomingStream.id &&
            existingCam.getVideoTracks().some((t) => t.id !== event.track.id && t.readyState === 'live'));

        if (isScreenTrack) {
          const scrBucket = existingScr ?? new MediaStream();
          if (!scrBucket.getTracks().some((t) => t.id === event.track.id)) {
            scrBucket.addTrack(event.track);
          }
          remoteScreenStreamsRef.current[peerId] = scrBucket;
          setRemoteScreenStreams((prev) => ({
            ...prev,
            [peerId]: new MediaStream(scrBucket.getTracks()),
          }));
          if (event.track.kind === 'video') {
            event.track.onended = () => {
              delete remoteScreenStreamsRef.current[peerId];
              setRemoteScreenStreams((prev) => {
                if (!(peerId in prev)) return prev;
                const next = { ...prev };
                delete next[peerId];
                return next;
              });
            };
          }
          return;
        }

        const bucket = existingCam ?? incomingStream;
        if (!bucket.getTracks().some((t) => t.id === event.track.id)) {
          bucket.addTrack(event.track);
        }
        remoteCamStreamsRef.current[peerId] = bucket;
        setRemoteCamStreams((prev) => ({
          ...prev,
          [peerId]: new MediaStream(bucket.getTracks()),
        }));
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          void renegotiatePeer(peerId);
        }
      };

      return pc;
    },
    [attachOutgoingTracks, queueIceCandidate, renegotiatePeer],
  );

  // Sync peer connections & screen-share state whenever participants enter, share, or leave
  useEffect(() => {
    const activeIds = new Set(room.participants.map((p) => p.userId));
    for (const peerId of Array.from(pcsRef.current.keys())) {
      if (!activeIds.has(peerId)) {
        closePeer(peerId);
      }
    }

    for (const p of room.participants) {
      if (p.userId === currentUser.id) continue;

      if (p.screenSharing && p.screenStreamId) {
        remoteScreenStreamIdsRef.current[p.userId] = p.screenStreamId;
      } else if (!p.screenSharing && remoteScreenStreamsRef.current[p.userId]) {
        delete remoteScreenStreamsRef.current[p.userId];
        delete remoteScreenStreamIdsRef.current[p.userId];
        delete remoteScreenTrackIdsRef.current[p.userId];
        delete remoteScreenAudioTrackIdsRef.current[p.userId];
        setRemoteScreenStreams((prev) => {
          if (!(p.userId in prev)) return prev;
          const next = { ...prev };
          delete next[p.userId];
          return next;
        });
      }

      const hadPeer = pcsRef.current.has(p.userId);
      const pc = getOrCreatePeer(p.userId);
      if (!hadPeer) {
        const activeScr = screenStreamRef.current;
        if (activeScr) {
          void sendSignal(p.userId, 'screen-meta', {
            active: true,
            streamId: activeScr.id,
            trackId: activeScr.getVideoTracks()[0]?.id ?? '',
            audioTrackId: activeScr.getAudioTracks()[0]?.id ?? '',
          });
        }
        // Deterministic offerer avoids glare on initial join: lexicographically smaller ID initiates
        if (currentUser.id.localeCompare(p.userId) < 0 && pc.signalingState === 'stable') {
          void renegotiatePeer(p.userId);
        }
      }
    }
  }, [closePeer, currentUser.id, getOrCreatePeer, renegotiatePeer, room.participants, sendSignal]);

  // Poll meeting room state continuously bypassing client cache
  useEffect(() => {
    const pollRoom = async () => {
      try {
        const fresh = await liveGet<MeetingRow>(`/meetings/${room.id}/room`);
        setRoom(fresh);
        onMeetingUpdated?.(fresh);
      } catch {
        // Retry on next tick
      }
    };
    const timer = setInterval(() => void pollRoom(), 1800);
    return () => clearInterval(timer);
  }, [onMeetingUpdated, room.id]);

  // Poll WebRTC signals sequentially (zero overlapping polls, deduplicated by signal id)
  useEffect(() => {
    let cancelled = false;

    const handleSignal = async (sig: MeetingSignalItem) => {
      const dedupeKey = sig.id ?? `${sig.seq}_${sig.fromUserId}_${sig.type}_${sig.createdAt}`;
      if (seenSignalIdsRef.current.has(dedupeKey)) return;
      seenSignalIdsRef.current.add(dedupeKey);
      if (seenSignalIdsRef.current.size > 600) {
        const keep = Array.from(seenSignalIdsRef.current).slice(-300);
        seenSignalIdsRef.current = new Set(keep);
      }

      const fromId = sig.fromUserId;
      const payload = sig.payload ?? {};

      if (sig.type === 'reaction') {
        const emoji = String(payload.emoji ?? '👍');
        const reactId = `${fromId}_${sig.seq}`;
        setReactions((prev) => [
          ...prev,
          { id: reactId, userId: fromId, userName: sig.fromUserName, emoji },
        ]);
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== reactId));
        }, 2800);
        return;
      }

      if (sig.type === 'host-mute') {
        const track = localStreamRef.current?.getAudioTracks()[0];
        if (track) track.enabled = false;
        setMicOn(false);
        void patch(`/meetings/${room.id}/participant`, { micOn: false });
        showToast(`${String(payload.by ?? 'Host')} muted your microphone.`);
        return;
      }

      if (sig.type === 'meeting-ended') {
        showToast('Host ended the meeting.');
        onExited(true);
        return;
      }

      if (sig.type === 'peer-left') {
        closePeer(String(payload.userId ?? fromId));
        return;
      }

      if (sig.type === 'screen-meta') {
        const active = Boolean(payload.active);
        const streamId = String(payload.streamId ?? '');
        const trackId = String(payload.trackId ?? '');
        const audioTrackId = String(payload.audioTrackId ?? '');
        if (active && streamId) {
          remoteScreenStreamIdsRef.current[fromId] = streamId;
          if (trackId) remoteScreenTrackIdsRef.current[fromId] = trackId;
          if (audioTrackId) remoteScreenAudioTrackIdsRef.current[fromId] = audioTrackId;
        } else {
          delete remoteScreenStreamIdsRef.current[fromId];
          delete remoteScreenTrackIdsRef.current[fromId];
          delete remoteScreenAudioTrackIdsRef.current[fromId];
          delete remoteScreenStreamsRef.current[fromId];
          setRemoteScreenStreams((prev) => {
            if (!(fromId in prev)) return prev;
            const next = { ...prev };
            delete next[fromId];
            return next;
          });
        }
        return;
      }

      if (sig.type === 'offer') {
        if (payload.screenStreamId) {
          remoteScreenStreamIdsRef.current[fromId] = String(payload.screenStreamId);
        }
        if (payload.screenTrackId) {
          remoteScreenTrackIdsRef.current[fromId] = String(payload.screenTrackId);
        }
        if (payload.screenAudioTrackId) {
          remoteScreenAudioTrackIdsRef.current[fromId] = String(payload.screenAudioTrackId);
        }
        const sdp = payload.sdp as RTCSessionDescriptionInit | undefined;
        if (!sdp) return;
        const pc = getOrCreatePeer(fromId);
        const polite = currentUser.id.localeCompare(fromId) > 0;
        const offerCollision =
          makingOfferRef.current.get(fromId) === true || pc.signalingState !== 'stable';
        if (offerCollision && !polite) {
          return; // Impolite peer ignores colliding offer
        }
        try {
          if (offerCollision) {
            await pc.setLocalDescription({ type: 'rollback' });
          }
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          // Ensure outgoing tracks are attached before creating answer
          attachOutgoingTracks(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (pc.localDescription) {
            await sendSignal(fromId, 'answer', {
              sdp: pc.localDescription.toJSON(),
              screenStreamId: screenStreamRef.current?.id ?? null,
              screenTrackId: screenStreamRef.current?.getVideoTracks()[0]?.id ?? null,
              screenAudioTrackId: screenStreamRef.current?.getAudioTracks()[0]?.id ?? null,
            });
          }
          const queued = pendingIceRef.current.get(fromId) ?? [];
          pendingIceRef.current.delete(fromId);
          for (const candidate of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
          }
        } catch {
          pendingRenegotiateRef.current.add(fromId);
        }
        return;
      }

      if (sig.type === 'answer') {
        if (payload.screenStreamId) {
          remoteScreenStreamIdsRef.current[fromId] = String(payload.screenStreamId);
        }
        if (payload.screenTrackId) {
          remoteScreenTrackIdsRef.current[fromId] = String(payload.screenTrackId);
        }
        if (payload.screenAudioTrackId) {
          remoteScreenAudioTrackIdsRef.current[fromId] = String(payload.screenAudioTrackId);
        }
        const sdp = payload.sdp as RTCSessionDescriptionInit | undefined;
        const pc = pcsRef.current.get(fromId);
        if (!sdp || !pc || pc.signalingState !== 'have-local-offer') return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const queued = pendingIceRef.current.get(fromId) ?? [];
          pendingIceRef.current.delete(fromId);
          for (const candidate of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
          }
        } catch {
          // Ignore stale answer
        }
        return;
      }

      if (sig.type === 'ice-candidate' || sig.type === 'ice-batch') {
        const listIn: RTCIceCandidateInit[] =
          sig.type === 'ice-batch' && Array.isArray(payload.candidates)
            ? (payload.candidates as RTCIceCandidateInit[])
            : payload.candidate
              ? [payload.candidate as RTCIceCandidateInit]
              : [];
        if (listIn.length === 0) return;
        const pc = getOrCreatePeer(fromId);
        if (pc.remoteDescription && pc.remoteDescription.type) {
          for (const c of listIn) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => undefined);
          }
        } else {
          const queue = pendingIceRef.current.get(fromId) ?? [];
          queue.push(...listIn);
          pendingIceRef.current.set(fromId, queue);
        }
      }
    };

    const runLoop = async () => {
      while (!cancelled) {
        try {
          const res = await liveGet<{ seq: number; signals: MeetingSignalItem[] }>(
            `/meetings/${room.id}/signals?after=${lastSignalSeqRef.current}`,
          );
          if (cancelled) break;
          if (typeof res.seq === 'number' && res.seq > lastSignalSeqRef.current) {
            lastSignalSeqRef.current = res.seq;
          }
          for (const sig of res.signals ?? []) {
            if (cancelled) break;
            await handleSignal(sig);
          }
        } catch {
          // Retry cleanly on next cycle
        }
        if (cancelled) break;
        await new Promise((r) => setTimeout(r, 550));
      }
    };

    void runLoop();
    return () => {
      cancelled = true;
    };
  }, [
    attachOutgoingTracks,
    closePeer,
    currentUser.id,
    getOrCreatePeer,
    onExited,
    room.id,
    sendSignal,
    showToast,
  ]);

  // Web Audio active speaker detector across local + remote streams
  useEffect(() => {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return;
    let ctx: AudioContext | null = null;
    try {
      ctx = new window.AudioContext();
    } catch {
      return;
    }

    const analysers = new Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }>();
    const bindStream = (userId: string, stream: MediaStream | null | undefined) => {
      if (!ctx || !stream || stream.getAudioTracks().length === 0) return;
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analysers.set(userId, { analyser, source });
      } catch {
        // Ignore stream without active audio
      }
    };

    if (micOn && localStream) bindStream(currentUser.id, localStream);
    for (const [uid, s] of Object.entries(remoteCamStreams)) {
      bindStream(uid, s);
    }

    const buf = new Uint8Array(128);
    const interval = setInterval(() => {
      const next: Record<string, boolean> = {};
      for (const [uid, { analyser }] of analysers.entries()) {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) sum += buf[i] ?? 0;
        const avg = sum / buf.length;
        next[uid] = avg > 14;
      }
      setSpeakingUsers(next);
    }, 220);

    return () => {
      clearInterval(interval);
      analysers.forEach(({ source }) => {
        try {
          source.disconnect();
        } catch {
          // Ignore
        }
      });
      void ctx?.close().catch(() => undefined);
    };
  }, [currentUser.id, localStream, micOn, remoteCamStreams]);

  // Helper to replace or add a single track across localStream & all active RTCPeerConnections
  const replaceOrAddLocalTrack = useCallback(
    async (kind: 'audio' | 'video', newTrack: MediaStreamTrack) => {
      const base = localStreamRef.current ?? new MediaStream();
      for (const old of kind === 'audio' ? base.getAudioTracks() : base.getVideoTracks()) {
        base.removeTrack(old);
        old.stop();
      }
      base.addTrack(newTrack);
      commitLocalStream(base);

      let needsRenegotiate = false;
      const scrTrackIds = new Set(screenStreamRef.current?.getTracks().map((t) => t.id) ?? []);
      for (const [peerId, pc] of pcsRef.current.entries()) {
        const sender = pc
          .getSenders()
          .find((s) => s.track?.kind === kind && s.track?.id && !scrTrackIds.has(s.track.id));
        if (sender) {
          await sender.replaceTrack(newTrack).catch(() => undefined);
          void tuneSenderQuality(sender, kind === 'video' ? 'cam-video' : 'mic-audio');
        } else {
          const added = pc.addTrack(newTrack, base);
          void tuneSenderQuality(added, kind === 'video' ? 'cam-video' : 'mic-audio');
          needsRenegotiate = true;
        }
        if (needsRenegotiate) {
          await renegotiatePeer(peerId);
        }
      }
    },
    [commitLocalStream, renegotiatePeer],
  );

  const toggleMic = async () => {
    const next = !micOn;
    if (next) {
      let track = localStreamRef.current?.getAudioTracks().find((t) => t.readyState === 'live');
      if (!track) {
        try {
          const captured = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: selectedMicId ? { exact: selectedMicId } : undefined,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          track = captured.getAudioTracks()[0];
          if (track) {
            await replaceOrAddLocalTrack('audio', track);
            await refreshDevices();
          }
        } catch {
          showToast('Could not access microphone. Check browser permissions.');
          return;
        }
      } else {
        track.enabled = true;
      }
    } else {
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });
    }
    setMicOn(next);
    const updated = await patch<MeetingRow>(`/meetings/${room.id}/participant`, {
      micOn: next,
    });
    setRoom(updated);
  };

  const toggleCam = async () => {
    const next = !camOn;
    if (next) {
      let track = localStreamRef.current?.getVideoTracks().find((t) => t.readyState === 'live');
      if (!track) {
        try {
          const captured = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: selectedCamId ? { exact: selectedCamId } : undefined,
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
            },
          });
          track = captured.getVideoTracks()[0];
          if (track) {
            track.contentHint = 'motion';
            await replaceOrAddLocalTrack('video', track);
            await refreshDevices();
          }
        } catch {
          showToast('Could not access camera. Another app may be using it or permission is blocked.');
          return;
        }
      } else {
        track.enabled = true;
      }
    } else {
      localStreamRef.current?.getVideoTracks().forEach((t) => {
        t.enabled = false;
      });
    }
    setCamOn(next);
    const updated = await patch<MeetingRow>(`/meetings/${room.id}/participant`, {
      camOn: next,
    });
    setRoom(updated);
  };

  const switchDevice = async (kind: 'audio' | 'video', deviceId: string) => {
    setDeviceMenu(null);
    try {
      const captured = await navigator.mediaDevices.getUserMedia(
        kind === 'audio'
          ? {
              audio: {
                deviceId: { exact: deviceId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,
              },
            }
          : {
              video: {
                deviceId: { exact: deviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 },
              },
            },
      );
      const track = kind === 'audio' ? captured.getAudioTracks()[0] : captured.getVideoTracks()[0];
      if (!track) return;
      if (kind === 'audio') {
        setSelectedMicId(deviceId);
        track.enabled = micOnRef.current;
      } else {
        track.contentHint = 'motion';
        setSelectedCamId(deviceId);
        track.enabled = camOnRef.current;
      }
      await replaceOrAddLocalTrack(kind, track);
    } catch {
      showToast(`Failed to switch ${kind === 'audio' ? 'microphone' : 'camera'}.`);
    }
  };

  const stopScreenShare = useCallback(async () => {
    const scr = screenStreamRef.current;
    screenStreamRef.current = null;
    setScreenStream(null);
    setScreenOn(false);

    if (scr) {
      const tracks = scr.getTracks();
      await Promise.all([
        sendSignal('*', 'screen-meta', {
          active: false,
          streamId: '',
          trackId: '',
          audioTrackId: '',
        }),
        patch<MeetingRow>(`/meetings/${room.id}/participant`, {
          screenSharing: false,
          screenStreamId: null,
        })
          .then((updated) => setRoom(updated))
          .catch(() => undefined),
      ]);
      for (const [peerId, pc] of pcsRef.current.entries()) {
        for (const sender of pc.getSenders()) {
          if (sender.track && tracks.some((t) => t.id === sender.track?.id)) {
            pc.removeTrack(sender);
          }
        }
        await renegotiatePeer(peerId);
      }
      tracks.forEach((t) => t.stop());
    }
  }, [renegotiatePeer, room.id, sendSignal]);

  const toggleScreenShare = async () => {
    if (screenOn) {
      await stopScreenShare();
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      showToast('Screen sharing is not supported on this browser or device.');
      return;
    }
    let scr: MediaStream | null = null;
    try {
      // Request 1080p60 crisp video + uncompressed stereo tab/system audio
      scr = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 60, max: 60 },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000,
        },
        ...({ systemAudio: 'include', selfBrowserSurface: 'exclude' } as Record<string, unknown>),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'AbortError') {
        showToast('Screen share selection cancelled or permission denied.');
        return;
      }
      // Fallback 1: standard video + audio
      try {
        scr = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: true,
        });
      } catch {
        // Fallback 2: video only (OS/window does not support audio capture)
        try {
          scr = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        } catch {
          showToast('Could not start screen sharing. Check browser permissions.');
          return;
        }
      }
    }

    if (!scr) return;
    const scrVideoTrack = scr.getVideoTracks()[0];
    const scrAudioTrack = scr.getAudioTracks()[0];
    if (scrVideoTrack) scrVideoTrack.contentHint = 'detail';
    if (scrAudioTrack) scrAudioTrack.contentHint = 'music';

    screenStreamRef.current = scr;
    setScreenStream(scr);
    setScreenOn(true);

    if (!scrAudioTrack) {
      showToast('Screen shared without audio — tick "Share audio" in the picker to share sound.');
    }

    scrVideoTrack?.addEventListener('ended', () => {
      void stopScreenShare();
    });

    // Attach screen video & audio tracks with HD bitrate tuning and renegotiate immediately
    for (const [peerId, pc] of pcsRef.current.entries()) {
      for (const track of scr.getTracks()) {
        const already = pc.getSenders().some((s) => s.track?.id === track.id);
        if (!already) {
          const sender = pc.addTrack(track, scr);
          void tuneSenderQuality(sender, track.kind === 'video' ? 'screen-video' : 'screen-audio');
        }
      }
      void renegotiatePeer(peerId);
    }

    await Promise.all([
      sendSignal('*', 'screen-meta', {
        active: true,
        streamId: scr.id,
        trackId: scrVideoTrack?.id ?? '',
        audioTrackId: scrAudioTrack?.id ?? '',
      }),
      patch<MeetingRow>(`/meetings/${room.id}/participant`, {
        screenSharing: true,
        screenStreamId: scr.id,
      })
        .then((updated) => setRoom(updated))
        .catch(() => undefined),
    ]);
  };

  const toggleHandRaise = async () => {
    const next = !handRaised;
    setHandRaised(next);
    setShowReactionTray(false);
    const updated = await patch<MeetingRow>(`/meetings/${room.id}/participant`, {
      handRaised: next,
    });
    setRoom(updated);
  };

  const sendReaction = async (emoji: string) => {
    setShowReactionTray(false);
    const id = `local_${Date.now()}`;
    setReactions((prev) => [
      ...prev,
      { id, userId: currentUser.id, userName: currentUser.fullName, emoji },
    ]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2800);
    await sendSignal('*', 'reaction', { emoji });
  };

  const unlockRoomAudio = () => {
    setAudioBlocked(false);
    document.querySelectorAll('audio').forEach((el) => {
      el.muted = false;
      void el.play().catch(() => undefined);
    });
  };

  const toggleRecording = () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }

    const remoteScreenFirst = Object.values(remoteScreenStreamsRef.current)[0] ?? null;
    const primaryVideoStream = screenStreamRef.current ?? remoteScreenFirst ?? localStreamRef.current;
    const videoTracks = primaryVideoStream?.getVideoTracks().filter((t) => t.readyState === 'live') ?? [];

    // Collect all live audio sources across local mic, screen audio, and remote participants
    const allAudioStreams = [
      localStreamRef.current,
      screenStreamRef.current,
      ...Object.values(remoteCamStreamsRef.current),
      ...Object.values(remoteScreenStreamsRef.current),
    ].filter((s): s is MediaStream => Boolean(s && s.getAudioTracks().some((t) => t.readyState === 'live')));

    if (videoTracks.length === 0 && allAudioStreams.length === 0) {
      showToast('Turn on mic/cam or screen share before starting recording.');
      return;
    }

    try {
      const combined = new MediaStream();
      videoTracks.forEach((t) => combined.addTrack(t));

      let mixCtx: AudioContext | null = null;
      if (allAudioStreams.length > 0 && typeof window !== 'undefined' && 'AudioContext' in window) {
        mixCtx = new window.AudioContext();
        const dest = mixCtx.createMediaStreamDestination();
        for (const s of allAudioStreams) {
          try {
            const src = mixCtx.createMediaStreamSource(new MediaStream(s.getAudioTracks()));
            src.connect(dest);
          } catch {
            // Skip stream if source creation fails
          }
        }
        dest.stream.getAudioTracks().forEach((t) => combined.addTrack(t));
      }

      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm';
      const rec = new MediaRecorder(combined, {
        mimeType: mime,
        videoBitsPerSecond: 4_000_000,
        audioBitsPerSecond: 192_000,
      });
      recordedChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        void mixCtx?.close().catch(() => undefined);
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${room.roomCode}-${new Date().toISOString().slice(0, 10)}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };
      rec.start(1000);
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      showToast('Recording is not supported in this browser.');
    }
  };

  const sendChat = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const body = chatInput.trim();
    setChatInput('');
    const updated = await post<MeetingRow>(`/meetings/${room.id}/chat`, { body });
    setRoom(updated);
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const updated = await patch<MeetingRow>(`/meetings/${room.id}`, {
        notes: notesDraft,
      });
      setRoom(updated);
      showToast('Meeting notes saved.');
    } finally {
      setSavingNotes(false);
    }
  };

  const hostMute = async (targetUserId?: string) => {
    const updated = await patch<MeetingRow>(`/meetings/${room.id}/host-action`, {
      action: targetUserId ? 'mute' : 'mute-all',
      targetUserId,
    });
    setRoom(updated);
    showToast(targetUserId ? 'Participant muted.' : 'All participants muted.');
  };

  const copyInviteLink = async () => {
    const url = `${window.location.origin}/meetings?room=${room.roomCode}`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const leaveCall = async (endForAll = false) => {
    setShowLeaveMenu(false);
    if (recording) recorderRef.current?.stop();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();

    try {
      if (endForAll) {
        await patch(`/meetings/${room.id}`, { status: 'COMPLETED' });
      } else {
        await post(`/meetings/${room.id}/leave`, {});
      }
    } catch {
      // Proceed cleanly out of studio
    }
    onExited(endForAll);
  };

  // Resolve current active presenter screen share (local OR remote)
  const activeScreenShare = useMemo(() => {
    if (screenStream) {
      return {
        userId: currentUser.id,
        presenterName: `${currentUser.fullName} (You)`,
        stream: screenStream,
      };
    }
    for (const [peerId, stream] of Object.entries(remoteScreenStreams)) {
      const p = room.participants.find((item) => item.userId === peerId);
      return {
        userId: peerId,
        presenterName: p?.fullName ?? 'Teammate',
        stream,
      };
    }
    return null;
  }, [currentUser.fullName, currentUser.id, remoteScreenStreams, room.participants, screenStream]);

  // Compute grid columns in Gallery View based on participant count
  const gridColsClass = useMemo(() => {
    const n = room.participants.length;
    if (n <= 1) return 'grid-cols-1 max-w-4xl mx-auto';
    if (n === 2) return 'grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto';
    if (n <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl mx-auto';
    if (n <= 6) return 'grid-cols-2 lg:grid-cols-3';
    return 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4';
  }, [room.participants.length]);

  const activeSpeakerParticipant = useMemo(() => {
    const speaking = room.participants.find(
      (p) => speakingUsers[p.userId] && p.micOn && p.userId !== currentUser.id,
    );
    return (
      speaking ??
      room.participants.find((p) => p.userId !== currentUser.id) ??
      room.participants[0] ??
      null
    );
  }, [currentUser.id, room.participants, speakingUsers]);

  return (
    <div className="relative flex h-[calc(100vh-110px)] min-h-[640px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0B0F17] text-white shadow-2xl">
      {/* Hidden audio playback elements for remote mics AND shared screen audio */}
      {room.participants
        .filter((p) => p.userId !== currentUser.id)
        .map((p) => (
          <div key={`audio-wrap-${p.userId}`} className="hidden">
            <RemoteAudioPlayer
              key={`audio-cam-${p.userId}`}
              stream={remoteCamStreams[p.userId]}
              onAutoplayBlocked={() => setAudioBlocked(true)}
            />
            <RemoteAudioPlayer
              key={`audio-scr-${p.userId}`}
              stream={remoteScreenStreams[p.userId]}
              muted={screenAudioMuted}
              volume={screenAudioMuted ? 0 : 1}
              onAutoplayBlocked={() => setAudioBlocked(true)}
            />
          </div>
        ))}

      {/* ─── TOP ZOOM HEADER ─────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0F1522]/95 px-5 py-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_10px_#34D399]" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-display text-base font-semibold text-white">
                {room.title}
              </h2>
              <button
                type="button"
                onClick={copyInviteLink}
                title="Copy meeting invite link"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-white/80 transition hover:bg-white/10"
              >
                {copiedCode ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" /> Copied Link
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 text-[#D4A843]" /> {room.roomCode}
                  </>
                )}
              </button>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[11px] text-white/80">
                {formatDuration(elapsedSec)}
              </span>
              {recording && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600/90 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  <Radio className="h-3 w-3 animate-pulse" /> REC {formatDuration(recordingSec)}
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-white/55">
              {room.projectName} · Host: {room.organizerName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {audioBlocked && (
            <button
              type="button"
              onClick={unlockRoomAudio}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-lg transition hover:bg-amber-300"
            >
              <Volume2 className="h-3.5 w-3.5" /> Enable Room Audio
            </button>
          )}

          {!activeScreenShare && (
            <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setLayoutMode('gallery')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition',
                  layoutMode === 'gallery' ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white',
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Gallery
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('speaker')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition',
                  layoutMode === 'speaker' ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white',
                )}
              >
                <Sparkles className="h-3.5 w-3.5" /> Speaker
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Toast notification */}
      {bannerNotice && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-slate-900/95 px-4 py-1.5 text-xs font-medium text-white shadow-xl backdrop-blur">
          {bannerNotice}
        </div>
      )}

      {/* ─── MAIN VIDEO STAGE + RIGHT PANEL ──────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Stage */}
        <div ref={stageRef} className="relative flex-1 overflow-y-auto p-4 md:p-5">
          {activeScreenShare ? (
            <div className="flex h-full flex-col gap-4 lg:flex-row">
              {/* Spotlight Presented Screen */}
              <div className="relative flex h-full min-h-[380px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-emerald-500/40 bg-black shadow-2xl">
                <VideoCanvas
                  stream={activeScreenShare.stream}
                  className="h-full max-h-[76vh] w-full object-contain"
                />
                <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-600/95 px-3 py-1 text-xs font-semibold text-white shadow">
                    <MonitorUp className="h-3.5 w-3.5" /> {activeScreenShare.presenterName} is sharing screen
                  </div>
                  {activeScreenShare.stream.getAudioTracks().some((t) => t.readyState === 'live') ? (
                    activeScreenShare.userId === currentUser.id ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow">
                        <Volume2 className="h-3.5 w-3.5" /> Audio Shared
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setScreenAudioMuted((m) => !m)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow transition',
                          screenAudioMuted
                            ? 'bg-slate-700/90 hover:bg-slate-600'
                            : 'bg-sky-600/95 hover:bg-sky-500',
                        )}
                      >
                        {screenAudioMuted ? (
                          <>
                            <VolumeX className="h-3.5 w-3.5" /> Screen Sound Off
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-3.5 w-3.5" /> Screen Sound On
                          </>
                        )}
                      </button>
                    )
                  ) : (
                    activeScreenShare.userId === currentUser.id && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur">
                        <VolumeX className="h-3 w-3" /> Video Only
                      </span>
                    )
                  )}
                  {activeScreenShare.userId === currentUser.id && (
                    <button
                      type="button"
                      onClick={() => void stopScreenShare()}
                      className="rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white shadow transition hover:bg-rose-500"
                    >
                      Stop Share
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => stageRef.current?.requestFullscreen?.().catch(() => undefined)}
                  title="Fullscreen stage"
                  className="absolute right-3 top-3 rounded-lg bg-black/60 p-2 text-white/80 backdrop-blur transition hover:bg-black/85 hover:text-white"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>

              {/* Participant Filmstrip */}
              <div className="flex gap-3 overflow-x-auto lg:w-64 lg:flex-col lg:overflow-y-auto">
                {room.participants.map((p) => {
                  const isSelf = p.userId === currentUser.id;
                  const react = [...reactions].reverse().find((r) => r.userId === p.userId)?.emoji;
                  return (
                    <div key={p.userId} className="w-48 shrink-0 lg:w-full">
                      <ParticipantTile
                        participant={p}
                        stream={isSelf ? localStream : remoteCamStreams[p.userId]}
                        isSelf={isSelf}
                        isSpeaking={Boolean(speakingUsers[p.userId])}
                        reaction={react}
                        compact
                        canHostControl={canHostControl}
                        onHostMute={hostMute}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : layoutMode === 'speaker' && activeSpeakerParticipant ? (
            <div className="flex h-full flex-col gap-3">
              <div className="mx-auto flex w-full max-w-5xl flex-1 items-center">
                <ParticipantTile
                  participant={activeSpeakerParticipant}
                  stream={
                    activeSpeakerParticipant.userId === currentUser.id
                      ? localStream
                      : remoteCamStreams[activeSpeakerParticipant.userId]
                  }
                  isSelf={activeSpeakerParticipant.userId === currentUser.id}
                  isSpeaking={Boolean(speakingUsers[activeSpeakerParticipant.userId])}
                  reaction={
                    [...reactions].reverse().find((r) => r.userId === activeSpeakerParticipant.userId)
                      ?.emoji
                  }
                  canHostControl={canHostControl}
                  onHostMute={hostMute}
                />
              </div>
              {room.participants.length > 1 && (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {room.participants
                    .filter((p) => p.userId !== activeSpeakerParticipant.userId)
                    .map((p) => {
                      const isSelf = p.userId === currentUser.id;
                      const react = [...reactions].reverse().find((r) => r.userId === p.userId)?.emoji;
                      return (
                        <div key={p.userId} className="w-48 shrink-0">
                          <ParticipantTile
                            participant={p}
                            stream={isSelf ? localStream : remoteCamStreams[p.userId]}
                            isSelf={isSelf}
                            isSpeaking={Boolean(speakingUsers[p.userId])}
                            reaction={react}
                            compact
                            canHostControl={canHostControl}
                            onHostMute={hostMute}
                          />
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ) : (
            <div className={cn('grid h-full content-center gap-4', gridColsClass)}>
              {room.participants.map((p) => {
                const isSelf = p.userId === currentUser.id;
                const react = [...reactions].reverse().find((r) => r.userId === p.userId)?.emoji;
                return (
                  <ParticipantTile
                    key={p.userId}
                    participant={p}
                    stream={isSelf ? localStream : remoteCamStreams[p.userId]}
                    isSelf={isSelf}
                    isSpeaking={Boolean(speakingUsers[p.userId])}
                    reaction={react}
                    canHostControl={canHostControl}
                    onHostMute={hostMute}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Collapsible Right Drawer: Participants | Chat | Notes */}
        {sideTab !== 'closed' && (
          <aside className="flex w-full max-w-[340px] shrink-0 flex-col border-l border-white/10 bg-[#0F1522]">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
              <div className="flex gap-1">
                {(
                  [
                    ['participants', `People (${room.participants.length})`],
                    ['chat', 'Chat'],
                    ['notes', 'Notes'],
                  ] as const
                ).map(([tabKey, label]) => (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setSideTab(tabKey)}
                    className={cn(
                      'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                      sideTab === tabKey
                        ? 'bg-[#D4A843] text-slate-950'
                        : 'text-white/65 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSideTab('closed')}
                className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Close panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {sideTab === 'participants' && (
              <div className="flex flex-1 flex-col overflow-hidden p-3">
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {room.participants.map((p) => {
                    const isSelf = p.userId === currentUser.id;
                    return (
                      <div
                        key={p.userId}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#D4A843] to-[#9A7222] text-xs font-bold text-slate-950">
                            {getInitials(p.fullName)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-white">
                              {p.fullName} {isSelf && '(You)'}
                            </p>
                            <p className="text-[10px] text-white/50">{p.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {p.handRaised && (
                            <span title="Hand raised" className="text-amber-400">
                              <Hand className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {canHostControl && !isSelf && p.micOn && (
                            <button
                              type="button"
                              onClick={() => void hostMute(p.userId)}
                              className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/35"
                            >
                              Mute
                            </button>
                          )}
                          <span className={p.micOn ? 'text-emerald-400' : 'text-rose-400'}>
                            {p.micOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                          </span>
                          <span className={p.camOn ? 'text-emerald-400' : 'text-white/35'}>
                            {p.camOn ? <Video className="h-3.5 w-3.5" /> : <CameraOff className="h-3.5 w-3.5" />}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                  {canHostControl && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full border-white/15 bg-white/10 text-white hover:bg-white/20"
                      onClick={() => void hostMute()}
                    >
                      <MicOff className="h-3.5 w-3.5" /> Mute All Participants
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full border-white/15 bg-white/10 text-white hover:bg-white/20"
                    onClick={() => void copyInviteLink()}
                  >
                    <Copy className="h-3.5 w-3.5" /> {copiedCode ? 'Invite Link Copied!' : 'Copy Invite Link'}
                  </Button>
                </div>
              </div>
            )}

            {sideTab === 'chat' && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
                  {room.chatMessages.length === 0 ? (
                    <div className="mt-10 text-center text-xs text-white/45">
                      In-meeting messages appear here for everyone in the call.
                    </div>
                  ) : (
                    room.chatMessages.map((msg) => {
                      const isMine =
                        msg.senderId === currentUser.id || msg.senderName === currentUser.fullName;
                      return (
                        <div
                          key={msg.id}
                          className={cn('flex flex-col', isMine ? 'items-end' : 'items-start')}
                        >
                          <div
                            className={cn(
                              'max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                              isMine
                                ? 'rounded-br-sm bg-[#D4A843] text-slate-950 font-medium'
                                : 'rounded-bl-sm bg-white/10 text-white',
                            )}
                          >
                            {!isMine && (
                              <p className="mb-0.5 text-[10px] font-bold text-[#D4A843]">
                                {msg.senderName}
                              </p>
                            )}
                            <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                          </div>
                          <span className="mt-1 text-[10px] text-white/35">
                            {new Date(msg.createdAt).toLocaleTimeString('en-LK', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatBottomRef} />
                </div>
                <form
                  onSubmit={sendChat}
                  className="flex items-center gap-2 border-t border-white/10 p-3"
                >
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Message everyone..."
                    className="h-9 border-white/15 bg-white/5 text-xs text-white placeholder:text-white/40"
                  />
                  <Button type="submit" size="sm" variant="primary" className="h-9 px-3">
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </form>
              </div>
            )}

            {sideTab === 'notes' && (
              <div className="flex flex-1 flex-col gap-3 p-3.5">
                <p className="text-xs text-white/60">
                  Shared meeting minutes & action items visible to the whole team.
                </p>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Write decisions, owners, and follow-ups..."
                  className="flex-1 resize-none rounded-xl border border-white/15 bg-white/5 p-3 text-xs leading-relaxed text-white placeholder:text-white/35 focus:border-[#D4A843] focus:outline-none"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    className="flex-1"
                    disabled={savingNotes}
                    onClick={() => void saveNotes()}
                  >
                    {savingNotes ? 'Saving...' : 'Save Notes'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="border-white/15 bg-white/10 text-white hover:bg-white/20"
                    onClick={() => {
                      const blob = new Blob([`${room.title}\n${room.roomCode}\n\n${notesDraft}`], {
                        type: 'text/plain',
                      });
                      const u = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = u;
                      a.download = `${room.roomCode}-notes.txt`;
                      a.click();
                      URL.revokeObjectURL(u);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ─── FLOATING BOTTOM ZOOM CONTROL BAR ────────────────────────────── */}
      <footer className="relative flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#0F1522]/95 px-4 py-3 backdrop-blur-md">
        {/* Left: Audio & Video + device selectors */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center rounded-xl bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => void toggleMic()}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition',
                micOn ? 'text-white hover:bg-white/10' : 'bg-rose-500 text-white hover:bg-rose-600',
              )}
            >
              {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              <span className="hidden sm:inline">{micOn ? 'Mute' : 'Unmute'}</span>
            </button>
            <button
              type="button"
              onClick={() => setDeviceMenu((m) => (m === 'mic' ? null : 'mic'))}
              title="Select Microphone"
              className="rounded-lg px-1.5 py-2 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            {deviceMenu === 'mic' && (
              <div className="absolute bottom-14 left-0 z-40 w-64 rounded-2xl border border-white/15 bg-[#161F30] p-2 shadow-2xl">
                <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/45">
                  Microphone
                </p>
                {audioDevices.length === 0 ? (
                  <p className="px-2.5 py-2 text-xs text-white/50">Default microphone</p>
                ) : (
                  audioDevices.map((d) => (
                    <button
                      key={d.deviceId}
                      type="button"
                      onClick={() => void switchDevice('audio', d.deviceId)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-white hover:bg-white/10"
                    >
                      <span className="truncate">{d.label || 'Microphone'}</span>
                      {selectedMicId === d.deviceId && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="relative flex items-center rounded-xl bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => void toggleCam()}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition',
                camOn ? 'text-white hover:bg-white/10' : 'bg-rose-500 text-white hover:bg-rose-600',
              )}
            >
              {camOn ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
              <span className="hidden sm:inline">{camOn ? 'Stop Video' : 'Start Video'}</span>
            </button>
            <button
              type="button"
              onClick={() => setDeviceMenu((m) => (m === 'cam' ? null : 'cam'))}
              title="Select Camera"
              className="rounded-lg px-1.5 py-2 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            {deviceMenu === 'cam' && (
              <div className="absolute bottom-14 left-0 z-40 w-64 rounded-2xl border border-white/15 bg-[#161F30] p-2 shadow-2xl">
                <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/45">
                  Camera
                </p>
                {videoDevices.length === 0 ? (
                  <p className="px-2.5 py-2 text-xs text-white/50">Default camera</p>
                ) : (
                  videoDevices.map((d) => (
                    <button
                      key={d.deviceId}
                      type="button"
                      onClick={() => void switchDevice('video', d.deviceId)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-white hover:bg-white/10"
                    >
                      <span className="truncate">{d.label || 'Camera'}</span>
                      {selectedCamId === d.deviceId && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center: Zoom core collaboration controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSideTab((s) => (s === 'participants' ? 'closed' : 'participants'))}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition',
              sideTab === 'participants'
                ? 'bg-white/20 text-white'
                : 'bg-white/5 text-white/80 hover:bg-white/10',
            )}
          >
            <Users className="h-4 w-4" />
            <span className="hidden md:inline">Participants</span>
            <Badge tone="neutral" className="bg-white/15 text-[10px] text-white">
              {room.participants.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setSideTab((s) => (s === 'chat' ? 'closed' : 'chat'))}
            className={cn(
              'relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition',
              sideTab === 'chat'
                ? 'bg-white/20 text-white'
                : 'bg-white/5 text-white/80 hover:bg-white/10',
            )}
          >
            <MessagesSquare className="h-4 w-4" />
            <span className="hidden md:inline">Chat</span>
            {unreadChat > 0 && (
              <span className="ml-0.5 rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                {unreadChat}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => void toggleScreenShare()}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition',
              screenOn
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-600'
                : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25',
            )}
          >
            <MonitorUp className="h-4 w-4" />
            <span className="hidden sm:inline">{screenOn ? 'Stop Share' : 'Share Screen'}</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowReactionTray((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition',
                handRaised
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-white/5 text-white/80 hover:bg-white/10',
              )}
            >
              <Smile className="h-4 w-4" />
              <span className="hidden md:inline">React</span>
            </button>
            {showReactionTray && (
              <div className="absolute bottom-14 left-1/2 z-40 flex -translate-x-1/2 flex-col gap-2 rounded-2xl border border-white/15 bg-[#161F30] p-2.5 shadow-2xl">
                <div className="flex items-center gap-1.5">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => void sendReaction(emoji)}
                      className="rounded-xl p-1.5 text-xl transition hover:scale-125 hover:bg-white/10"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void toggleHandRaise()}
                  className={cn(
                    'flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                    handRaised
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-white/10 text-white hover:bg-white/20',
                  )}
                >
                  <Hand className="h-3.5 w-3.5" /> {handRaised ? 'Lower Hand' : 'Raise Hand'}
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleRecording}
            className={cn(
              'hidden items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition sm:flex',
              recording
                ? 'bg-rose-600 text-white'
                : 'bg-white/5 text-white/80 hover:bg-white/10',
            )}
          >
            <Radio className={cn('h-4 w-4', recording && 'animate-pulse')} />
            <span className="hidden lg:inline">{recording ? 'Stop Rec' : 'Record'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSideTab((s) => (s === 'notes' ? 'closed' : 'notes'))}
            className={cn(
              'hidden items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition sm:flex',
              sideTab === 'notes'
                ? 'bg-white/20 text-white'
                : 'bg-white/5 text-white/80 hover:bg-white/10',
            )}
          >
            <FileText className="h-4 w-4" />
            <span className="hidden lg:inline">Notes</span>
          </button>
        </div>

        {/* Right: Leave / End Meeting */}
        <div className="relative">
          <button
            type="button"
            onClick={() =>
              canHostControl ? setShowLeaveMenu((v) => !v) : void leaveCall(false)
            }
            className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500"
          >
            <PhoneOff className="h-4 w-4" /> Leave
          </button>
          {showLeaveMenu && (
            <div className="absolute bottom-14 right-0 z-40 w-52 space-y-1.5 rounded-2xl border border-white/15 bg-[#161F30] p-2 shadow-2xl">
              <button
                type="button"
                onClick={() => void leaveCall(true)}
                className="w-full rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-500"
              >
                End Meeting for All
              </button>
              <button
                type="button"
                onClick={() => void leaveCall(false)}
                className="w-full rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                Leave Meeting Only
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

/** Pre-Join Green Room modal / screen so users preview & verify Camera & Mic before entering */
export function PreJoinGreenRoom({
  meetingTitle,
  roomCode,
  organizerName,
  userName,
  joining,
  onCancel,
  onJoin,
}: {
  meetingTitle: string;
  roomCode: string;
  organizerName: string;
  userName: string;
  joining: boolean;
  onCancel: () => void;
  onJoin: (opts: { micOn: boolean; camOn: boolean }) => void;
}) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [deviceWarn, setDeviceWarn] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let current: MediaStream | null = null;

    async function setupPreview() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
      try {
        current = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
          },
        });
      } catch {
        try {
          current = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000,
            },
          });
          if (active) {
            setCamOn(false);
            setDeviceWarn('Camera not found — you can join with audio or turn video on later.');
          }
        } catch {
          if (active) {
            setMicOn(false);
            setCamOn(false);
            setDeviceWarn('No camera/mic permission granted yet — you can still join the call.');
          }
        }
      }
      if (!active) {
        current?.getTracks().forEach((t) => t.stop());
        return;
      }
      setPreviewStream(current);
    }

    void setupPreview();

    return () => {
      active = false;
      current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Live microphone level bar in pre-join green room
  useEffect(() => {
    if (!previewStream || !micOn || previewStream.getAudioTracks().length === 0) {
      setMicLevel(0);
      return;
    }
    if (typeof window === 'undefined' || !('AudioContext' in window)) return;
    let ctx: AudioContext | null = null;
    let src: MediaStreamAudioSourceNode | null = null;
    try {
      ctx = new window.AudioContext();
      src = ctx.createMediaStreamSource(previewStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buf = new Uint8Array(128);
      const t = setInterval(() => {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) sum += buf[i] ?? 0;
        const pct = Math.min(100, Math.round((sum / buf.length) * 1.9));
        setMicLevel(pct);
      }, 120);
      return () => {
        clearInterval(t);
        try {
          src?.disconnect();
        } catch {
          // Ignore
        }
        void ctx?.close().catch(() => undefined);
      };
    } catch {
      return;
    }
  }, [micOn, previewStream]);

  const togglePreviewCam = () => {
    const next = !camOn;
    previewStream?.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
    setCamOn(next);
  };

  const togglePreviewMic = () => {
    const next = !micOn;
    previewStream?.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
    setMicOn(next);
  };

  return (
    <div className="mx-auto max-w-4xl rounded-3xl border border-border/80 bg-[#0B0F17] p-6 text-white shadow-2xl md:p-8">
      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-center">
        {/* Live Camera Preview Box */}
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-[#111827]">
          {camOn && previewStream?.getVideoTracks().some((t) => t.readyState === 'live') ? (
            <VideoCanvas stream={previewStream} mirrored />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#161F30] to-[#0B0F17]">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#D4A843] to-[#9A7222] font-display text-2xl font-bold text-slate-950">
                {getInitials(userName)}
              </div>
              <p className="mt-3 text-xs text-white/60">Camera is off</p>
            </div>
          )}

          {/* Overlay toggles */}
          <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={togglePreviewMic}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition',
                micOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-rose-600 text-white',
              )}
              title={micOn ? 'Mute mic' : 'Unmute mic'}
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={togglePreviewCam}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition',
                camOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-rose-600 text-white',
              )}
              title={camOn ? 'Turn camera off' : 'Turn camera on'}
            >
              {camOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Room Join Details */}
        <div className="space-y-4">
          <Badge tone="gold" className="w-fit">
            Room {roomCode}
          </Badge>
          <div>
            <h3 className="font-display text-2xl font-bold text-white">{meetingTitle}</h3>
            <p className="mt-1 text-xs text-white/60">Hosted by {organizerName}</p>
          </div>

          {deviceWarn && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
              {deviceWarn}
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-xs text-white/75">
            <div className="flex items-center justify-between">
              <span>Microphone</span>
              <span className={micOn ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'}>
                {micOn ? 'Ready (On)' : 'Muted'}
              </span>
            </div>
            {micOn && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all duration-100"
                  style={{ width: `${micLevel}%` }}
                />
              </div>
            )}
            <div className="mt-2.5 flex items-center justify-between">
              <span>Camera</span>
              <span className={camOn ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'}>
                {camOn ? 'Ready (On)' : 'Off'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="primary"
              className="w-full justify-center py-3 text-sm font-bold"
              disabled={joining}
              onClick={() => {
                previewStream?.getTracks().forEach((t) => t.stop());
                onJoin({ micOn, camOn });
              }}
            >
              <Video className="h-4 w-4" /> {joining ? 'Connecting to Room...' : 'Join Meeting Now'}
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-center border-white/15 bg-white/10 text-white hover:bg-white/20"
              onClick={() => {
                previewStream?.getTracks().forEach((t) => t.stop());
                onCancel();
              }}
            >
              Back to Meetings Lobby
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
