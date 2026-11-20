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
  Activity,
  BarChart3,
  Camera,
  CameraOff,
  Captions,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns2,
  Copy,
  Crown,
  DoorOpen,
  Download,
  Edit3,
  FileDown,
  Hand,
  LayoutGrid,
  Lock,
  Maximize2,
  Megaphone,
  MessagesSquare,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  MoreHorizontal,
  Paperclip,
  Pause,
  PenTool,
  PhoneOff,
  PictureInPicture2,
  Pin,
  PinOff,
  Play,
  Radio,
  Search,
  Send,
  Shield,
  Smile,
  Sparkles,
  Star,
  Users,
  Video,
  Volume2,
  VolumeX,
  Wifi,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/field';
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  VideoQuality,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import { liveGet, patch, post } from '@/lib/api';
import { playAlertChime, playSpeakerTestTone, showDesktopNotification } from '@/lib/alerts';
import { cn } from '@/lib/cn';
import {
  guestApiFetch,
  type AudioProfileSettings,
  type BreakoutRoomItem,
  type MeetingAccessPolicy,
  type MeetingChatMessage,
  type MeetingParticipant,
  type MeetingRow,
  type NetworkHealthStats,
  type VideoEffectMode,
  type WhiteboardStroke,
} from './meeting/meeting-types';
import { exportMeetingAttendancePdf } from './meeting/calendar-export';
import { WhiteboardOverlay } from './meeting/whiteboard-overlay';
import { PollsQaPanel } from './meeting/polls-qa-panel';
import { BreakoutRoomsModal } from './meeting/breakout-rooms-modal';
import { SecurityPopover } from './meeting/security-popover';
import {
  KeyboardShortcutsModal,
  MoreToolsPopover,
  NetworkStatsModal,
  VideoEffectsModal,
} from './meeting/more-and-settings-modals';

export type { MeetingParticipant, MeetingChatMessage, MeetingRow };

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
  companyId?: string | null;
  fullName: string;
  role: string;
}

function formatParticipantDisplay(p: { companyId?: string | null; fullName: string }): string {
  const parts = String(p.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const lastName = parts[parts.length - 1] ?? '';
  if (lastName && p.companyId) return `${lastName} · ${p.companyId}`;
  return p.companyId || lastName || 'Member';
}

type QualityTier = 'hd' | 'balanced' | 'low-signal' | '3g-ultra';
type PeerConnHealth = 'connecting' | 'connected' | 'reconnecting' | 'failed';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

function hasTurnServers(servers: RTCIceServer[]): boolean {
  return servers.some((s) => {
    const list = Array.isArray(s.urls) ? s.urls : [s.urls];
    return list.some((u) => typeof u === 'string' && /^turns?:/i.test(u.trim()));
  });
}

function buildInitialIceConfig(): RTCConfiguration {
  const servers: RTCIceServer[] = [...DEFAULT_ICE_SERVERS];
  const raw = process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object' && 'urls' in item) {
            servers.push(item as RTCIceServer);
          }
        }
      }
    } catch {
      // Ignore malformed env override and keep default STUN servers
    }
  }
  return {
    iceServers: servers,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 4,
  };
}

function pickPreferredTransceiver(
  pc: RTCPeerConnection,
  kind: 'audio' | 'video',
  scrIds: Set<string>,
): RTCRtpTransceiver | undefined {
  const candidates = pc.getTransceivers().filter((t) => {
    const legacy = t as RTCRtpTransceiver & { stopped?: boolean };
    if (legacy.stopped || t.direction === 'stopped' || t.currentDirection === 'stopped') {
      return false;
    }
    const sId = t.sender.track?.id;
    if (sId && scrIds.has(sId)) return false;
    return t.sender.track?.kind === kind || t.receiver.track?.kind === kind;
  });
  return candidates.find((t) => t.mid !== null) ?? candidates[0];
}

const QUICK_REACTIONS = ['👍', '👏', '❤️', '🎉', '😂', '🔥'];

function detectInitialQualityTier(): QualityTier {
  if (typeof navigator === 'undefined') return 'hd';
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean; downlink?: number; rtt?: number };
  };
  const conn = nav.connection;
  if (!conn) return 'hd';
  if (
    conn.saveData ||
    conn.effectiveType === '2g' ||
    conn.effectiveType === 'slow-2g' ||
    (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink <= 0.7) ||
    (typeof conn.rtt === 'number' && conn.rtt >= 450)
  ) {
    return '3g-ultra';
  }
  if (
    conn.effectiveType === '3g' ||
    (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink <= 1.6) ||
    (typeof conn.rtt === 'number' && conn.rtt >= 260)
  ) {
    return 'low-signal';
  }
  return 'hd';
}

function getPlayoutDelayForTier(tier: QualityTier): number {
  if (tier === '3g-ultra') return 0.35;
  if (tier === 'low-signal') return 0.22;
  if (tier === 'balanced') return 0.12;
  return 0.05;
}

/** Enables Opus In-Band FEC, DTX & mono voice bitrates in SDP so 20+ mics survive 3G packet loss. */
function enhanceSdpForResilience(sdp?: string): string | undefined {
  if (!sdp) return sdp;
  return sdp
    .split('\r\n')
    .map((line) => {
      if (line.startsWith('a=fmtp:') && line.includes('minptime=')) {
        let next = line;
        if (!next.includes('useinbandfec=')) next += ';useinbandfec=1';
        if (!next.includes('usedtx=')) next += ';usedtx=1';
        if (!next.includes('stereo=')) next += ';stereo=0;sprop-stereo=0';
        if (!next.includes('maxaveragebitrate=')) next += ';maxaveragebitrate=24000';
        return next;
      }
      return line;
    })
    .join('\r\n');
}

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

/** Tunes WebRTC RTCRtpSender bitrates, resolution scaling & priority for 1-to-20+ peers without stalling frames. */
async function tuneSenderQuality(
  sender: RTCRtpSender,
  profile: 'cam-video' | 'screen-video' | 'mic-audio' | 'screen-audio',
  tier: QualityTier = 'hd',
  peerCount = 1,
): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    const enc = params.encodings[0] as RTCRtpEncodingParameters & {
      priority?: string;
      networkPriority?: string;
    };
    const peers = Math.max(1, peerCount);

    if (profile === 'screen-video') {
      // Divide total screen-share uplink budget smoothly across active peers
      const baseScreenBitrate =
        tier === '3g-ultra'
          ? Math.min(320_000, Math.round(650_000 / Math.sqrt(peers)))
          : tier === 'low-signal'
            ? Math.min(550_000, Math.round(1_100_000 / Math.sqrt(peers)))
            : tier === 'balanced'
              ? Math.min(1_500_000, Math.round(2_400_000 / Math.sqrt(peers)))
              : Math.min(2_800_000, Math.round(4_000_000 / Math.sqrt(peers)));
      enc.maxBitrate = Math.max(85_000, baseScreenBitrate);
      enc.maxFramerate =
        tier === '3g-ultra' || peers >= 12
          ? 10
          : tier === 'low-signal' || peers >= 6
            ? 15
            : tier === 'balanced'
              ? 24
              : 30;
      enc.scaleResolutionDownBy =
        tier === '3g-ultra' || peers >= 12 ? 1.5 : tier === 'low-signal' ? 1.25 : 1;
      params.degradationPreference =
        tier === '3g-ultra' || tier === 'low-signal' || peers >= 6 ? 'maintain-framerate' : 'balanced';
    } else if (profile === 'cam-video') {
      // Crowd-aware per-peer camera bitrate budgeting so 20 simultaneous cameras never saturate uplink
      const maxPerPeer =
        tier === '3g-ultra'
          ? Math.max(22_000, Math.min(110_000, Math.round(380_000 / peers)))
          : tier === 'low-signal'
            ? Math.max(35_000, Math.min(220_000, Math.round(680_000 / peers)))
            : tier === 'balanced'
              ? Math.max(65_000, Math.min(650_000, Math.round(1_350_000 / peers)))
              : Math.max(110_000, Math.min(1_500_000, Math.round(2_500_000 / peers)));
      enc.maxBitrate = maxPerPeer;

      const baseFps =
        tier === '3g-ultra' ? 12 : tier === 'low-signal' ? 15 : tier === 'balanced' ? 24 : 30;
      enc.maxFramerate =
        peers >= 13
          ? Math.min(baseFps, tier === '3g-ultra' ? 10 : 15)
          : peers >= 7
            ? Math.min(baseFps, 18)
            : peers >= 3
              ? Math.min(baseFps, 24)
              : baseFps;

      const baseScale =
        tier === '3g-ultra' ? 3 : tier === 'low-signal' ? 2 : tier === 'balanced' ? 1.5 : 1;
      enc.scaleResolutionDownBy =
        peers >= 13
          ? Math.max(baseScale, 3)
          : peers >= 7
            ? Math.max(baseScale, 2.25)
            : peers >= 3
              ? Math.max(baseScale, 1.5)
              : baseScale;

      enc.networkPriority = tier === '3g-ultra' || tier === 'low-signal' || peers >= 6 ? 'low' : 'medium';
      params.degradationPreference = tier === 'hd' && peers <= 2 ? 'balanced' : 'maintain-framerate';
    } else if (profile === 'screen-audio') {
      enc.maxBitrate =
        tier === '3g-ultra'
          ? 40_000
          : tier === 'low-signal'
            ? 56_000
            : tier === 'balanced'
              ? 80_000
              : 128_000;
      enc.priority = 'high';
      enc.networkPriority = 'high';
    } else {
      // Prioritize voice packets above video so 20-person calls on 3G/4G never lose speech clarity
      enc.maxBitrate =
        tier === '3g-ultra' || peers >= 10
          ? 20_000
          : tier === 'low-signal' || peers >= 5
            ? 28_000
            : tier === 'balanced'
              ? 40_000
              : 64_000;
      enc.priority = 'high';
      enc.networkPriority = 'high';
    }

    await sender.setParameters(params);
  } catch {
    // Some browsers disallow tuning before negotiation settles
  }
}

/** Dedicated hidden audio playback component per peer/screen with speaker output routing (setSinkId) & individual volume. */
function RemoteAudioPlayer({
  stream,
  muted = false,
  volume = 1,
  sinkId = '',
  onAutoplayBlocked,
}: {
  stream: MediaStream | undefined;
  muted?: boolean;
  volume?: number;
  sinkId?: string;
  onAutoplayBlocked: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blockedCbRef = useRef(onAutoplayBlocked);
  blockedCbRef.current = onAutoplayBlocked;
  const boundTrackSigRef = useRef<string>('');
  const trackSig = stream?.getAudioTracks().map((t) => `${t.id}:${t.readyState}`).join(',') ?? '';

  useEffect(() => {
    const el = audioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el) return;
    el.muted = muted;
    el.volume = Math.max(0, Math.min(1, volume));
    if (sinkId && typeof el.setSinkId === 'function') {
      void el.setSinkId(sinkId).catch(() => undefined);
    }
  }, [muted, volume, sinkId]);

  useEffect(() => {
    const el = audioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el) return;
    if (!stream || !trackSig) {
      boundTrackSigRef.current = '';
      if (el.srcObject) el.srcObject = null;
      return;
    }
    if (boundTrackSigRef.current === trackSig && el.srcObject) {
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      boundTrackSigRef.current = '';
      el.srcObject = null;
      return;
    }

    boundTrackSigRef.current = trackSig;
    el.srcObject = new MediaStream(audioTracks);
    el.muted = muted;
    el.volume = Math.max(0, Math.min(1, volume));
    if (sinkId && typeof el.setSinkId === 'function') {
      void el.setSinkId(sinkId).catch(() => undefined);
    }
    el.play().catch(() => {
      blockedCbRef.current();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackSig]);

  return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
}

/** Binds a MediaStream cleanly to a <video> element without triggering React srcObject resets. */
function VideoCanvas({
  stream,
  mirrored = false,
  className,
  style,
}: {
  stream: MediaStream | null | undefined;
  mirrored?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const boundTrackSigRef = useRef<string>('');
  const trackSig = stream?.getTracks().map((t) => `${t.id}:${t.readyState}`).join(',') ?? '';

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!stream || !trackSig) {
      boundTrackSigRef.current = '';
      if (el.srcObject) el.srcObject = null;
      return;
    }
    if (boundTrackSigRef.current === trackSig && el.srcObject) {
      return;
    }
    boundTrackSigRef.current = trackSig;
    el.srcObject = stream;
    el.play().catch(() => undefined);
  }, [stream, trackSig]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      style={style}
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
  fillStage = false,
  isPinned = false,
  isSpotlight = false,
  mirrorSelf = true,
  touchUp = false,
  videoEffect = 'none',
  remoteVolume = 1,
  onVolumeChange,
  onTogglePin,
  onToggleSpotlight,
  canHostControl,
  onHostMute,
  onHostStopVideo,
  connectionStatus,
  iceTurnConfigured,
  onRetryConnection,
}: {
  participant: MeetingParticipant;
  stream: MediaStream | null | undefined;
  isSelf: boolean;
  isSpeaking: boolean;
  reaction?: string;
  compact?: boolean;
  fillStage?: boolean;
  isPinned?: boolean;
  isSpotlight?: boolean;
  mirrorSelf?: boolean;
  touchUp?: boolean;
  videoEffect?: VideoEffectMode;
  remoteVolume?: number;
  onVolumeChange?: (userId: string, vol: number) => void;
  onTogglePin?: (userId: string) => void;
  onToggleSpotlight?: (userId: string) => void;
  canHostControl?: boolean;
  onHostMute?: (userId: string) => void;
  onHostStopVideo?: (userId: string) => void;
  connectionStatus?: PeerConnHealth;
  iceTurnConfigured?: boolean;
  onRetryConnection?: (userId: string) => void;
}) {
  const hasLiveVideo =
    participant.camOn &&
    Boolean(stream?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled));

  const selfFilterStyle: React.CSSProperties | undefined = isSelf
    ? {
        filter: [
          touchUp ? 'brightness(1.1) contrast(1.04) saturate(1.06)' : '',
          videoEffect === 'blur-light' ? 'contrast(1.03)' : '',
        ]
          .filter(Boolean)
          .join(' ') || undefined,
      }
    : undefined;

  const virtualBackdropClass =
    isSelf && videoEffect === 'bg-yakunex'
      ? 'ring-2 ring-[#D4A843]/50 bg-gradient-to-br from-[#1C160A] via-[#2B200B] to-[#0B0F17]'
      : isSelf && videoEffect === 'bg-studio'
        ? 'bg-gradient-to-br from-indigo-950 via-slate-900 to-cyan-950'
        : isSelf && videoEffect === 'bg-slate'
          ? 'bg-gradient-to-br from-zinc-800 to-zinc-950'
          : 'bg-[#111827]';

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-[20px] border transition-all duration-200 ring-1 ring-inset ring-white/[0.07]',
        virtualBackdropClass,
        fillStage ? 'h-full w-full min-h-[360px]' : compact ? 'aspect-video w-full shrink-0' : 'aspect-video w-full',
        isSpotlight
          ? 'border-[#F5C451] ring-2 ring-[#F5C451]/60 shadow-[0_0_32px_rgba(245,196,81,0.28)]'
          : isSpeaking && participant.micOn
            ? 'border-[#22C55E] ring-2 ring-[#22C55E]/55 shadow-[0_0_24px_rgba(34,197,94,0.25)]'
            : 'border-white/[0.08]',
      )}
    >
      {hasLiveVideo ? (
        <div className="relative h-full w-full">
          <VideoCanvas
            stream={stream}
            mirrored={isSelf && mirrorSelf}
            style={selfFilterStyle}
          />
          {isSelf && (videoEffect === 'blur-light' || videoEffect === 'blur-strong') && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backdropFilter: videoEffect === 'blur-strong' ? 'blur(8px)' : 'blur(4px)',
                WebkitMaskImage:
                  'radial-gradient(ellipse 46% 58% at 50% 48%, transparent 52%, black 92%)',
                maskImage:
                  'radial-gradient(ellipse 46% 58% at 50% 48%, transparent 52%, black 92%)',
              }}
            />
          )}
          {isSelf && (videoEffect === 'bg-yakunex' || videoEffect === 'bg-studio' || videoEffect === 'bg-slate') && (
            <div className="pointer-events-none absolute inset-0 border-[6px] border-black/25">
              {videoEffect === 'bg-yakunex' && (
                <span className="absolute right-3 bottom-11 rounded-md border border-[#D4A843]/40 bg-black/55 px-2 py-0.5 text-[9px] font-bold tracking-widest text-[#D4A843] uppercase backdrop-blur">
                  YAKUNEX HQ
                </span>
              )}
            </div>
          )}
        </div>
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
            <div className="mt-2.5 flex flex-col items-center gap-1.5 text-center">
              <p className="text-xs font-medium text-white/60">
                {!participant.camOn
                  ? 'Camera is off'
                  : !isSelf && connectionStatus === 'failed'
                    ? iceTurnConfigured
                      ? 'Network blocked video (ICE failed)'
                      : 'Network/NAT blocked video (TURN relay needed)'
                    : !isSelf && connectionStatus === 'reconnecting'
                      ? 'Reconnecting camera...'
                      : 'Connecting camera...'}
              </p>
              {participant.camOn && !isSelf && connectionStatus === 'failed' && onRetryConnection && (
                <button
                  type="button"
                  onClick={() => onRetryConnection(participant.userId)}
                  className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90 hover:bg-white/20"
                >
                  Retry Connection
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hand raised / Screen sharing / Spotlight badges */}
      <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
        {isSpotlight && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#D4A843] px-2.5 py-1 text-[11px] font-bold text-slate-950 shadow">
            <Star className="h-3 w-3" /> Spotlight
          </span>
        )}
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

      {/* Pin / Spotlight / Host quick controls / Individual Volume */}
      <div className="absolute right-3 top-3 flex flex-wrap items-center justify-end gap-1.5">
        {!isSelf && onVolumeChange && !compact && (
          <button
            type="button"
            title={remoteVolume === 0 ? 'Unmute locally' : 'Mute participant locally'}
            onClick={() => onVolumeChange(participant.userId, remoteVolume === 0 ? 1 : 0)}
            className={cn(
              'items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold shadow transition',
              remoteVolume === 0
                ? 'inline-flex bg-rose-600/90 text-white'
                : 'hidden bg-black/65 text-white/85 backdrop-blur hover:bg-black/85 group-hover:inline-flex',
            )}
          >
            {remoteVolume === 0 ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </button>
        )}
        {canHostControl && onToggleSpotlight && !compact && (
          <button
            type="button"
            onClick={() => onToggleSpotlight(participant.userId)}
            title={isSpotlight ? 'Remove Spotlight for Everyone' : 'Spotlight for Everyone'}
            className={cn(
              'items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow transition',
              isSpotlight
                ? 'inline-flex bg-[#D4A843] text-slate-950'
                : 'hidden bg-black/65 text-amber-200 backdrop-blur hover:bg-black/85 group-hover:inline-flex',
            )}
          >
            <Star className="h-3 w-3" /> {isSpotlight ? 'Unspot' : 'Spotlight'}
          </button>
        )}
        {onTogglePin && !compact && (
          <button
            type="button"
            onClick={() => onTogglePin(participant.userId)}
            title={isPinned ? 'Unpin from Main Screen' : 'Pin to Main Screen'}
            className={cn(
              'items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow transition',
              isPinned
                ? 'inline-flex bg-[#D4A843] text-slate-950 hover:bg-[#e3b955]'
                : 'hidden bg-black/65 text-white/90 backdrop-blur hover:bg-black/85 group-hover:inline-flex',
            )}
          >
            {isPinned ? (
              <>
                <PinOff className="h-3 w-3" /> Main
              </>
            ) : (
              <>
                <Pin className="h-3 w-3" /> Pin
              </>
            )}
          </button>
        )}
        {canHostControl && !isSelf && participant.micOn && onHostMute && (
          <button
            type="button"
            onClick={() => onHostMute(participant.userId)}
            className="hidden items-center gap-1 rounded-full bg-rose-600/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow transition hover:bg-rose-500 group-hover:inline-flex"
          >
            <MicOff className="h-3 w-3" /> Mute
          </button>
        )}
        {canHostControl && !isSelf && participant.camOn && onHostStopVideo && !compact && (
          <button
            type="button"
            onClick={() => onHostStopVideo(participant.userId)}
            className="hidden items-center gap-1 rounded-full bg-slate-800/90 px-2 py-1 text-[11px] font-semibold text-rose-200 shadow transition hover:bg-rose-600 hover:text-white group-hover:inline-flex"
          >
            <CameraOff className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Floating emoji reaction */}
      {reaction && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="animate-bounce text-5xl drop-shadow-lg">{reaction}</span>
        </div>
      )}

      {/* Zoom Bottom-Left Compact Frosted Nameplate Pill */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-2.5">
        <div className="inline-flex max-w-[82%] items-center gap-1.5 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1 backdrop-blur-md">
          <span
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
              participant.micOn ? 'text-[#30D158]' : 'text-[#FF453A]',
            )}
          >
            {participant.micOn ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
          </span>
          <span className="truncate text-[11px] font-semibold tracking-tight text-white">
            {formatParticipantDisplay(participant)}
            {isSelf ? ' (You)' : ''}
          </span>
        </div>
        {!compact && (
          <span className="rounded-md border border-white/10 bg-black/50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/70 backdrop-blur-md">
            {participant.isGuest ? 'GUEST' : participant.role}
          </span>
        )}
      </div>
    </div>
  );
}

/** Zoom-Style In-Call Studio with Hybrid LiveKit SFU + WebRTC P2P Video, Audio, Screen Share & Full Enterprise Controls */
export function MeetingStudio({
  initialRoom,
  initialMicOn,
  initialCamOn,
  initialMicId = '',
  initialCamId = '',
  initialSpeakerId = '',
  policy = null,
  guestToken = null,
  currentUser,
  onExited,
  onMovedToWaitingRoom,
  onMeetingUpdated,
  standalone = false,
}: {
  initialRoom: MeetingRow;
  initialMicOn: boolean;
  initialCamOn: boolean;
  initialMicId?: string;
  initialCamId?: string;
  initialSpeakerId?: string;
  policy?: MeetingAccessPolicy | null;
  guestToken?: string | null;
  currentUser: CurrentUserInfo;
  onExited: (endedForAll?: boolean) => void;
  onMovedToWaitingRoom?: (room: MeetingRow) => void;
  onMeetingUpdated?: (room: MeetingRow) => void;
  standalone?: boolean;
}) {
  const [room, setRoom] = useState<MeetingRow>(initialRoom);
  const [micOn, setMicOn] = useState(initialMicOn);
  const [camOn, setCamOn] = useState(initialCamOn);
  const [screenOn, setScreenOn] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'gallery' | 'speaker'>('gallery');
  // Default 'closed' like Zoom so video stage gets 100% width immediately on join
  const [sideTab, setSideTab] = useState<'closed' | 'participants' | 'chat' | 'polls' | 'notes'>('closed');
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
  const [showSecurityMenu, setShowSecurityMenu] = useState(false);
  const [showMeetingInfo, setShowMeetingInfo] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showEffectsModal, setShowEffectsModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [breakoutModalOpen, setBreakoutModalOpen] = useState(false);
  const [activeBreakoutId, setActiveBreakoutId] = useState<string | null>(null);
  const [deviceMenu, setDeviceMenu] = useState<'mic' | 'cam' | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>(initialMicId);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>(initialSpeakerId);
  const [selectedCamId, setSelectedCamId] = useState<string>(initialCamId);
  const [audioProfile, setAudioProfile] = useState<AudioProfileSettings>({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    originalSound: false,
  });
  const [pushToTalkActive, setPushToTalkActive] = useState(false);
  const [videoEffect, setVideoEffect] = useState<VideoEffectMode>('none');
  const [mirrorVideo, setMirrorVideo] = useState(true);
  const [hideSelfView, setHideSelfView] = useState(false);
  const [hideNonVideo, setHideNonVideo] = useState(false);
  const [touchUp, setTouchUp] = useState(false);
  const [bandwidthSaver, setBandwidthSaver] = useState(false);
  const [sideBySideShare, setSideBySideShare] = useState(false);
  const [shareSplitPct, setShareSplitPct] = useState(72);
  const [shareZoom, setShareZoom] = useState(1);
  const [optimizeVideoShare, setOptimizeVideoShare] = useState(false);
  const [whiteboardMode, setWhiteboardMode] = useState<'closed' | 'whiteboard' | 'annotate'>('closed');
  const [whiteboardStrokes, setWhiteboardStrokes] = useState<WhiteboardStroke[]>([]);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [liveCaptions, setLiveCaptions] = useState<Array<{ id: string; speaker: string; text: string }>>([]);
  const [askUnmutePrompt, setAskUnmutePrompt] = useState<{ by: string } | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');
  const [waitingBroadcastDraft, setWaitingBroadcastDraft] = useState('');
  const [remoteVolumes, setRemoteVolumes] = useState<Record<string, number>>({});
  const [networkStats, setNetworkStats] = useState<NetworkHealthStats>({
    rttMs: 28,
    bitrateKbps: 1450,
    packetLossPct: 0,
    resolution: '1280×720',
    transport: 'WebRTC P2P',
    qualityLabel: 'Excellent',
    bars: 4,
  });
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [screenAudioMuted, setScreenAudioMuted] = useState(false);
  const [shareRequests, setShareRequests] = useState<Array<{ userId: string; fullName: string }>>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chatReplyTo, setChatReplyTo] = useState<MeetingChatMessage | null>(null);
  const [chatRecipientId, setChatRecipientId] = useState<string>('ALL');
  const [chatAttachment, setChatAttachment] = useState<{ name: string; dataUrl: string } | null>(null);
  const chatFileRef = useRef<HTMLInputElement | null>(null);
  const [isPip, setIsPip] = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState<Record<string, boolean>>({});
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteCamStreams, setRemoteCamStreams] = useState<Record<string, MediaStream>>({});
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Record<string, MediaStream>>({});
  const [peerConnStates, setPeerConnStates] = useState<Record<string, PeerConnHealth>>({});
  const [iceTurnConfigured, setIceTurnConfigured] = useState<boolean>(() =>
    hasTurnServers(buildInitialIceConfig().iceServers ?? []),
  );
  const [sfuActive, setSfuActive] = useState(false);
  const [galleryPage, setGalleryPage] = useState(0);
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);

  // Refs for WebRTC stability across closures & async signal callbacks
  const sfuModeRef = useRef(false);
  const sfuRoomRef = useRef<Room | null>(null);
  const iceConfigRef = useRef<RTCConfiguration>(buildInitialIceConfig());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteCamStreamsRef = useRef<Record<string, MediaStream>>({});
  const remoteScreenStreamsRef = useRef<Record<string, MediaStream>>({});
  const remoteScreenStreamIdsRef = useRef<Record<string, string>>({});
  const remoteScreenTrackIdsRef = useRef<Record<string, string>>({});
  const remoteScreenAudioTrackIdsRef = useRef<Record<string, string>>({});
  const participantsRef = useRef<MeetingParticipant[]>(initialRoom.participants);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerConnStatesRef = useRef<Map<string, PeerConnHealth>>(new Map());
  const lastOfferAtRef = useRef<Map<string, number>>(new Map());
  const lastNeedOfferAtRef = useRef<Map<string, number>>(new Map());
  const seenNeedOfferSessionsRef = useRef<Set<string>>(new Set());
  const localSessionIdRef = useRef<string>(Math.random().toString(36).slice(2, 10));
  const renegotiatePeerRef = useRef<
    (peerId: string, iceRestart?: boolean, forceResetIfStuck?: boolean) => Promise<void>
  >(async () => undefined);
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const pendingRenegotiateRef = useRef<Set<string>>(new Set());
  const pendingIceRestartRef = useRef<Set<string>>(new Set());
  const disconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const seenSignalIdsRef = useRef<Set<string>>(new Set());
  const activeTierRef = useRef<QualityTier>(detectInitialQualityTier());
  const speakingRef = useRef<Record<string, boolean>>({});
  const roomSigRef = useRef<string>('');
  const iceBatchRef = useRef<
    Map<string, { timer: ReturnType<typeof setTimeout> | null; candidates: RTCIceCandidateInit[] }>
  >(new Map());
  const lastSignalSeqRef = useRef<number>(0);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const studioRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recRafRef = useRef<number | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const lastChatCountRef = useRef<number>(initialRoom.chatMessages?.length ?? 0);
  const micOnRef = useRef(micOn);
  const camOnRef = useRef(camOn);
  const sideTabRef = useRef(sideTab);
  const handleDataSignalRef = useRef<(sig: MeetingSignalItem) => void>(() => undefined);

  micOnRef.current = micOn;
  camOnRef.current = camOn;
  sideTabRef.current = sideTab;
  participantsRef.current = room.participants;

  const isGuest = Boolean(guestToken || currentUser.role.toUpperCase() === 'GUEST');

  const isPrimaryHost = useMemo(() => {
    if (isGuest) return false;
    const r = currentUser.role.toUpperCase();
    return (
      room.organizerId === currentUser.id ||
      room.organizerName === currentUser.fullName ||
      r === 'SUPER_ADMIN'
    );
  }, [currentUser.fullName, currentUser.id, currentUser.role, isGuest, room.organizerId, room.organizerName]);

  // Clean policy + server-aligned host control (no hardcoded legacy strings)
  const canHostControl = useMemo(() => {
    if (isGuest) return false;
    const r = currentUser.role.toUpperCase();
    if (r === 'SUPER_ADMIN') return true;
    if (r === 'INTERN' || policy?.waitingRoomControl === 'NONE') return false;
    return (
      room.organizerId === currentUser.id ||
      room.organizerName === currentUser.fullName ||
      (room.coHostIds ?? []).includes(currentUser.id) ||
      r === 'ADMIN' ||
      r === 'PROJECT_MANAGER'
    );
  }, [
    currentUser.fullName,
    currentUser.id,
    currentUser.role,
    isGuest,
    policy?.waitingRoomControl,
    room.coHostIds,
    room.organizerId,
    room.organizerName,
  ]);

  // Strict tier-enforced recording permission (hidden for Interns & Tier 4 Core Staff / NONE scope)
  const canRecord = useMemo(() => {
    if (isGuest) return false;
    const r = currentUser.role.toUpperCase();
    if (r === 'SUPER_ADMIN') return true;
    if (r === 'INTERN') return false;
    if (policy && policy.recordingScope === 'NONE') return false;
    if (!policy && r === 'STAFF' && !canHostControl) return false;
    return room.recordingAllowed !== false || canHostControl;
  }, [canHostControl, currentUser.role, isGuest, policy, room.recordingAllowed]);

  // Unified API wrappers that seamlessly support both Authenticated Employees and External Guests
  const mGet = useCallback(
    <T,>(suffix: string): Promise<T> => {
      if (guestToken) {
        return guestApiFetch<T>(`/meetings/public/${room.id}${suffix}`, guestToken);
      }
      return liveGet<T>(`/meetings/${room.id}${suffix}`);
    },
    [guestToken, room.id],
  );

  const mPost = useCallback(
    <T,>(suffix: string, body: unknown): Promise<T> => {
      if (guestToken) {
        return guestApiFetch<T>(`/meetings/public/${room.id}${suffix}`, guestToken, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      return post<T>(`/meetings/${room.id}${suffix}`, body);
    },
    [guestToken, room.id],
  );

  const mPatch = useCallback(
    <T,>(suffix: string, body: unknown): Promise<T> => {
      if (guestToken) {
        return guestApiFetch<T>(`/meetings/public/${room.id}${suffix}`, guestToken, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      }
      return patch<T>(`/meetings/${room.id}${suffix}`, body);
    },
    [guestToken, room.id],
  );

  const showToast = useCallback((msg: string) => {
    setBannerNotice(msg);
  }, []);

  const resetFullscreenAutoHide = useCallback(() => {
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
    if (!isFullscreen) {
      setControlsHidden(false);
      return;
    }
    setControlsHidden(false);
    hideControlsTimerRef.current = setTimeout(() => {
      setControlsHidden(true);
    }, 5000);
  }, [isFullscreen]);

  useEffect(() => {
    resetFullscreenAutoHide();
    return () => {
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
      }
    };
  }, [resetFullscreenAutoHide]);

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
      setSpeakerDevices(devices.filter((d) => d.kind === 'audiooutput'));
      setVideoDevices(devices.filter((d) => d.kind === 'videoinput'));
    } catch {
      // Ignore permission restrictions before capture
    }
  }, []);

  /** Sub-50ms LiveKit DataChannel broadcast when SFU is active; returns true if pushed directly over SFU. */
  const publishRealtimeData = useCallback(
    (type: string, payload: unknown, toUserId = '*'): boolean => {
      const lkRoom = sfuRoomRef.current;
      if (!lkRoom || lkRoom.state !== 'connected') return false;
      try {
        const packet = JSON.stringify({
          id: `dc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          seq: Date.now(),
          fromUserId: currentUser.id,
          fromUserName: currentUser.fullName,
          toUserId,
          type,
          payload,
          createdAt: Date.now(),
        });
        const bytes = new TextEncoder().encode(packet);
        void lkRoom.localParticipant.publishData(bytes, { reliable: true }).catch(() => undefined);
        return true;
      } catch {
        return false;
      }
    },
    [currentUser.fullName, currentUser.id],
  );

  const signalOutboxRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    queue: Array<{
      toUserId: string;
      type: string;
      payload: unknown;
      resolve: (ok: boolean) => void;
    }>;
  }>({ timer: null, queue: [] });

  const flushSignalOutbox = useCallback(async () => {
    const box = signalOutboxRef.current;
    box.timer = null;
    if (box.queue.length === 0) return;
    const items = box.queue.splice(0, box.queue.length);
    try {
      if (items.length === 1) {
        const only = items[0]!;
        await mPost('/signal', {
          toUserId: only.toUserId,
          type: only.type,
          payload: only.payload,
        });
      } else {
        await mPost('/signal', {
          batch: items.map((item) => ({
            toUserId: item.toUserId,
            type: item.type,
            payload: item.payload,
          })),
        });
      }
      items.forEach((item) => item.resolve(true));
    } catch {
      items.forEach((item) => item.resolve(false));
    }
  }, [mPost]);

  const sendSignal = useCallback(
    (toUserId: string, type: string, payload: unknown): Promise<boolean> => {
      // Push instant lightweight collaboration events via LiveKit DataChannel (<50ms) too
      if (
        type === 'reaction' ||
        type === 'whiteboard-stroke' ||
        type === 'whiteboard-undo' ||
        type === 'whiteboard-clear' ||
        type === 'live-caption' ||
        type === 'spotlight-updated'
      ) {
        publishRealtimeData(type, payload, toUserId);
      }
      return new Promise<boolean>((resolve) => {
        const box = signalOutboxRef.current;
        box.queue.push({ toUserId, type, payload, resolve });
        if (box.queue.length >= 25) {
          if (box.timer) {
            clearTimeout(box.timer);
            box.timer = null;
          }
          void flushSignalOutbox();
        } else if (!box.timer) {
          box.timer = setTimeout(() => {
            void flushSignalOutbox();
          }, 28);
        }
      });
    },
    [flushSignalOutbox, publishRealtimeData],
  );

  // Resolve server-supplied STUN + optional TURN ICE configuration on mount
  useEffect(() => {
    let active = true;
    const iceReq = guestToken
      ? fetch('/api/meetings/public/ice-config', { cache: 'no-store' }).then((r) => r.json())
      : liveGet<{ iceServers?: RTCIceServer[]; hasTurn?: boolean; iceCandidatePoolSize?: number }>(
          '/meetings/ice-config',
        );
    iceReq
      .then((cfg: { iceServers?: RTCIceServer[]; hasTurn?: boolean; iceCandidatePoolSize?: number }) => {
        if (!active || !Array.isArray(cfg?.iceServers) || cfg.iceServers.length === 0) return;
        const base = buildInitialIceConfig();
        const combined: RTCIceServer[] = [...cfg.iceServers];
        const envServers = base.iceServers ?? [];
        if (hasTurnServers(envServers)) {
          for (const entry of envServers) {
            if (hasTurnServers([entry])) combined.push(entry);
          }
        }
        const nextConfig: RTCConfiguration = {
          iceServers: combined,
          bundlePolicy: 'max-bundle',
          rtcpMuxPolicy: 'require',
          iceCandidatePoolSize: cfg.iceCandidatePoolSize ?? 4,
        };
        iceConfigRef.current = nextConfig;
        setIceTurnConfigured(Boolean(cfg.hasTurn) || hasTurnServers(combined));
        // Upgrade any peer connections not yet ICE connected with the dynamic ICE config
        for (const pc of pcsRef.current.values()) {
          if (pc.connectionState !== 'closed' && pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
            try {
              pc.setConfiguration(nextConfig);
            } catch {
              // Ignore browser configuration constraint mismatches
            }
          }
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Connect to LiveKit SFU if configured on backend (enables 100+ simultaneous cameras & mics with zero lag)
  const syncSfuLocalTracks = useCallback(async () => {
    const lkRoom = sfuRoomRef.current;
    if (!lkRoom || lkRoom.state !== 'connected') return;
    const local = localStreamRef.current;
    if (!local) return;

    const audioTrack = local.getAudioTracks().find((t) => t.readyState === 'live');
    const videoTrack = local.getVideoTracks().find((t) => t.readyState === 'live');

    if (audioTrack) {
      const existingAudio = lkRoom.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (existingAudio?.track && existingAudio.track.mediaStreamTrack.id !== audioTrack.id) {
        await lkRoom.localParticipant.unpublishTrack(existingAudio.track).catch(() => undefined);
      }
      if (!lkRoom.localParticipant.getTrackPublication(Track.Source.Microphone)) {
        await lkRoom.localParticipant
          .publishTrack(audioTrack, {
            source: Track.Source.Microphone,
            dtx: true,
            red: true,
          })
          .catch(() => undefined);
      }
      const micPub = lkRoom.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (micPub) {
        if (micOnRef.current && micPub.isMuted) await micPub.unmute().catch(() => undefined);
        else if (!micOnRef.current && !micPub.isMuted) await micPub.mute().catch(() => undefined);
      }
    }

    if (videoTrack) {
      const existingVideo = lkRoom.localParticipant.getTrackPublication(Track.Source.Camera);
      if (existingVideo?.track && existingVideo.track.mediaStreamTrack.id !== videoTrack.id) {
        await lkRoom.localParticipant.unpublishTrack(existingVideo.track).catch(() => undefined);
      }
      if (!lkRoom.localParticipant.getTrackPublication(Track.Source.Camera)) {
        await lkRoom.localParticipant
          .publishTrack(videoTrack, {
            source: Track.Source.Camera,
            simulcast: true,
            videoSimulcastLayers: [VideoPresets.h90, VideoPresets.h180, VideoPresets.h360],
          })
          .catch(() => undefined);
      }
      const camPub = lkRoom.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub) {
        if (camOnRef.current && camPub.isMuted) await camPub.unmute().catch(() => undefined);
        else if (!camOnRef.current && !camPub.isMuted) await camPub.mute().catch(() => undefined);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    let connectedRoom: Room | null = null;

    async function initSfu() {
      try {
        const activeBr = (room.breakoutRooms ?? []).find((b) => b.id === activeBreakoutId && b.active);
        const tokenSuffix = activeBr && !guestToken
          ? `/sfu-token?roomOverride=${encodeURIComponent(activeBr.roomCode)}`
          : '/sfu-token';
        const res = await mGet<{
          enabled?: boolean;
          url?: string | null;
          token?: string | null;
        }>(tokenSuffix);
        if (!active || !res?.enabled || !res.url || !res.token) return;

        const lkRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          publishDefaults: {
            simulcast: true,
            videoSimulcastLayers: [VideoPresets.h90, VideoPresets.h180, VideoPresets.h360],
            dtx: true,
            red: true,
          },
        });
        connectedRoom = lkRoom;
        sfuRoomRef.current = lkRoom;

        const upsertRemoteTrack = (
          track: RemoteTrack,
          pub: RemoteTrackPublication,
          participant: RemoteParticipant,
        ) => {
          const peerId = participant.identity;
          if (!peerId || peerId === currentUser.id) return;
          const isScreen =
            pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio;
          const targetRef = isScreen ? remoteScreenStreamsRef : remoteCamStreamsRef;
          const stream = targetRef.current[peerId] ?? new MediaStream();
          const mTrack = track.mediaStreamTrack;
          for (const old of stream.getTracks()) {
            if (old.kind === mTrack.kind && old.id !== mTrack.id) {
              stream.removeTrack(old);
            }
          }
          if (!stream.getTracks().some((t) => t.id === mTrack.id)) {
            stream.addTrack(mTrack);
          }
          const cloned = new MediaStream(stream.getTracks());
          targetRef.current[peerId] = cloned;
          if (isScreen) {
            setRemoteScreenStreams((prev) => ({ ...prev, [peerId]: cloned }));
          } else {
            setRemoteCamStreams((prev) => ({ ...prev, [peerId]: cloned }));
            peerConnStatesRef.current.set(peerId, 'connected');
            setPeerConnStates((prev) => ({ ...prev, [peerId]: 'connected' }));
          }
        };

        const removeRemoteTrack = (
          track: RemoteTrack,
          pub: RemoteTrackPublication,
          participant: RemoteParticipant,
        ) => {
          const peerId = participant.identity;
          const isScreen =
            pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio;
          const targetRef = isScreen ? remoteScreenStreamsRef : remoteCamStreamsRef;
          const stream = targetRef.current[peerId];
          if (!stream) return;
          stream.removeTrack(track.mediaStreamTrack);
          if (stream.getTracks().length === 0) {
            delete targetRef.current[peerId];
            if (isScreen) {
              setRemoteScreenStreams((prev) => {
                const next = { ...prev };
                delete next[peerId];
                return next;
              });
            } else {
              setRemoteCamStreams((prev) => {
                const next = { ...prev };
                delete next[peerId];
                return next;
              });
            }
          } else {
            const cloned = new MediaStream(stream.getTracks());
            targetRef.current[peerId] = cloned;
            if (isScreen) {
              setRemoteScreenStreams((prev) => ({ ...prev, [peerId]: cloned }));
            } else {
              setRemoteCamStreams((prev) => ({ ...prev, [peerId]: cloned }));
            }
          }
        };

        lkRoom
          .on(RoomEvent.TrackSubscribed, upsertRemoteTrack)
          .on(RoomEvent.TrackUnsubscribed, removeRemoteTrack)
          .on(RoomEvent.TrackUnmuted, (pub, participant) => {
            if (participant.identity && participant.identity !== currentUser.id && pub.track) {
              upsertRemoteTrack(
                pub.track as RemoteTrack,
                pub as RemoteTrackPublication,
                participant as RemoteParticipant,
              );
            }
          })
          .on(RoomEvent.TrackMuted, (pub, participant) => {
            if (participant.identity && participant.identity !== currentUser.id && pub.track) {
              upsertRemoteTrack(
                pub.track as RemoteTrack,
                pub as RemoteTrackPublication,
                participant as RemoteParticipant,
              );
            }
          })
          .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            const nextMap: Record<string, boolean> = {};
            for (const sp of speakers) {
              if (sp.identity) nextMap[sp.identity] = true;
            }
            speakingRef.current = nextMap;
            setSpeakingUsers(nextMap);
          })
          .on(RoomEvent.DataReceived, (payloadBytes) => {
            try {
              const decoded = JSON.parse(new TextDecoder().decode(payloadBytes)) as MeetingSignalItem;
              if (
                decoded &&
                decoded.type &&
                decoded.fromUserId !== currentUser.id &&
                (decoded.toUserId === '*' || decoded.toUserId === currentUser.id)
              ) {
                handleDataSignalRef.current(decoded);
              }
            } catch {
              // Ignore non-JSON data packets
            }
          })
          .on(RoomEvent.ParticipantConnected, (p) => {
            if (p.identity && p.identity !== currentUser.id) {
              peerConnStatesRef.current.set(p.identity, 'connected');
              setPeerConnStates((prev) => ({ ...prev, [p.identity]: 'connected' }));
            }
          })
          .on(RoomEvent.Reconnecting, () => {
            if (active) setReconnecting(true);
          })
          .on(RoomEvent.Reconnected, () => {
            if (active) {
              setReconnecting(false);
              showToast('Connection restored.');
            }
          })
          .on(RoomEvent.Connected, () => {
            if (!active) return;
            setReconnecting(false);
            sfuModeRef.current = true;
            setSfuActive(true);
            void syncSfuLocalTracks();
          })
          .on(RoomEvent.Disconnected, () => {
            if (!active) return;
            sfuModeRef.current = false;
            setSfuActive(false);
          });

        await lkRoom.connect(res.url, res.token);
        if (!active) {
          await lkRoom.disconnect();
          return;
        }
        // Switch engine to SFU only after LiveKit WebSocket + WebRTC connection succeeds
        sfuModeRef.current = true;
        setSfuActive(true);
        pcsRef.current.forEach((pc) => pc.close());
        pcsRef.current.clear();

        for (const remote of lkRoom.remoteParticipants.values()) {
          if (remote.identity && remote.identity !== currentUser.id) {
            peerConnStatesRef.current.set(remote.identity, 'connected');
            setPeerConnStates((prev) => ({ ...prev, [remote.identity]: 'connected' }));
            for (const pub of remote.trackPublications.values()) {
              if (pub.isSubscribed && pub.track) {
                upsertRemoteTrack(
                  pub.track as RemoteTrack,
                  pub as RemoteTrackPublication,
                  remote,
                );
              }
            }
          }
        }
        await syncSfuLocalTracks();
      } catch {
        // Fallback cleanly to built-in P2P Mesh + Gallery Pagination
        sfuModeRef.current = false;
        setSfuActive(false);
      }
    }

    void initSfu();
    return () => {
      active = false;
      sfuModeRef.current = false;
      if (connectedRoom) {
        void connectedRoom.disconnect();
      }
      sfuRoomRef.current = null;
    };
  }, [activeBreakoutId, currentUser.id, guestToken, mGet, room.breakoutRooms, room.id, syncSfuLocalTracks]);

  // Sync localStreamRef state cleanly
  const commitLocalStream = useCallback((stream: MediaStream | null) => {
    localStreamRef.current = stream;
    setLocalStream(stream ? new MediaStream(stream.getTracks()) : null);
    if (sfuModeRef.current) {
      void syncSfuLocalTracks();
    }
  }, [syncSfuLocalTracks]);

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
      const startTier = activeTierRef.current;
      const initialVideoConstraints =
        startTier === '3g-ultra'
          ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } }
          : startTier === 'low-signal'
            ? { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 20 } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: initialMicOn
            ? {
                ...(initialMicId ? { deviceId: { exact: initialMicId } } : {}),
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,
              }
            : false,
          video: initialCamOn
            ? {
                ...(initialCamId ? { deviceId: { exact: initialCamId } } : {}),
                ...initialVideoConstraints,
              }
            : false,
        });
      } catch {
        // Fallback 1: try 720p video + audio if 1080p constraints were rejected
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
            video: initialCamOn ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false,
          });
        } catch {
          // Fallback 2: try 3G / low-res VGA video (640x360 @ 15fps) or unconstrained video before dropping camera
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: initialMicOn,
              video: initialCamOn ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15 } } : false,
            });
          } catch {
            // Fallback 3: try audio-only if camera failed/in-use by another app
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
                  camOnRef.current = false;
                  setCamOn(false);
                  void mPatch('/participant', { camOn: false }).catch(() => undefined);
                  showToast('Camera in use or unavailable — joined with microphone audio.');
                }
              } catch {
                if (active) {
                  micOnRef.current = false;
                  camOnRef.current = false;
                  setMicOn(false);
                  setCamOn(false);
                  void mPatch('/participant', {
                    micOn: false,
                    camOn: false,
                  }).catch(() => undefined);
                  showToast('Microphone/camera not detected or blocked — joined as viewer.');
                }
              }
            } else if (active && initialCamOn) {
              camOnRef.current = false;
              setCamOn(false);
              void mPatch('/participant', { camOn: false }).catch(() => undefined);
              showToast('Camera in use or unavailable — click Start Video to retry.');
            }
          }
        }
      }

      if (!active) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }

      if (stream) {
        // Retry camera capture once after a brief settle if PreJoin hardware lock was still releasing
        if (!stream.getVideoTracks()[0] && camOnRef.current) {
          await new Promise((r) => setTimeout(r, 280));
          try {
            const retryVideo = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: selectedCamId ? { exact: selectedCamId } : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
              },
            });
            const retryTrack = retryVideo.getVideoTracks()[0];
            if (retryTrack) stream.addTrack(retryTrack);
          } catch {
            // Keep audio-only stream if camera remains unavailable
          }
        }
        stream.getVideoTracks().forEach((t) => {
          t.contentHint = 'motion';
          t.enabled = camOnRef.current;
        });
        stream.getAudioTracks().forEach((t) => {
          t.enabled = micOnRef.current;
        });
        commitLocalStream(stream);
        const aTrack = stream.getAudioTracks()[0];
        const vTrack = stream.getVideoTracks()[0];
        if (!vTrack && camOnRef.current) {
          setCamOn(false);
          void patch<MeetingRow>(`/meetings/${room.id}/participant`, { camOn: false })
            .then((updated) => setRoom(updated))
            .catch(() => undefined);
        }
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

  // Apply an active bitrate/resolution tier + jitter buffer hint across all active peers (zero blink)
  const applyQualityTierToAllPeers = useCallback(async (tier: QualityTier) => {
    activeTierRef.current = tier;
    const peerCount = Math.max(1, pcsRef.current.size);
    const delayHint = getPlayoutDelayForTier(tier);
    const scrVideoId = screenStreamRef.current?.getVideoTracks()[0]?.id;
    const scrAudioId = screenStreamRef.current?.getAudioTracks()[0]?.id;
    for (const pc of pcsRef.current.values()) {
      for (const rx of pc.getReceivers()) {
        const typedRx = rx as RTCRtpReceiver & { playoutDelayHint?: number };
        if (typedRx && 'playoutDelayHint' in typedRx) {
          try {
            typedRx.playoutDelayHint = delayHint;
          } catch {
            // Ignore unsupported hint
          }
        }
      }
      for (const sender of pc.getSenders()) {
        if (!sender.track) continue;
        const profile =
          sender.track.id === scrVideoId
            ? 'screen-video'
            : sender.track.id === scrAudioId
              ? 'screen-audio'
              : sender.track.kind === 'video'
                ? 'cam-video'
                : 'mic-audio';
        await tuneSenderQuality(sender, profile, tier, peerCount);
      }
    }
  }, []);

  // Dynamically adapt local camera capture resolution & framerate as room scales up to 20 participants
  useEffect(() => {
    const peerCount = Math.max(1, room.participants.length - 1);
    const tier = activeTierRef.current;
    const vTrack = localStreamRef.current?.getVideoTracks().find((t) => t.readyState === 'live');
    if (vTrack && typeof vTrack.applyConstraints === 'function') {
      const target =
        tier === '3g-ultra' || peerCount >= 13
          ? { width: { ideal: 320 }, height: { ideal: 180 }, frameRate: { ideal: 15, max: 15 } }
          : tier === 'low-signal' || peerCount >= 7
            ? { width: { ideal: 480 }, height: { ideal: 270 }, frameRate: { ideal: 18, max: 20 } }
            : peerCount >= 3
              ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 24 } }
              : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } };
      void vTrack.applyConstraints(target).catch(() => undefined);
    }
    void applyQualityTierToAllPeers(tier);
  }, [applyQualityTierToAllPeers, room.participants.length]);

  // Attach local camera/mic + screen tracks into a peer connection and apply current quality tier
  const attachOutgoingTracks = useCallback(
    async (
      pc: RTCPeerConnection,
      options: { createOfferSlots?: boolean } = {},
    ): Promise<void> => {
      const { createOfferSlots = false } = options;
      const tier = activeTierRef.current;
      const peerCount = Math.max(1, pcsRef.current.size);
      const camStream = localStreamRef.current;
      const scrIds = new Set(screenStreamRef.current?.getTracks().map((t) => t.id) ?? []);

      // Always ensure baseline audio & video transceivers exist on negotiated m-lines (or offer slots)
      for (const kind of ['audio', 'video'] as const) {
        const wantedTrack =
          (kind === 'audio'
            ? camStream?.getAudioTracks().find((t) => t.readyState === 'live')
            : camStream?.getVideoTracks().find((t) => t.readyState === 'live')) ?? null;
        const existingTransceiver = pickPreferredTransceiver(pc, kind, scrIds);

        if (existingTransceiver) {
          if (wantedTrack && existingTransceiver.sender.track?.id !== wantedTrack.id) {
            await existingTransceiver.sender.replaceTrack(wantedTrack).catch(() => undefined);
          }
          if (wantedTrack && existingTransceiver.direction !== 'sendrecv') {
            existingTransceiver.direction = 'sendrecv';
          }
          void tuneSenderQuality(
            existingTransceiver.sender,
            kind === 'video' ? 'cam-video' : 'mic-audio',
            tier,
            peerCount,
          );
        } else if (wantedTrack && camStream) {
          const sender = pc.addTrack(wantedTrack, camStream);
          void tuneSenderQuality(
            sender,
            kind === 'video' ? 'cam-video' : 'mic-audio',
            tier,
            peerCount,
          );
        } else if (createOfferSlots) {
          pc.addTransceiver(kind, { direction: 'recvonly' });
        }
      }

      const scrStream = screenStreamRef.current;
      if (scrStream) {
        for (const track of scrStream.getTracks()) {
          if (track.readyState !== 'live') continue;
          const already = pc.getSenders().some((s) => s.track?.id === track.id);
          if (!already) {
            try {
              const sender = pc.addTrack(track, scrStream);
              void tuneSenderQuality(
                sender,
                track.kind === 'video' ? 'screen-video' : 'screen-audio',
                tier,
                peerCount,
              );
            } catch {
              // Ignore if track already attached to another sender
            }
          }
        }
      }
    },
    [],
  );

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
        }, 50);
      }
    },
    [flushIceBatch],
  );

  const setPeerHealth = useCallback((peerId: string, status: PeerConnHealth | null) => {
    const prev = peerConnStatesRef.current.get(peerId);
    if (status === null) {
      if (prev === undefined) return;
      peerConnStatesRef.current.delete(peerId);
      setPeerConnStates((curr) => {
        if (!(peerId in curr)) return curr;
        const next = { ...curr };
        delete next[peerId];
        return next;
      });
      return;
    }
    if (prev === status) return;
    peerConnStatesRef.current.set(peerId, status);
    setPeerConnStates((curr) => ({ ...curr, [peerId]: status }));
  }, []);

  const closePeer = useCallback(
    (peerId: string) => {
      const discTimer = disconnectTimersRef.current.get(peerId);
      if (discTimer) clearTimeout(discTimer);
      disconnectTimersRef.current.delete(peerId);

      const iceEntry = iceBatchRef.current.get(peerId);
      if (iceEntry?.timer) clearTimeout(iceEntry.timer);
      iceBatchRef.current.delete(peerId);
      pendingRenegotiateRef.current.delete(peerId);
      pendingIceRestartRef.current.delete(peerId);

      const pc = pcsRef.current.get(peerId);
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.onsignalingstatechange = null;
        pc.close();
        pcsRef.current.delete(peerId);
      }
      pendingIceRef.current.delete(peerId);
      makingOfferRef.current.delete(peerId);
      lastOfferAtRef.current.delete(peerId);
      lastNeedOfferAtRef.current.delete(peerId);
      setPeerHealth(peerId, null);
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
    },
    [setPeerHealth],
  );

  const getOrCreatePeer = useCallback(
    (peerId: string): RTCPeerConnection => {
      const existing = pcsRef.current.get(peerId);
      if (existing && existing.connectionState !== 'closed') return existing;

      const pc = new RTCPeerConnection(iceConfigRef.current);
      pcsRef.current.set(peerId, pc);
      setPeerHealth(peerId, 'connecting');

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          queueIceCandidate(peerId, event.candidate.toJSON());
        }
      };

      pc.onsignalingstatechange = () => {
        if (pc.signalingState === 'stable' && pendingRenegotiateRef.current.has(peerId)) {
          pendingRenegotiateRef.current.delete(peerId);
          const restart = pendingIceRestartRef.current.has(peerId);
          pendingIceRestartRef.current.delete(peerId);
          setTimeout(() => void renegotiatePeerRef.current(peerId, restart), 50);
        }
      };

      pc.ontrack = (event) => {
        // Tune receiver jitter buffer dynamically (tight on HD, buffered on 3G to prevent choppy frames)
        const rx = event.receiver as RTCRtpReceiver & { playoutDelayHint?: number };
        if (rx && 'playoutDelayHint' in rx) {
          try {
            rx.playoutDelayHint = getPlayoutDelayForTier(activeTierRef.current);
          } catch {
            // Ignore unsupported hint
          }
        }
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
        for (const stale of bucket.getTracks()) {
          if (stale.kind === event.track.kind && stale.id !== event.track.id) {
            bucket.removeTrack(stale);
          }
        }
        if (!bucket.getTracks().some((t) => t.id === event.track.id)) {
          bucket.addTrack(event.track);
        }
        remoteCamStreamsRef.current[peerId] = bucket;
        const syncRemoteBucket = () => {
          const cur = remoteCamStreamsRef.current[peerId];
          if (!cur) return;
          setRemoteCamStreams((prev) => ({
            ...prev,
            [peerId]: new MediaStream(cur.getTracks()),
          }));
        };
        event.track.onunmute = syncRemoteBucket;
        event.track.onended = () => {
          const cur = remoteCamStreamsRef.current[peerId];
          if (cur) {
            cur.removeTrack(event.track);
          }
          syncRemoteBucket();
        };
        syncRemoteBucket();
      };

      const clearDiscTimer = () => {
        const t = disconnectTimersRef.current.get(peerId);
        if (t) {
          clearTimeout(t);
          disconnectTimersRef.current.delete(peerId);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          clearDiscTimer();
          setPeerHealth(peerId, 'connected');
        } else if (pc.iceConnectionState === 'failed') {
          clearDiscTimer();
          setPeerHealth(peerId, 'failed');
          void applyQualityTierToAllPeers('3g-ultra');
          void renegotiatePeerRef.current(peerId, true, true);
        } else if (pc.iceConnectionState === 'disconnected' && !disconnectTimersRef.current.has(peerId)) {
          setPeerHealth(peerId, 'reconnecting');
          // Immediately step down uplink bitrate so 3G radio queue drains and ICE keep-alives pass
          void applyQualityTierToAllPeers('3g-ultra');
          // Wait 3.5s for 3G cell handoff before triggering non-destructive soft ICE restart
          const timer = setTimeout(() => {
            disconnectTimersRef.current.delete(peerId);
            if (pc.iceConnectionState === 'disconnected') {
              void renegotiatePeerRef.current(peerId, true, false);
            } else if (pc.iceConnectionState === 'failed') {
              void renegotiatePeerRef.current(peerId, true, true);
            }
          }, 3500);
          disconnectTimersRef.current.set(peerId, timer);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          clearDiscTimer();
          setPeerHealth(peerId, 'connected');
        } else if (pc.connectionState === 'failed') {
          clearDiscTimer();
          setPeerHealth(peerId, 'failed');
          void renegotiatePeerRef.current(peerId, true, true);
        } else if (pc.connectionState === 'disconnected') {
          setPeerHealth(peerId, 'reconnecting');
        }
      };

      return pc;
    },
    [applyQualityTierToAllPeers, queueIceCandidate, setPeerHealth],
  );

  const renegotiatePeer = useCallback(
    async (peerId: string, iceRestart = false, forceResetIfStuck = false) => {
      let pc = pcsRef.current.get(peerId);
      if (!pc || pc.connectionState === 'closed') return;
      if (makingOfferRef.current.get(peerId) || pc.signalingState !== 'stable') {
        if (forceResetIfStuck) {
          makingOfferRef.current.set(peerId, false);
          try {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setLocalDescription({ type: 'rollback' });
            }
          } catch {
            // Fall back below if rollback is unsupported
          }
          if (pc.signalingState !== 'stable') {
            if (pc.iceConnectionState === 'failed' || pc.connectionState === 'failed') {
              closePeer(peerId);
              pc = getOrCreatePeer(peerId);
            } else {
              pendingRenegotiateRef.current.add(peerId);
              if (iceRestart) pendingIceRestartRef.current.add(peerId);
              return;
            }
          }
        } else {
          pendingRenegotiateRef.current.add(peerId);
          if (iceRestart) pendingIceRestartRef.current.add(peerId);
          return;
        }
      }
      pendingRenegotiateRef.current.delete(peerId);
      const shouldRestartIce = iceRestart || pendingIceRestartRef.current.has(peerId);
      pendingIceRestartRef.current.delete(peerId);
      try {
        makingOfferRef.current.set(peerId, true);
        await attachOutgoingTracks(pc, { createOfferSlots: true });
        const offer = await pc.createOffer(shouldRestartIce ? { iceRestart: true } : undefined);
        if (pc.signalingState !== 'stable') {
          pendingRenegotiateRef.current.add(peerId);
          if (shouldRestartIce) pendingIceRestartRef.current.add(peerId);
          return;
        }
        await pc.setLocalDescription({
          type: offer.type,
          sdp: enhanceSdpForResilience(offer.sdp),
        });
        if (pc.localDescription) {
          lastOfferAtRef.current.set(peerId, Date.now());
          const sent = await sendSignal(peerId, 'offer', {
            sdp: pc.localDescription.toJSON(),
            screenStreamId: screenStreamRef.current?.id ?? null,
            screenTrackId: screenStreamRef.current?.getVideoTracks()[0]?.id ?? null,
            screenAudioTrackId: screenStreamRef.current?.getAudioTracks()[0]?.id ?? null,
          });
          if (!sent) {
            pendingRenegotiateRef.current.add(peerId);
            if (shouldRestartIce) pendingIceRestartRef.current.add(peerId);
          }
        }
      } catch {
        pendingRenegotiateRef.current.add(peerId);
      } finally {
        makingOfferRef.current.set(peerId, false);
      }
    },
    [attachOutgoingTracks, closePeer, getOrCreatePeer, sendSignal],
  );
  renegotiatePeerRef.current = renegotiatePeer;

  // Sync peer connections & screen-share state whenever participants enter, share, or leave
  useEffect(() => {
    // In SFU mode, LiveKit TrackSubscribed / TrackUnsubscribed events manage remote streams directly;
    // do not let the slower 3G HTTP poll delete a live SFU screen-share stream before the poll catches up!
    if (sfuModeRef.current) return;
    const activeIds = new Set(room.participants.map((p) => p.userId));
    for (const stalePeerId of Object.keys(remoteScreenStreamsRef.current)) {
      const p = room.participants.find((item) => item.userId === stalePeerId);
      if (!p || !p.screenSharing) {
        delete remoteScreenStreamsRef.current[stalePeerId];
        delete remoteScreenStreamIdsRef.current[stalePeerId];
        delete remoteScreenTrackIdsRef.current[stalePeerId];
        delete remoteScreenAudioTrackIdsRef.current[stalePeerId];
        setRemoteScreenStreams((prev) => {
          if (!(stalePeerId in prev)) return prev;
          const next = { ...prev };
          delete next[stalePeerId];
          return next;
        });
      }
    }
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
        // Deterministic offerer avoids glare on initial join; stagger offers by 55ms in large 20-peer rooms
        if (currentUser.id.localeCompare(p.userId) < 0 && pc.signalingState === 'stable') {
          const peerIdx = Math.min(19, pcsRef.current.size);
          if (peerIdx <= 2) {
            void renegotiatePeer(p.userId);
          } else {
            setTimeout(() => {
              void renegotiatePeerRef.current(p.userId);
            }, (peerIdx - 2) * 55);
          }
        }
      }
    }
  }, [closePeer, currentUser.id, getOrCreatePeer, renegotiatePeer, room.participants, sendSignal]);

  // Poll meeting room state sequentially (zero overlapping polls on 3G; skip React updates when identical)
  useEffect(() => {
    let cancelled = false;
    const runRoomLoop = async () => {
      while (!cancelled) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        try {
          const fresh = await mGet<MeetingRow>('/room');
          if (cancelled) break;
          const sig = JSON.stringify([
            fresh.status,
            fresh.notes,
            (fresh.chatMessages ?? []).length,
            (fresh.participants ?? []).map((p) => [
              p.userId,
              p.fullName,
              p.role,
              p.joinedAt,
              p.micOn,
              p.camOn,
              p.screenSharing,
              p.screenStreamId,
              p.handRaised,
            ]),
          ]);
          if (sig !== roomSigRef.current) {
            roomSigRef.current = sig;
            setRoom(fresh);
            onMeetingUpdated?.(fresh);
          }
        } catch {
          // Retry on next tick
        }
        if (cancelled) break;
        const slowLink =
          activeTierRef.current === '3g-ultra' || activeTierRef.current === 'low-signal';
        await new Promise((r) => setTimeout(r, slowLink ? 2400 : 1600));
      }
    };
    void runRoomLoop();
    return () => {
      cancelled = true;
    };
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
        void mPatch('/participant', { micOn: false }).catch(() => undefined);
        showToast(`${String(payload.by ?? 'Host')} muted your microphone.`);
        return;
      }

      if (sig.type === 'host-ask-unmute') {
        playAlertChime();
        setAskUnmutePrompt({ by: String(payload.by ?? 'Host') });
        return;
      }

      if (sig.type === 'host-stop-video') {
        const vTrack = localStreamRef.current?.getVideoTracks()[0];
        if (vTrack) vTrack.enabled = false;
        setCamOn(false);
        camOnRef.current = false;
        void mPatch('/participant', { camOn: false }).catch(() => undefined);
        showToast(`${String(payload.by ?? 'Host')} turned off your camera.`);
        return;
      }

      if (sig.type === 'spotlight-updated') {
        const spotId = payload.spotlightUserId ? String(payload.spotlightUserId) : null;
        setRoom((prev) => ({ ...prev, spotlightUserId: spotId }));
        if (spotId) {
          setLayoutMode('speaker');
          showToast('Host spotlighted a speaker for everyone.');
        } else {
          showToast('Host removed Spotlight.');
        }
        return;
      }

      if (sig.type === 'hands-lowered') {
        setHandRaised(false);
        setRoom((prev) => ({
          ...prev,
          participants: prev.participants.map((p) => ({ ...p, handRaised: false })),
        }));
        showToast(`${String(payload.by ?? 'Host')} lowered all raised hands.`);
        return;
      }

      if (sig.type === 'participant-renamed') {
        const uid = String(payload.userId ?? '');
        const newName = String(payload.newName ?? '');
        if (uid && newName) {
          setRoom((prev) => ({
            ...prev,
            participants: prev.participants.map((p) =>
              p.userId === uid ? { ...p, fullName: newName } : p,
            ),
          }));
        }
        return;
      }

      if (sig.type === 'host-transferred') {
        const newHostId = String(payload.newHostId ?? '');
        const newHostName = String(payload.newHostName ?? '');
        setRoom((prev) => ({
          ...prev,
          organizerId: newHostId || prev.organizerId,
          organizerName: newHostName || prev.organizerName,
        }));
        showToast(
          newHostId === currentUser.id
            ? 'You are now the Meeting Host!'
            : `${newHostName} is now the Meeting Host.`,
        );
        return;
      }

      if (sig.type === 'security-updated') {
        setRoom((prev) => ({
          ...prev,
          isLocked: payload.isLocked !== undefined ? Boolean(payload.isLocked) : prev.isLocked,
          waitingRoomEnabled:
            payload.waitingRoomEnabled !== undefined
              ? Boolean(payload.waitingRoomEnabled)
              : prev.waitingRoomEnabled,
          muteUponEntry:
            payload.muteUponEntry !== undefined ? Boolean(payload.muteUponEntry) : prev.muteUponEntry,
          allowUnmuteSelf:
            payload.allowUnmuteSelf !== undefined ? Boolean(payload.allowUnmuteSelf) : prev.allowUnmuteSelf,
          allowStartVideo:
            payload.allowStartVideo !== undefined ? Boolean(payload.allowStartVideo) : prev.allowStartVideo,
          allowRenameSelf:
            payload.allowRenameSelf !== undefined ? Boolean(payload.allowRenameSelf) : prev.allowRenameSelf,
          chatPermission:
            (payload.chatPermission as MeetingRow['chatPermission']) ?? prev.chatPermission,
          screenShareMode:
            (payload.screenShareMode as MeetingRow['screenShareMode']) ?? prev.screenShareMode,
          suspendedActivities:
            payload.suspendedActivities !== undefined
              ? Boolean(payload.suspendedActivities)
              : prev.suspendedActivities,
        }));
        showToast('Host updated meeting security settings.');
        return;
      }

      if (sig.type === 'panic-suspended') {
        if (!canHostControl) {
          localStreamRef.current?.getAudioTracks().forEach((t) => {
            t.enabled = false;
          });
          localStreamRef.current?.getVideoTracks().forEach((t) => {
            t.enabled = false;
          });
          setMicOn(false);
          setCamOn(false);
          micOnRef.current = false;
          camOnRef.current = false;
        }
        setRoom((prev) => ({
          ...prev,
          isLocked: true,
          suspendedActivities: true,
          allowUnmuteSelf: false,
          allowStartVideo: false,
          chatPermission: 'DISABLED',
          screenShareMode: 'HOST_ONLY',
        }));
        showToast('Host suspended all participant activities.');
        return;
      }

      if (sig.type === 'recording-updated') {
        const activeRec = Boolean(payload.active);
        const byName = String(payload.by ?? 'Host');
        setRoom((prev) => ({
          ...prev,
          recordingActive: activeRec,
          recordingByName: activeRec ? byName : null,
        }));
        showToast(
          activeRec
            ? `${byName} started recording this meeting.`
            : `${byName} stopped recording.`,
        );
        return;
      }

      if (sig.type === 'polls-updated') {
        if (Array.isArray(payload.polls)) {
          setRoom((prev) => ({ ...prev, polls: payload.polls as MeetingRow['polls'] }));
          if (sideTabRef.current !== 'polls') {
            playAlertChime();
            showToast('A Live Poll was updated — open Polls & Q&A to vote.');
          }
        }
        return;
      }

      if (sig.type === 'qa-updated') {
        if (Array.isArray(payload.qaItems)) {
          setRoom((prev) => ({ ...prev, qaItems: payload.qaItems as MeetingRow['qaItems'] }));
        }
        return;
      }

      if (sig.type === 'breakout-updated') {
        if (Array.isArray(payload.breakoutRooms)) {
          const brs = payload.breakoutRooms as BreakoutRoomItem[];
          setRoom((prev) => ({ ...prev, breakoutRooms: brs }));
          if (payload.opened) {
            playAlertChime();
            const mine = brs.find((b) => b.participantIds.includes(currentUser.id));
            showToast(
              mine
                ? `Breakout Rooms opened! You are assigned to "${mine.name}".`
                : 'Host opened Breakout Rooms.',
            );
          }
        }
        return;
      }

      if (sig.type === 'breakout-broadcast') {
        const msg = String(payload.message ?? '');
        if (msg) {
          playAlertChime();
          showToast(`Host Broadcast: ${msg}`);
        }
        return;
      }

      if (sig.type === 'breakout-closed') {
        setActiveBreakoutId(null);
        setRoom((prev) => ({
          ...prev,
          breakoutRooms: (prev.breakoutRooms ?? []).map((b) => ({ ...b, active: false })),
        }));
        showToast('Breakout rooms closed — returned to main session.');
        return;
      }

      if (sig.type === 'whiteboard-stroke') {
        const stroke = payload.stroke as WhiteboardStroke | undefined;
        if (stroke && stroke.id) {
          setWhiteboardStrokes((prev) =>
            prev.some((s) => s.id === stroke.id) ? prev : [...prev.slice(-400), stroke],
          );
        }
        return;
      }

      if (sig.type === 'whiteboard-undo') {
        setWhiteboardStrokes((prev) => prev.slice(0, -1));
        return;
      }

      if (sig.type === 'whiteboard-clear') {
        setWhiteboardStrokes([]);
        return;
      }

      if (sig.type === 'live-caption') {
        const text = String(payload.text ?? '').trim();
        const speaker = String(payload.speaker ?? sig.fromUserName ?? 'Speaker');
        if (text) {
          const capId = `cap_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
          setLiveCaptions((prev) => [...prev.slice(-2), { id: capId, speaker, text }]);
          setTimeout(() => {
            setLiveCaptions((prev) => prev.filter((c) => c.id !== capId));
          }, 6000);
        }
        return;
      }

      if (sig.type === 'request-screenshare') {
        const reqUserId = String(payload.userId ?? fromId);
        const reqName = String(payload.fullName ?? sig.fromUserName ?? 'Participant');
        setShareRequests((prev) =>
          prev.some((r) => r.userId === reqUserId) ? prev : [...prev, { userId: reqUserId, fullName: reqName }],
        );
        if (canHostControl) {
          playAlertChime();
          showDesktopNotification('Screen Share Request', `${reqName} wants to share their screen.`);
          showToast(`${reqName} requested screen-share access.`);
        }
        return;
      }

      if (sig.type === 'screenshare-approved') {
        if (String(payload.targetUserId ?? '') === currentUser.id) {
          setRoom((prev) => ({
            ...prev,
            screenShareApprovedIds: Array.from(
              new Set([...(prev.screenShareApprovedIds ?? []), currentUser.id]),
            ),
          }));
          showToast('Host approved your screen-share access! Click Share Screen to present.');
        }
        return;
      }

      if (sig.type === 'waiting-room-updated') {
        const wName = String(payload.fullName ?? sig.fromUserName ?? 'Participant');
        if (canHostControl) {
          playAlertChime();
          showDesktopNotification('Waiting Room', `${wName} is waiting to join the meeting.`);
          showToast(`${wName} is in the Waiting Room.`);
          void mGet<MeetingRow>('/room')
            .then((fresh) => setRoom((prev) => ({ ...prev, waitingRoom: fresh.waitingRoom })))
            .catch(() => undefined);
        }
        return;
      }

      if (sig.type === 'host-removed') {
        const removedId = String(payload.targetUserId ?? sig.toUserId ?? '');
        if (removedId === currentUser.id) {
          showToast('Host moved you to the Waiting Room.');
          localStreamRef.current?.getTracks().forEach((t) => t.stop());
          screenStreamRef.current?.getTracks().forEach((t) => t.stop());
          pcsRef.current.forEach((pc) => pc.close());
          pcsRef.current.clear();
          if (sfuRoomRef.current) {
            void sfuRoomRef.current.disconnect().catch(() => undefined);
            sfuRoomRef.current = null;
          }
          if (onMovedToWaitingRoom) {
            onMovedToWaitingRoom(room);
          } else {
            void leaveCall(false);
          }
        } else {
          closePeer(removedId);
        }
        return;
      }

      if (sig.type === 'cohost-updated') {
        const nextCoHosts = Array.isArray(payload.coHostIds)
          ? payload.coHostIds.map(String)
          : [];
        setRoom((prev) => ({ ...prev, coHostIds: nextCoHosts }));
        if (String(payload.targetUserId ?? '') === currentUser.id) {
          showToast(
            nextCoHosts.includes(currentUser.id)
              ? 'You have been assigned as a Co-Host.'
              : 'Your Co-Host role was removed.',
          );
        }
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

      if (sig.type === 'peer-joined') {
        const joinedId = String(payload.userId ?? fromId);
        if (joinedId === currentUser.id) return;
        const joinedAt = typeof payload.joinedAt === 'string' ? payload.joinedAt : '';
        const prevJoinedAt = peerJoinedAtRef.current.get(joinedId);
        if (joinedAt && prevJoinedAt && prevJoinedAt !== joinedAt) {
          peerJoinedAtRef.current.set(joinedId, joinedAt);
          peerFirstSeenAtRef.current.set(joinedId, Date.now());
          closePeer(joinedId);
        } else if (joinedAt && !prevJoinedAt) {
          peerJoinedAtRef.current.set(joinedId, joinedAt);
          peerFirstSeenAtRef.current.set(joinedId, Date.now());
        }
        const pc = getOrCreatePeer(joinedId);
        if (currentUser.id.localeCompare(joinedId) < 0 && pc.signalingState === 'stable') {
          void renegotiatePeerRef.current(joinedId);
        }
        return;
      }

      if (sig.type === 'need-offer') {
        const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
        const wantsReset = Boolean(payload.reset);
        if (wantsReset && sessionId && !seenNeedOfferSessionsRef.current.has(sessionId)) {
          seenNeedOfferSessionsRef.current.add(sessionId);
          if (seenNeedOfferSessionsRef.current.size > 100) {
            seenNeedOfferSessionsRef.current.clear();
          }
          closePeer(fromId);
          getOrCreatePeer(fromId);
          void renegotiatePeerRef.current(fromId, false, true);
          return;
        }
        if (currentUser.id.localeCompare(fromId) < 0 || pcsRef.current.get(fromId)?.currentRemoteDescription) {
          void renegotiatePeerRef.current(fromId, false, true);
        }
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
          // Ensure outgoing tracks are attached onto negotiated m-lines before creating answer
          await attachOutgoingTracks(pc, { createOfferSlots: false });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription({
            type: answer.type,
            sdp: enhanceSdpForResilience(answer.sdp),
          });
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

    handleDataSignalRef.current = (sig) => {
      void handleSignal(sig);
    };

    const runLoop = async () => {
      let hadError = false;
      while (!cancelled) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          setReconnecting(true);
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        try {
          const res = await mGet<{ seq: number; signals: MeetingSignalItem[] }>(
            `/signals?after=${lastSignalSeqRef.current}`,
          );
          if (hadError) setReconnecting(false);
          hadError = false;
          if (cancelled) break;
          if (typeof res.seq === 'number' && res.seq > lastSignalSeqRef.current) {
            lastSignalSeqRef.current = res.seq;
          }
          for (const sig of res.signals ?? []) {
            if (cancelled) break;
            await handleSignal(sig);
          }
        } catch {
          hadError = true;
        }
        if (cancelled) break;
        // Fast 250ms cadence while peers are connecting/renegotiating or screen sharing; 600ms steady-state
        const hasPendingPeers =
          (participantsRef.current.length > 1 && pcsRef.current.size === 0) ||
          Array.from(pcsRef.current.values()).some(
            (pc) =>
              pc.connectionState !== 'closed' &&
              pc.iceConnectionState !== 'connected' &&
              pc.iceConnectionState !== 'completed',
          );
        const cadenceMs = hadError
          ? 1200
          : hasPendingPeers || Boolean(screenStreamRef.current)
            ? 250
            : 600;
        await new Promise((r) => setTimeout(r, cadenceMs));
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

  // Persistent single AudioContext active speaker detector across up to 20+ local & remote streams
  const speakerCtxRef = useRef<AudioContext | null>(null);
  const speakerAnalysersRef = useRef<
    Map<string, { trackId: string; analyser: AnalyserNode; source: MediaStreamAudioSourceNode }>
  >(new Map());

  useEffect(() => {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return;
    if (!speakerCtxRef.current || speakerCtxRef.current.state === 'closed') {
      try {
        speakerCtxRef.current = new window.AudioContext({ latencyHint: 'interactive' });
      } catch {
        return;
      }
    }
    const ctx = speakerCtxRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }

    const activeAnalysers = speakerAnalysersRef.current;
    const wantedStreams = new Map<string, MediaStream>();
    if (micOn && localStream && localStream.getAudioTracks().length > 0) {
      wantedStreams.set(currentUser.id, localStream);
    }
    for (const [uid, s] of Object.entries(remoteCamStreams)) {
      if (s && s.getAudioTracks().length > 0) {
        wantedStreams.set(uid, s);
      }
    }

    // Remove disconnected or replaced streams
    for (const [uid, entry] of Array.from(activeAnalysers.entries())) {
      const currentStream = wantedStreams.get(uid);
      const currentTrackId = currentStream?.getAudioTracks()[0]?.id ?? '';
      if (!currentStream || currentTrackId !== entry.trackId) {
        try {
          entry.source.disconnect();
        } catch {
          // Ignore
        }
        activeAnalysers.delete(uid);
      }
    }

    // Incrementally bind new streams onto the shared AudioContext
    for (const [uid, stream] of wantedStreams.entries()) {
      if (activeAnalysers.has(uid)) continue;
      const trackId = stream.getAudioTracks()[0]?.id ?? '';
      if (!trackId) continue;
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        activeAnalysers.set(uid, { trackId, analyser, source });
      } catch {
        // Ignore stream without active audio
      }
    }
  }, [currentUser.id, localStream, micOn, remoteCamStreams]);

  useEffect(() => {
    const buf = new Uint8Array(64);
    const interval = setInterval(() => {
      const ctx = speakerCtxRef.current;
      if (ctx?.state === 'suspended') {
        void ctx.resume().catch(() => undefined);
      }
      const analysers = speakerAnalysersRef.current;
      const next: Record<string, boolean> = {};
      let changed = false;
      const prev = speakingRef.current;
      for (const [uid, { analyser }] of analysers.entries()) {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) sum += buf[i] ?? 0;
        const speaking = sum / buf.length > 14;
        next[uid] = speaking;
        if (Boolean(prev[uid]) !== speaking) {
          changed = true;
        }
      }
      if (!changed) {
        for (const k of Object.keys(prev)) {
          if (prev[k] && !(k in next)) {
            changed = true;
            break;
          }
        }
      }
      if (changed) {
        speakingRef.current = next;
        setSpeakingUsers(next);
      }
    }, 280);

    return () => {
      clearInterval(interval);
      speakerAnalysersRef.current.forEach(({ source }) => {
        try {
          source.disconnect();
        } catch {
          // Ignore
        }
      });
      speakerAnalysersRef.current.clear();
      void speakerCtxRef.current?.close().catch(() => undefined);
      speakerCtxRef.current = null;
    };
  }, []);

  // Silent background WebRTC network adaptation & auto-reconnect on 3G/weak/dropped connections
  useEffect(() => {
    const navConn = (
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & {
            connection?: {
              effectiveType?: string;
              saveData?: boolean;
              downlink?: number;
              rtt?: number;
              addEventListener?: (type: string, cb: () => void) => void;
              removeEventListener?: (type: string, cb: () => void) => void;
            };
          }).connection
        : undefined
    );

    const handleConnectionChange = () => {
      const detected = detectInitialQualityTier();
      if (detected === '3g-ultra' || detected === 'low-signal') {
        void applyQualityTierToAllPeers(detected);
      }
    };

    const handleOnline = () => {
      showToast('Connection restored — syncing live video & audio...');
      void applyQualityTierToAllPeers(detectInitialQualityTier());
      for (const peerId of Array.from(pcsRef.current.keys())) {
        void renegotiatePeer(peerId, true, false);
      }
    };
    const handleOffline = () => {
      void applyQualityTierToAllPeers('3g-ultra');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    navConn?.addEventListener?.('change', handleConnectionChange);

    const checkStats = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (activeTierRef.current !== '3g-ultra') {
          await applyQualityTierToAllPeers('3g-ultra');
        }
        return;
      }

      let maxRtt = 0;
      let maxLoss = 0;
      let anyDisconnected = false;

      for (const pc of pcsRef.current.values()) {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
          anyDisconnected = true;
        }
        try {
          const report = await pc.getStats();
          report.forEach((stat) => {
            if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
              if (typeof stat.currentRoundTripTime === 'number') {
                maxRtt = Math.max(maxRtt, stat.currentRoundTripTime);
              }
            }
            if (stat.type === 'remote-inbound-rtp') {
              if (typeof stat.roundTripTime === 'number') {
                maxRtt = Math.max(maxRtt, stat.roundTripTime);
              }
              if (typeof stat.fractionLost === 'number') {
                maxLoss = Math.max(maxLoss, stat.fractionLost);
              }
            }
          });
        } catch {
          // Ignore stats error on closing peer
        }
      }

      const baseline = detectInitialQualityTier();
      let targetTier: QualityTier = baseline;
      if (anyDisconnected || maxRtt > 0.65 || maxLoss > 0.12 || baseline === '3g-ultra') {
        targetTier = '3g-ultra';
      } else if (maxRtt > 0.38 || maxLoss > 0.06 || baseline === 'low-signal') {
        targetTier = 'low-signal';
      } else if (maxRtt > 0.22 || maxLoss > 0.025) {
        targetTier = 'balanced';
      }

      if (targetTier !== activeTierRef.current) {
        await applyQualityTierToAllPeers(targetTier);
      }
    };

    const timer = setInterval(() => void checkStats(), 2500);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navConn?.removeEventListener?.('change', handleConnectionChange);
    };
  }, [applyQualityTierToAllPeers, renegotiatePeer, showToast]);

  const peerJoinedAtRef = useRef<Map<string, string>>(new Map());
  const peerFirstSeenAtRef = useRef<Map<string, number>>(new Map());

  // Sync a single camera/mic track into an RTCPeerConnection, upgrading any baseline recvonly transceiver.
  // Returns true when SDP renegotiation is needed (new track added or transceiver direction not yet sendrecv/sendonly).
  const syncLocalTrackToPeer = useCallback(
    async (
      pc: RTCPeerConnection,
      kind: 'audio' | 'video',
      newTrack: MediaStreamTrack,
      baseStream: MediaStream,
      scrTrackIds: Set<string>,
      allowAdd = true,
    ): Promise<boolean> => {
      const transceiver = pickPreferredTransceiver(pc, kind, scrTrackIds);
      if (transceiver) {
        const prevTrackId = transceiver.sender.track?.id ?? null;
        if (prevTrackId !== newTrack.id) {
          await transceiver.sender.replaceTrack(newTrack).catch(() => undefined);
        }
        if (transceiver.direction !== 'sendrecv') {
          transceiver.direction = 'sendrecv';
        }
        void tuneSenderQuality(
          transceiver.sender,
          kind === 'video' ? 'cam-video' : 'mic-audio',
          activeTierRef.current,
          Math.max(1, pcsRef.current.size),
        );
        const negotiated =
          transceiver.currentDirection === 'sendrecv' || transceiver.currentDirection === 'sendonly';
        return !negotiated || !prevTrackId;
      }

      if (!allowAdd) {
        return false;
      }
      const added = pc.addTrack(newTrack, baseStream);
      void tuneSenderQuality(
        added,
        kind === 'video' ? 'cam-video' : 'mic-audio',
        activeTierRef.current,
        Math.max(1, pcsRef.current.size),
      );
      return true;
    },
    [],
  );

  // Sync newly captured localStream tracks across SFU & peers created before getUserMedia resolved
  useEffect(() => {
    if (!localStream) return;
    if (sfuRoomRef.current?.state === 'connected') {
      void syncSfuLocalTracks();
    }
    if (pcsRef.current.size === 0) return;
    let cancelled = false;
    const scrTrackIds = new Set(screenStreamRef.current?.getTracks().map((t) => t.id) ?? []);

    const syncAll = async () => {
      for (const [peerId, pc] of Array.from(pcsRef.current.entries())) {
        if (cancelled) return;
        const canAddOrOffer =
          currentUser.id.localeCompare(peerId) < 0 || pc.remoteDescription !== null;
        if (!canAddOrOffer) {
          // Callee waits for incoming offer so local tracks bind onto negotiated mid='0'/'1' m-lines
          continue;
        }
        let needsReneg = false;
        const audioTrack = localStream.getAudioTracks().find((t) => t.readyState === 'live');
        const videoTrack = localStream.getVideoTracks().find((t) => t.readyState === 'live');
        if (audioTrack) {
          if (await syncLocalTrackToPeer(pc, 'audio', audioTrack, localStream, scrTrackIds, true)) {
            needsReneg = true;
          }
        }
        if (videoTrack) {
          if (await syncLocalTrackToPeer(pc, 'video', videoTrack, localStream, scrTrackIds, true)) {
            needsReneg = true;
          }
        }
        if (needsReneg && !cancelled) {
          void renegotiatePeer(peerId);
        }
      }
    };

    void syncAll();
    return () => {
      cancelled = true;
    };
  }, [currentUser.id, localStream, renegotiatePeer, syncLocalTrackToPeer]);

  // Detect rejoined peers (page refresh / F5 via updated joinedAt) & heal stalled handshakes
  useEffect(() => {
    const activeIds = new Set<string>();
    for (const p of room.participants) {
      if (p.userId === currentUser.id) continue;
      activeIds.add(p.userId);
      const prevJoinedAt = peerJoinedAtRef.current.get(p.userId);
      if (prevJoinedAt && prevJoinedAt !== p.joinedAt) {
        // Peer reloaded or rejoined without graceful peer-left; reset stale RTCPeerConnection
        peerJoinedAtRef.current.set(p.userId, p.joinedAt);
        peerFirstSeenAtRef.current.set(p.userId, Date.now());
        closePeer(p.userId);
        const pc = getOrCreatePeer(p.userId);
        if (currentUser.id.localeCompare(p.userId) < 0 && pc.signalingState === 'stable') {
          void renegotiatePeer(p.userId);
        }
      } else {
        peerJoinedAtRef.current.set(p.userId, p.joinedAt);
        if (!peerFirstSeenAtRef.current.has(p.userId)) {
          peerFirstSeenAtRef.current.set(p.userId, Date.now());
        }
      }
    }
    for (const key of Array.from(peerJoinedAtRef.current.keys())) {
      if (!activeIds.has(key)) {
        peerJoinedAtRef.current.delete(key);
        peerFirstSeenAtRef.current.delete(key);
      }
    }
  }, [closePeer, currentUser.id, getOrCreatePeer, renegotiatePeer, room.participants]);

  useEffect(() => {
    let active = true;
    const healPeers = async () => {
      if (!active || sfuModeRef.current) return;
      const now = Date.now();
      for (const p of room.participants) {
        if (!active || p.userId === currentUser.id) continue;
        const pc = pcsRef.current.get(p.userId);
        if (!pc) {
          const fresh = getOrCreatePeer(p.userId);
          if (currentUser.id.localeCompare(p.userId) < 0 && fresh.signalingState === 'stable') {
            void renegotiatePeer(p.userId);
          }
          continue;
        }

        if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') {
          setPeerHealth(p.userId, 'failed');
          void renegotiatePeer(p.userId, true, true);
          continue;
        }

        const isOfferer = currentUser.id.localeCompare(p.userId) < 0;
        const canNegotiate = isOfferer || pc.remoteDescription !== null;

        // Heal any peer where local video/audio captured late or transceiver was not negotiated as sendrecv
        const curLocal = localStreamRef.current;
        if (curLocal && canNegotiate && pc.signalingState === 'stable') {
          const scrIds = new Set(screenStreamRef.current?.getTracks().map((t) => t.id) ?? []);
          const vTrack = curLocal.getVideoTracks().find((t) => t.readyState === 'live');
          const aTrack = curLocal.getAudioTracks().find((t) => t.readyState === 'live');
          let needSync = false;
          if (vTrack) {
            const vt = pickPreferredTransceiver(pc, 'video', scrIds);
            const vtNegotiated =
              vt?.currentDirection === 'sendrecv' || vt?.currentDirection === 'sendonly';
            if (!vt || vt.sender.track?.id !== vTrack.id || !vtNegotiated) {
              needSync = await syncLocalTrackToPeer(pc, 'video', vTrack, curLocal, scrIds, true);
            }
          }
          if (aTrack) {
            const at = pickPreferredTransceiver(pc, 'audio', scrIds);
            const atNegotiated =
              at?.currentDirection === 'sendrecv' || at?.currentDirection === 'sendonly';
            if (!at || at.sender.track?.id !== aTrack.id || !atNegotiated) {
              if (await syncLocalTrackToPeer(pc, 'audio', aTrack, curLocal, scrIds, true)) {
                needSync = true;
              }
            }
          }
          if (needSync) {
            void renegotiatePeer(p.userId);
            continue;
          }
        }

        const firstSeen = peerFirstSeenAtRef.current.get(p.userId) ?? now;
        const ageMs = now - firstSeen;
        const lastOfferAt = lastOfferAtRef.current.get(p.userId) ?? 0;
        const lastNeedOfferAt = lastNeedOfferAtRef.current.get(p.userId) ?? 0;
        const crowdGraceMs = Math.min(8_000, pcsRef.current.size * 350);
        const offerTimeoutMs = 5500 + crowdGraceMs;

        if (!pc.currentRemoteDescription) {
          if (isOfferer) {
            if (ageMs > 2400 + Math.min(3000, pcsRef.current.size * 120) && pc.signalingState === 'stable') {
              void renegotiatePeer(p.userId);
            } else if (
              pc.signalingState !== 'stable' &&
              lastOfferAt > 0 &&
              now - lastOfferAt > offerTimeoutMs
            ) {
              // Break have-local-offer deadlock if offer was lost or collided
              peerFirstSeenAtRef.current.set(p.userId, now);
              void renegotiatePeer(p.userId, true, true);
            }
          } else if (ageMs > 2400 + Math.min(3500, pcsRef.current.size * 150) && now - lastNeedOfferAt > 3500) {
            // Callee stuck without an offer (e.g. post-reload): ask peer to send fresh offer
            lastNeedOfferAtRef.current.set(p.userId, now);
            void sendSignal(p.userId, 'need-offer', {
              reset: true,
              sessionId: `${localSessionIdRef.current}_${Math.floor(now / 6000)}`,
            });
          }
          continue;
        }

        // Break any post-connection stalled renegotiation offer stuck beyond crowd-scaled timeout
        if (pc.signalingState !== 'stable' && lastOfferAt > 0 && now - lastOfferAt > offerTimeoutMs) {
          void renegotiatePeer(p.userId, false, true);
          continue;
        }

        // If peer's camera is marked ON while ICE is connected yet remote video never arrived, nudge peer to resync
        const hasRemoteCam = Boolean(
          remoteCamStreamsRef.current[p.userId]
            ?.getVideoTracks()
            .some((t) => t.readyState === 'live'),
        );
        if (
          p.camOn &&
          !hasRemoteCam &&
          (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') &&
          ageMs > 3500 &&
          now - lastNeedOfferAt > 5000
        ) {
          lastNeedOfferAtRef.current.set(p.userId, now);
          void sendSignal(p.userId, 'need-offer', { reset: false });
        }
      }
    };
    const initialHealTimer = setTimeout(() => void healPeers(), 1400);
    const healInterval = setInterval(() => void healPeers(), 2500);
    return () => {
      active = false;
      clearTimeout(initialHealTimer);
      clearInterval(healInterval);
    };
  }, [currentUser.id, getOrCreatePeer, renegotiatePeer, room.participants, sendSignal, setPeerHealth, syncLocalTrackToPeer]);

  const handleRetryPeerConnection = useCallback(
    (peerId: string) => {
      closePeer(peerId);
      peerFirstSeenAtRef.current.set(peerId, Date.now());
      getOrCreatePeer(peerId);
      if (currentUser.id.localeCompare(peerId) < 0) {
        void renegotiatePeer(peerId, true, true);
      } else {
        void sendSignal(peerId, 'need-offer', {
          reset: true,
          sessionId: `${localSessionIdRef.current}_${Date.now()}`,
        });
      }
      showToast('Reconnecting video & audio...');
    },
    [closePeer, currentUser.id, getOrCreatePeer, renegotiatePeer, sendSignal, showToast],
  );

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
      if (sfuRoomRef.current?.state === 'connected') {
        await syncSfuLocalTracks();
      }

      const renegotiateIds: string[] = [];
      const scrTrackIds = new Set(screenStreamRef.current?.getTracks().map((t) => t.id) ?? []);
      for (const [peerId, pc] of pcsRef.current.entries()) {
        const canAdd = currentUser.id.localeCompare(peerId) < 0 || pc.remoteDescription !== null;
        if (await syncLocalTrackToPeer(pc, kind, newTrack, base, scrTrackIds, canAdd)) {
          renegotiateIds.push(peerId);
        }
      }
      if (renegotiateIds.length > 0) {
        await Promise.all(renegotiateIds.map((id) => renegotiatePeer(id)));
      }
    },
    [commitLocalStream, currentUser.id, renegotiatePeer, syncLocalTrackToPeer],
  );

  const micBusyRef = useRef(false);
  const camBusyRef = useRef(false);

  const toggleMic = async () => {
    if (micBusyRef.current) return;
    const next = !micOn;
    if (next && !canHostControl && (room.suspendedActivities || room.allowUnmuteSelf === false)) {
      showToast('Host has disabled unmuting yourself.');
      return;
    }
    micBusyRef.current = true;
    // Update ref & UI state BEFORE syncSfuLocalTracks so SFU never mutes the newly captured track!
    micOnRef.current = next;
    setMicOn(next);
    setRoom((prev) => ({
      ...prev,
      participants: prev.participants.map((p) =>
        p.userId === currentUser.id ? { ...p, micOn: next } : p,
      ),
    }));
    try {
      if (next) {
        let track = localStreamRef.current?.getAudioTracks().find((t) => t.readyState === 'live');
        if (!track) {
          try {
            let captured: MediaStream;
            try {
              captured = await navigator.mediaDevices.getUserMedia({
                audio: {
                  deviceId: selectedMicId ? { exact: selectedMicId } : undefined,
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                },
              });
            } catch {
              // Fallback to default microphone if saved deviceId is unavailable
              captured = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            track = captured.getAudioTracks()[0];
            if (track) {
              track.enabled = true;
              setSelectedMicId(track.getSettings().deviceId ?? '');
              await replaceOrAddLocalTrack('audio', track);
              await refreshDevices();
            }
          } catch {
            micOnRef.current = false;
            setMicOn(false);
            setRoom((prev) => ({
              ...prev,
              participants: prev.participants.map((p) =>
                p.userId === currentUser.id ? { ...p, micOn: false } : p,
              ),
            }));
            showToast('Could not access microphone. Check browser permissions.');
            return;
          }
        } else {
          track.enabled = true;
          const base = localStreamRef.current;
          if (base) {
            commitLocalStream(base);
            const scrTrackIds = new Set(screenStreamRef.current?.getTracks().map((t) => t.id) ?? []);
            for (const [peerId, pc] of pcsRef.current.entries()) {
              const canAdd = currentUser.id.localeCompare(peerId) < 0 || pc.remoteDescription !== null;
              if (await syncLocalTrackToPeer(pc, 'audio', track, base, scrTrackIds, canAdd)) {
                void renegotiatePeer(peerId);
              }
            }
          }
        }
        if (sfuRoomRef.current?.state === 'connected') {
          await syncSfuLocalTracks();
          const micPub = sfuRoomRef.current.localParticipant.getTrackPublication(Track.Source.Microphone);
          if (micPub?.isMuted) await micPub.unmute().catch(() => undefined);
        }
      } else {
        localStreamRef.current?.getAudioTracks().forEach((t) => {
          t.enabled = false;
        });
        if (sfuRoomRef.current?.state === 'connected') {
          const micPub = sfuRoomRef.current.localParticipant.getTrackPublication(Track.Source.Microphone);
          if (micPub && !micPub.isMuted) await micPub.mute().catch(() => undefined);
        }
      }

      try {
        const updated = await mPatch<MeetingRow>('/participant', { micOn: next });
        setRoom(updated);
      } catch (err) {
        if (next) {
          localStreamRef.current?.getAudioTracks().forEach((t) => {
            t.enabled = false;
          });
          if (sfuRoomRef.current?.state === 'connected') {
            const micPub = sfuRoomRef.current.localParticipant.getTrackPublication(Track.Source.Microphone);
            if (micPub && !micPub.isMuted) await micPub.mute().catch(() => undefined);
          }
          micOnRef.current = false;
          setMicOn(false);
          setRoom((prev) => ({
            ...prev,
            participants: prev.participants.map((p) =>
              p.userId === currentUser.id ? { ...p, micOn: false } : p,
            ),
          }));
          showToast(err instanceof Error ? err.message : 'Host has disabled unmuting yourself.');
        }
      }
    } finally {
      micBusyRef.current = false;
    }
  };

  const toggleCam = async () => {
    if (camBusyRef.current) return;
    const next = !camOn;
    if (next && !canHostControl && (room.suspendedActivities || room.allowStartVideo === false)) {
      showToast('Host has disabled starting video.');
      return;
    }
    camBusyRef.current = true;
    // Update ref & UI state BEFORE syncSfuLocalTracks so SFU never mutes the newly captured camera!
    camOnRef.current = next;
    setCamOn(next);
    setRoom((prev) => ({
      ...prev,
      participants: prev.participants.map((p) =>
        p.userId === currentUser.id ? { ...p, camOn: next } : p,
      ),
    }));
    try {
      if (next) {
        let track = localStreamRef.current?.getVideoTracks().find((t) => t.readyState === 'live');
        if (!track) {
          try {
            let captured: MediaStream;
            const slowLink =
              activeTierRef.current === '3g-ultra' || activeTierRef.current === 'low-signal';
            try {
              captured = await navigator.mediaDevices.getUserMedia({
                video: {
                  deviceId: selectedCamId ? { exact: selectedCamId } : undefined,
                  width: { ideal: slowLink ? 640 : 1280 },
                  height: { ideal: slowLink ? 360 : 720 },
                  frameRate: { ideal: slowLink ? 15 : 24 },
                },
              });
            } catch {
              try {
                captured = await navigator.mediaDevices.getUserMedia({
                  video: {
                    width: { ideal: 640 },
                    height: { ideal: 360 },
                    frameRate: { ideal: 15 },
                  },
                });
              } catch {
                // Final unconstrained fallback for any webcam
                captured = await navigator.mediaDevices.getUserMedia({ video: true });
              }
            }
            track = captured.getVideoTracks()[0];
            if (track) {
              track.contentHint = 'motion';
              track.enabled = true;
              setSelectedCamId(track.getSettings().deviceId ?? '');
              await replaceOrAddLocalTrack('video', track);
              await refreshDevices();
            }
          } catch {
            camOnRef.current = false;
            setCamOn(false);
            setRoom((prev) => ({
              ...prev,
              participants: prev.participants.map((p) =>
                p.userId === currentUser.id ? { ...p, camOn: false } : p,
              ),
            }));
            showToast('Could not access camera. Another app may be using it or permission is blocked.');
            return;
          }
        } else {
          track.enabled = true;
          const base = localStreamRef.current;
          if (base) {
            commitLocalStream(base);
            const scrTrackIds = new Set(screenStreamRef.current?.getTracks().map((t) => t.id) ?? []);
            for (const [peerId, pc] of pcsRef.current.entries()) {
              const canAdd = currentUser.id.localeCompare(peerId) < 0 || pc.remoteDescription !== null;
              if (await syncLocalTrackToPeer(pc, 'video', track, base, scrTrackIds, canAdd)) {
                void renegotiatePeer(peerId);
              }
            }
          }
        }
        if (sfuRoomRef.current?.state === 'connected') {
          await syncSfuLocalTracks();
          const camPub = sfuRoomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
          if (camPub?.isMuted) await camPub.unmute().catch(() => undefined);
        }
      } else {
        localStreamRef.current?.getVideoTracks().forEach((t) => {
          t.enabled = false;
        });
        if (localStreamRef.current) {
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        }
        if (sfuRoomRef.current?.state === 'connected') {
          const camPub = sfuRoomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
          if (camPub && !camPub.isMuted) await camPub.mute().catch(() => undefined);
        }
      }

      try {
        const updated = await mPatch<MeetingRow>('/participant', { camOn: next });
        setRoom(updated);
      } catch (err) {
        if (next) {
          localStreamRef.current?.getVideoTracks().forEach((t) => {
            t.enabled = false;
          });
          if (sfuRoomRef.current?.state === 'connected') {
            const camPub = sfuRoomRef.current.localParticipant.getTrackPublication(Track.Source.Camera);
            if (camPub && !camPub.isMuted) await camPub.mute().catch(() => undefined);
          }
          camOnRef.current = false;
          setCamOn(false);
          setRoom((prev) => ({
            ...prev,
            participants: prev.participants.map((p) =>
              p.userId === currentUser.id ? { ...p, camOn: false } : p,
            ),
          }));
          showToast(err instanceof Error ? err.message : 'Host has disabled starting video.');
        }
      }
    } finally {
      camBusyRef.current = false;
    }
  };

  const switchDevice = async (
    kind: 'audio' | 'video',
    deviceId: string,
    profileOverride?: AudioProfileSettings,
  ) => {
    setDeviceMenu(null);
    const prof = profileOverride ?? audioProfile;
    try {
      const captured = await navigator.mediaDevices.getUserMedia(
        kind === 'audio'
          ? {
              audio: {
                ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
                echoCancellation: prof.originalSound ? false : prof.echoCancellation,
                noiseSuppression: prof.originalSound ? false : prof.noiseSuppression,
                autoGainControl: prof.originalSound ? false : prof.autoGainControl,
                sampleRate: 48000,
              },
            }
          : {
              video: {
                ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 },
              },
            },
      );
      const track = kind === 'audio' ? captured.getAudioTracks()[0] : captured.getVideoTracks()[0];
      if (!track) return;
      if (kind === 'audio') {
        if (deviceId) setSelectedMicId(deviceId);
        track.enabled = micOnRef.current;
      } else {
        track.contentHint = 'motion';
        if (deviceId) setSelectedCamId(deviceId);
        track.enabled = camOnRef.current;
      }
      await replaceOrAddLocalTrack(kind, track);
    } catch {
      showToast(`Failed to switch ${kind === 'audio' ? 'microphone' : 'camera'}.`);
    }
  };

  const updateAudioProfile = async (patchProfile: Partial<AudioProfileSettings>) => {
    const next = { ...audioProfile, ...patchProfile };
    setAudioProfile(next);
    if (localStreamRef.current?.getAudioTracks().length) {
      await switchDevice('audio', selectedMicId, next);
    }
    showToast(
      next.originalSound
        ? 'Original Sound ON (raw high-fidelity audio).'
        : 'Audio profile updated.',
    );
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
        mPatch<MeetingRow>('/participant', {
          screenSharing: false,
          screenStreamId: null,
        })
          .then((updated) => setRoom(updated))
          .catch(() => undefined),
      ]);
      const peerRenegotiations: Promise<void>[] = [];
      for (const [peerId, pc] of pcsRef.current.entries()) {
        for (const sender of pc.getSenders()) {
          if (sender.track && tracks.some((t) => t.id === sender.track?.id)) {
            try {
              pc.removeTrack(sender);
            } catch {
              // Ignore closed peer sender removal
            }
          }
        }
        peerRenegotiations.push(renegotiatePeer(peerId));
      }
      await Promise.all(peerRenegotiations);
      const lkRoom = sfuRoomRef.current;
      if (lkRoom && lkRoom.state === 'connected') {
        const scrPub = lkRoom.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        if (scrPub?.track) await lkRoom.localParticipant.unpublishTrack(scrPub.track).catch(() => undefined);
        const scrAudioPub = lkRoom.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
        if (scrAudioPub?.track) await lkRoom.localParticipant.unpublishTrack(scrAudioPub.track).catch(() => undefined);
      }
      tracks.forEach((t) => t.stop());
    }
  }, [renegotiatePeer, room.id, sendSignal]);

  const isScreenShareLockedForSelf =
    !canHostControl &&
    (room.suspendedActivities ||
      room.screenShareMode === 'HOST_ONLY' ||
      ((currentUser.role.toUpperCase() === 'INTERN' ||
        isGuest ||
        room.screenShareMode === 'APPROVAL_REQUIRED') &&
        !(room.screenShareApprovedIds ?? []).includes(currentUser.id)));

  const toggleScreenShare = async () => {
    if (screenOn) {
      await stopScreenShare();
      return;
    }
    if (!canHostControl && (room.suspendedActivities || room.screenShareMode === 'HOST_ONLY')) {
      showToast('Only the host or co-host can share their screen right now.');
      return;
    }
    if (isScreenShareLockedForSelf) {
      await sendSignal('*', 'request-screenshare', {
        userId: currentUser.id,
        fullName: currentUser.fullName,
      });
      showToast('Screen-share access requested from Host. Once approved, click Share Screen again.');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      showToast('Screen sharing is not supported on this browser or device.');
      return;
    }
    let scr: MediaStream | null = null;
    try {
      // W3C getDisplayMedia forbids min/max/exact in video constraints (throws TypeError in Chrome); use ideal only
      scr = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        ...({
          systemAudio: 'include',
          selfBrowserSurface: 'exclude',
          monitorTypeSurfaces: 'include',
        } as Record<string, unknown>),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'AbortError') {
        showToast('Screen share selection cancelled or permission denied.');
        return;
      }
      // Fallback 1: standard video + raw system/tab audio
      try {
        scr = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch (err2) {
        const name2 = err2 instanceof Error ? err2.name : '';
        if (name2 === 'NotAllowedError' || name2 === 'AbortError') {
          showToast('Screen share selection cancelled or permission denied.');
          return;
        }
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
    if (scrVideoTrack) {
      scrVideoTrack.contentHint = 'motion';
      void scrVideoTrack
        .applyConstraints({
          width: { max: 1920 },
          height: { max: 1080 },
          frameRate: { max: 30 },
        })
        .catch(() => undefined);
    }
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

    // Send screen-meta + room state first, then renegotiate all peers in parallel so tracks bind without delay
    await Promise.all([
      sendSignal('*', 'screen-meta', {
        active: true,
        streamId: scr.id,
        trackId: scrVideoTrack?.id ?? '',
        audioTrackId: scrAudioTrack?.id ?? '',
      }),
      mPatch<MeetingRow>('/participant', {
        screenSharing: true,
        screenStreamId: scr.id,
      })
        .then((updated) => setRoom(updated))
        .catch(async (err) => {
          const msg = err instanceof Error ? err.message : 'Screen share requires host approval.';
          showToast(msg);
          await stopScreenShare();
        }),
    ]);

    const peerOffers: Promise<void>[] = [];
    for (const [peerId, pc] of pcsRef.current.entries()) {
      for (const track of scr.getTracks()) {
        const already = pc.getSenders().some((s) => s.track?.id === track.id);
        if (!already) {
          try {
            const sender = pc.addTrack(track, scr);
            void tuneSenderQuality(
              sender,
              track.kind === 'video' ? 'screen-video' : 'screen-audio',
              activeTierRef.current,
            );
          } catch {
            // Ignore duplicate sender error
          }
        }
      }
      peerOffers.push(renegotiatePeer(peerId));
    }
    await Promise.all(peerOffers);
    const lkRoom = sfuRoomRef.current;
    if (lkRoom && lkRoom.state === 'connected') {
      if (scrVideoTrack) {
        const isSlow3G = activeTierRef.current === '3g-ultra' || activeTierRef.current === 'low-signal';
        await lkRoom.localParticipant
          .publishTrack(scrVideoTrack, {
            source: Track.Source.ScreenShare,
            simulcast: true,
            screenShareEncoding: isSlow3G
              ? { maxBitrate: 450_000, maxFramerate: 12 }
              : { maxBitrate: 1_500_000, maxFramerate: 24 },
          })
          .catch(() => undefined);
      }
      if (scrAudioTrack) {
        await lkRoom.localParticipant
          .publishTrack(scrAudioTrack, { source: Track.Source.ScreenShareAudio })
          .catch(() => undefined);
      }
    }
  };

  const toggleHandRaise = async () => {
    const next = !handRaised;
    setHandRaised(next);
    setShowReactionTray(false);
    try {
      const updated = await mPatch<MeetingRow>('/participant', {
        handRaised: next,
      });
      setRoom(updated);
    } catch (err) {
      setHandRaised(!next);
      showToast(err instanceof Error ? err.message : 'Unable to update hand raise.');
    }
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

  const handleAudioBlocked = useCallback(() => {
    setAudioBlocked(true);
  }, []);

  const unlockRoomAudio = () => {
    setAudioBlocked(false);
    document.querySelectorAll('audio').forEach((el) => {
      el.muted = false;
      void el.play().catch(() => undefined);
    });
  };

  const toggleRecording = () => {
    if (!canRecord) {
      showToast('Recording is restricted for your tier.');
      return;
    }
    if (recording) {
      if (recRafRef.current) {
        cancelAnimationFrame(recRafRef.current);
        recRafRef.current = null;
      }
      recorderRef.current?.stop();
      setRecording(false);
      setRecordingPaused(false);
      void patch(`/meetings/${room.id}/host-action`, {
        action: 'recording-status',
        payload: { active: false },
      }).catch(() => undefined);
      return;
    }

    // Collect all live audio sources across local mic, screen audio, and remote participants
    const allAudioStreams = [
      localStreamRef.current,
      screenStreamRef.current,
      ...Object.values(remoteCamStreamsRef.current),
      ...Object.values(remoteScreenStreamsRef.current),
    ].filter((s): s is MediaStream =>
      Boolean(s && s.getAudioTracks().some((t) => t.readyState === 'live')),
    );

    const hasAnyVideo =
      Boolean(screenStreamRef.current?.getVideoTracks().some((t) => t.readyState === 'live')) ||
      Object.values(remoteScreenStreamsRef.current).some((s) =>
        s.getVideoTracks().some((t) => t.readyState === 'live'),
      ) ||
      Boolean(localStreamRef.current?.getVideoTracks().some((t) => t.readyState === 'live')) ||
      Object.values(remoteCamStreamsRef.current).some((s) =>
        s.getVideoTracks().some((t) => t.readyState === 'live'),
      );

    if (!hasAnyVideo && allAudioStreams.length === 0) {
      showToast('Turn on mic/cam or screen share before starting recording.');
      return;
    }

    try {
      // Composite 1280x720 Canvas capturing ALL visible video elements (Screen Share + Remote + Local)
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');

      const drawCompositeFrame = () => {
        if (!ctx) return;
        ctx.fillStyle = '#0B0F17';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const stageVideos = Array.from(stageRef.current?.querySelectorAll('video') ?? []).filter(
          (v) => v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0,
        );

        if (stageVideos.length === 1) {
          const v = stageVideos[0]!;
          const scale = Math.min(canvas.width / v.videoWidth, canvas.height / v.videoHeight);
          const dw = v.videoWidth * scale;
          const dh = v.videoHeight * scale;
          ctx.drawImage(v, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
        } else if (stageVideos.length > 1) {
          const cols = Math.ceil(Math.sqrt(stageVideos.length));
          const rows = Math.ceil(stageVideos.length / cols);
          const cellW = canvas.width / cols;
          const cellH = canvas.height / rows;
          stageVideos.forEach((v, idx) => {
            const c = idx % cols;
            const r = Math.floor(idx / cols);
            const scale = Math.min(cellW / v.videoWidth, cellH / v.videoHeight);
            const dw = v.videoWidth * scale;
            const dh = v.videoHeight * scale;
            ctx.drawImage(v, c * cellW + (cellW - dw) / 2, r * cellH + (cellH - dh) / 2, dw, dh);
          });
        } else {
          ctx.fillStyle = '#D4A843';
          ctx.font = 'bold 28px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`Yakunex Hub Meet · ${room.title}`, canvas.width / 2, canvas.height / 2);
        }

        // Timestamp + REC watermark
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(16, 16, 260, 30);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '600 13px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`● REC  ${room.roomCode} · ${new Date().toLocaleTimeString()}`, 26, 36);

        recRafRef.current = requestAnimationFrame(drawCompositeFrame);
      };
      drawCompositeFrame();

      const combined = new MediaStream();
      const canvasStream = canvas.captureStream(24);
      canvasStream.getVideoTracks().forEach((t) => combined.addTrack(t));

      let mixCtx: AudioContext | null = null;
      if (allAudioStreams.length > 0 && typeof window !== 'undefined' && 'AudioContext' in window) {
        mixCtx = new window.AudioContext({ latencyHint: 'interactive' });
        if (mixCtx.state === 'suspended') {
          void mixCtx.resume().catch(() => undefined);
        }
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
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : 'video/webm';
      const rec = new MediaRecorder(combined, {
        mimeType: mime,
        videoBitsPerSecond: 3_500_000,
        audioBitsPerSecond: 192_000,
      });
      recordedChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        if (recRafRef.current) {
          cancelAnimationFrame(recRafRef.current);
          recRafRef.current = null;
        }
        canvasStream.getTracks().forEach((t) => t.stop());
        void mixCtx?.close().catch(() => undefined);
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${room.roomCode}-recording-${new Date().toISOString().slice(0, 10)}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };
      rec.start(1000);
      recorderRef.current = rec;
      setRecording(true);
      setRecordingPaused(false);
      void patch(`/meetings/${room.id}/host-action`, {
        action: 'recording-status',
        payload: { active: true },
      }).catch(() => undefined);
      showToast('Full composite meeting recording started (all participants & audio).');
    } catch {
      showToast('Recording is not supported in this browser.');
    }
  };

  const togglePauseRecording = () => {
    const rec = recorderRef.current;
    if (!rec || !recording) return;
    if (rec.state === 'recording') {
      rec.pause();
      setRecordingPaused(true);
      showToast('Recording paused.');
    } else if (rec.state === 'paused') {
      rec.resume();
      setRecordingPaused(false);
      showToast('Recording resumed.');
    }
  };

  const directMessageRecipients = useMemo(
    () =>
      room.participants.filter(
        (p) =>
          p.userId !== currentUser.id &&
          (canHostControl ||
            p.userId === room.organizerId ||
            p.fullName === room.organizerName ||
            (room.coHostIds ?? []).includes(p.userId) ||
            ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER'].includes(p.role.toUpperCase())),
      ),
    [canHostControl, currentUser.id, room.coHostIds, room.organizerId, room.organizerName, room.participants],
  );

  const onPickChatFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      showToast('Chat attachment must be under 3 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setChatAttachment({ name: file.name, dataUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const sendChat = async (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() && !chatAttachment) return;
    const body = chatInput.trim();
    const targetRecipient =
      chatRecipientId !== 'ALL'
        ? directMessageRecipients.find((h) => h.userId === chatRecipientId) ?? null
        : null;
    setChatInput('');
    const att = chatAttachment;
    setChatAttachment(null);
    try {
      const updated = await mPost<MeetingRow>('/chat', {
        body: body || (att ? `Attachment: ${att.name}` : ''),
        replyToId: chatReplyTo?.id ?? null,
        recipientId: targetRecipient?.userId ?? null,
        recipientName: targetRecipient?.fullName ?? null,
        attachmentUrl: att?.dataUrl ?? null,
        attachmentName: att?.name ?? null,
      });
      setChatReplyTo(null);
      setRoom(updated);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to send chat message.');
    }
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

  const hostAction = async (
    action:
      | 'admit'
      | 'admit-all'
      | 'waiting-room-message'
      | 'remove'
      | 'approve-screenshare'
      | 'toggle-cohost'
      | 'ask-unmute'
      | 'stop-video'
      | 'spotlight'
      | 'lower-all-hands'
      | 'rename'
      | 'transfer-host'
      | 'update-security'
      | 'panic-suspend',
    targetUserId?: string,
    payload?: Record<string, unknown>,
  ) => {
    try {
      const updated = await patch<MeetingRow>(`/meetings/${room.id}/host-action`, {
        action,
        targetUserId,
        payload,
      });
      setRoom(updated);
      if (action === 'approve-screenshare' && targetUserId) {
        setShareRequests((prev) => prev.filter((r) => r.userId !== targetUserId));
        void sendSignal('*', 'screenshare-approved', { targetUserId });
      }
      if (action === 'spotlight') {
        publishRealtimeData('spotlight-updated', { spotlightUserId: updated.spotlightUserId });
        if (updated.spotlightUserId) setLayoutMode('speaker');
      }
      const labels: Record<string, string> = {
        admit: 'Participant admitted from waiting room.',
        'admit-all': 'All waiting room participants admitted.',
        'waiting-room-message': 'Broadcast message sent to Waiting Room.',
        remove: 'Participant moved to Waiting Room.',
        'toggle-cohost': 'Co-Host permissions updated.',
        'approve-screenshare': 'Screen-share permission granted.',
        'ask-unmute': 'Unmute request sent to participant.',
        'stop-video': 'Participant camera turned off.',
        spotlight: updated.spotlightUserId ? 'Spotlight enabled for everyone.' : 'Spotlight removed.',
        'lower-all-hands': 'All raised hands lowered.',
        rename: 'Participant renamed.',
        'transfer-host': 'Host role transferred.',
        'update-security': 'Meeting security updated.',
        'panic-suspend': 'All participant activities suspended & room locked.',
      };
      showToast(labels[action] ?? 'Host action completed.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Host action failed or requires higher tier.');
    }
  };

  const renameSelf = async () => {
    if (!canHostControl && (room.allowRenameSelf === false || room.suspendedActivities)) {
      showToast('Host has disabled renaming yourself.');
      return;
    }
    const currentMe = room.participants.find((p) => p.userId === currentUser.id);
    const next = window.prompt('Enter your display name:', currentMe?.fullName ?? currentUser.fullName);
    if (!next || next.trim().length < 2) return;
    try {
      const updated = await post<MeetingRow>(`/meetings/${room.id}/rename-self`, {
        newName: next.trim(),
      });
      setRoom(updated);
      showToast('Display name updated.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to rename.');
    }
  };

  // Polls & Q&A handlers
  const handleCreatePoll = async (question: string, options: string[], multipleChoice: boolean) => {
    const updated = await post<MeetingRow>(`/meetings/${room.id}/polls`, {
      action: 'create',
      question,
      options,
      multipleChoice,
    });
    setRoom(updated);
  };
  const handleVotePoll = async (pollId: string, optionIds: string[]) => {
    const updated = await post<MeetingRow>(`/meetings/${room.id}/polls`, {
      action: 'vote',
      pollId,
      optionIds,
    });
    setRoom(updated);
  };
  const handleClosePoll = async (pollId: string) => {
    const updated = await post<MeetingRow>(`/meetings/${room.id}/polls`, {
      action: 'close',
      pollId,
    });
    setRoom(updated);
  };
  const handleAskQuestion = async (question: string) => {
    const updated = await post<MeetingRow>(`/meetings/${room.id}/qa`, {
      action: 'ask',
      question,
    });
    setRoom(updated);
  };
  const handleUpvoteQuestion = async (qaId: string) => {
    const updated = await post<MeetingRow>(`/meetings/${room.id}/qa`, {
      action: 'upvote',
      qaId,
    });
    setRoom(updated);
  };
  const handleAnswerQuestion = async (qaId: string, answerText: string) => {
    const updated = await post<MeetingRow>(`/meetings/${room.id}/qa`, {
      action: 'answer',
      qaId,
      answerText,
    });
    setRoom(updated);
  };

  // Breakout rooms handlers
  const handleConfigureOrOpenBreakouts = async (
    action: 'configure' | 'open',
    roomsList: Array<{ id?: string; name: string; participantIds: string[] }>,
    durationMinutes?: number,
  ) => {
    const updated = await post<MeetingRow>(`/meetings/${room.id}/breakouts`, {
      action,
      rooms: roomsList,
      durationMinutes,
    });
    setRoom(updated);
    showToast(action === 'open' ? 'Breakout rooms opened!' : 'Breakout rooms saved.');
  };
  const handleBroadcastBreakouts = async (message: string) => {
    const updated = await post<MeetingRow>(`/meetings/${room.id}/breakouts`, {
      action: 'broadcast',
      message,
    });
    setRoom(updated);
    showToast('Broadcast sent to all breakout rooms.');
  };
  const handleCloseAllBreakouts = async () => {
    const updated = await post<MeetingRow>(`/meetings/${room.id}/breakouts`, {
      action: 'close-all',
    });
    setRoom(updated);
    setActiveBreakoutId(null);
    showToast('All breakout rooms closed.');
  };
  const handleJoinBreakoutRoom = async (br: BreakoutRoomItem) => {
    setActiveBreakoutId(br.id);
    if (!isGuest) {
      await post(`/meetings/${room.id}/breakouts`, { action: 'join-room', roomId: br.id }).catch(
        () => undefined,
      );
    }
    showToast(`Switched to Breakout Room: ${br.name}`);
  };
  const handleLeaveBreakoutRoom = async () => {
    setActiveBreakoutId(null);
    if (!isGuest) {
      await post(`/meetings/${room.id}/breakouts`, { action: 'leave-room' }).catch(() => undefined);
    }
    showToast('Returned to Main Session.');
  };

  // Whiteboard & Screen Annotation handlers
  const handleAddWhiteboardStroke = (stroke: WhiteboardStroke) => {
    setWhiteboardStrokes((prev) => [...prev.slice(-400), stroke]);
    void sendSignal('*', 'whiteboard-stroke', { stroke });
  };
  const handleUndoWhiteboard = () => {
    setWhiteboardStrokes((prev) => prev.slice(0, -1));
    void sendSignal('*', 'whiteboard-undo', {});
  };
  const handleClearWhiteboard = () => {
    setWhiteboardStrokes([]);
    void sendSignal('*', 'whiteboard-clear', {});
  };

  const handleExportAttendancePdf = async () => {
    try {
      const report = await liveGet<{ entries?: MeetingRow['attendanceLog'] }>(
        `/meetings/${room.id}/attendance`,
      );
      exportMeetingAttendancePdf({
        meeting: { ...room, notes: notesDraft || room.notes },
        entries: report?.entries,
        generatedByName: currentUser.fullName,
      });
    } catch {
      exportMeetingAttendancePdf({
        meeting: { ...room, notes: notesDraft || room.notes },
        generatedByName: currentUser.fullName,
      });
    }
  };

  // Live Closed Captions (Web Speech API) + auto-append to Meeting Notes
  useEffect(() => {
    if (!captionsOn || typeof window === 'undefined') return;
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
    if (!SpeechRec) {
      showToast('Live Captions (SpeechRecognition) is best supported in Chrome / Edge.');
      setCaptionsOn(false);
      return;
    }
    let stopped = false;
    const rec = new SpeechRec() as {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (event) => {
      const idx = event.results.length - 1;
      if (idx < 0) return;
      const latest = event.results[idx];
      const text = latest?.[0]?.transcript?.trim();
      if (!text || !micOnRef.current) return;
      const capId = latest.isFinal ? `cap_fin_${Date.now()}` : 'cap_live_self';
      setLiveCaptions((prev) => {
        const filtered = prev.filter((c) => c.id !== 'cap_live_self');
        return [...filtered.slice(-2), { id: capId, speaker: currentUser.fullName, text }];
      });
      if (latest.isFinal) {
        void sendSignal('*', 'live-caption', { speaker: currentUser.fullName, text });
        const stamp = new Date().toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' });
        setNotesDraft((prev) => `${prev ? `${prev}\n` : ''}[${stamp}] ${currentUser.fullName}: ${text}`);
        setTimeout(() => {
          setLiveCaptions((prev) => prev.filter((c) => c.id !== capId));
        }, 5500);
      }
    };
    rec.onerror = () => undefined;
    rec.onend = () => {
      if (!stopped) {
        try {
          rec.start();
        } catch {
          // ignore
        }
      }
    };
    try {
      rec.start();
    } catch {
      // ignore
    }
    return () => {
      stopped = true;
      try {
        rec.stop();
      } catch {
        // ignore
      }
    };
  }, [captionsOn, currentUser.fullName, sendSignal, showToast]);

  // Network Health Stats & Online/Offline Auto-Reconnect Listener
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOffline = () => setReconnecting(true);
    const onOnline = () => {
      setReconnecting(false);
      showToast('Back online — reconnecting media...');
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    const statsTimer = setInterval(async () => {
      let rttMs = 35;
      let bitrateKbps = 1200;
      let packetLossPct = 0;
      const vSettings = localStreamRef.current?.getVideoTracks()[0]?.getSettings();
      const resolution =
        vSettings?.width && vSettings?.height ? `${vSettings.width}×${vSettings.height}` : 'Audio Only';

      const firstPc = Array.from(pcsRef.current.values())[0];
      if (firstPc && firstPc.connectionState === 'connected') {
        try {
          const report = await firstPc.getStats();
          report.forEach((stat) => {
            if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && typeof stat.currentRoundTripTime === 'number') {
              rttMs = Math.round(stat.currentRoundTripTime * 1000);
            }
            if (stat.type === 'inbound-rtp' && typeof stat.packetsLost === 'number' && typeof stat.packetsReceived === 'number') {
              const total = stat.packetsLost + stat.packetsReceived;
              if (total > 0) packetLossPct = (stat.packetsLost / total) * 100;
            }
          });
        } catch {
          // fallback below
        }
      } else {
        const navConn = (navigator as Navigator & { connection?: { rtt?: number; downlink?: number } })
          .connection;
        if (typeof navConn?.rtt === 'number' && navConn.rtt > 0) rttMs = navConn.rtt;
        if (typeof navConn?.downlink === 'number' && navConn.downlink > 0) {
          bitrateKbps = Math.round(navConn.downlink * 400);
        }
      }

      const bars: 1 | 2 | 3 | 4 =
        rttMs < 90 && packetLossPct < 1.5
          ? 4
          : rttMs < 180 && packetLossPct < 4
            ? 3
            : rttMs < 350
              ? 2
              : 1;
      const qualityLabel =
        bars === 4 ? 'Excellent' : bars === 3 ? 'Good' : bars === 2 ? 'Fair' : 'Weak';
      setNetworkStats({
        rttMs,
        bitrateKbps,
        packetLossPct,
        resolution,
        transport: sfuModeRef.current ? 'LiveKit SFU' : 'WebRTC P2P',
        qualityLabel,
        bars,
      });
    }, 3000);

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      clearInterval(statsTimer);
    };
  }, [showToast]);

  // Bandwidth Saver (Audio-Only Mode) effect
  useEffect(() => {
    const lkRoom = sfuRoomRef.current;
    if (bandwidthSaver) {
      if (camOnRef.current) {
        localStreamRef.current?.getVideoTracks().forEach((t) => {
          t.enabled = false;
        });
        camOnRef.current = false;
        setCamOn(false);
        void mPatch('/participant', { camOn: false }).catch(() => undefined);
      }
      if (lkRoom && lkRoom.state === 'connected') {
        for (const remote of lkRoom.remoteParticipants.values()) {
          const camPub = remote.getTrackPublication(Track.Source.Camera) as
            | RemoteTrackPublication
            | undefined;
          camPub?.setSubscribed(false);
        }
      }
    }
  }, [bandwidthSaver, mPatch]);

  // Zoom Keyboard Shortcuts & Push-to-Talk (Spacebar hold while muted)
  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcutsModal((v) => !v);
        return;
      }
      if (e.code === 'Space' && !e.repeat && !micOnRef.current) {
        if (!canHostControl && (room.allowUnmuteSelf === false || room.suspendedActivities)) return;
        e.preventDefault();
        setPushToTalkActive(true);
        localStreamRef.current?.getAudioTracks().forEach((t) => {
          t.enabled = true;
        });
        const micPub = sfuRoomRef.current?.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (micPub?.isMuted) void micPub.unmute().catch(() => undefined);
        return;
      }
      if (!e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'a') {
        e.preventDefault();
        void toggleMic();
      } else if (k === 'v') {
        e.preventDefault();
        void toggleCam();
      } else if (k === 's') {
        e.preventDefault();
        void toggleScreenShare();
      } else if (k === 'h') {
        e.preventDefault();
        setSideTab((s) => (s === 'chat' ? 'closed' : 'chat'));
      } else if (k === 'u') {
        e.preventDefault();
        setSideTab((s) => (s === 'participants' ? 'closed' : 'participants'));
      } else if (k === 'y') {
        e.preventDefault();
        void toggleHandRaise();
      } else if (k === 'c') {
        e.preventDefault();
        setCaptionsOn((v) => !v);
      } else if (k === 'f') {
        e.preventDefault();
        void toggleFullscreen();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && pushToTalkActive) {
        e.preventDefault();
        setPushToTalkActive(false);
        if (!micOnRef.current) {
          localStreamRef.current?.getAudioTracks().forEach((t) => {
            t.enabled = false;
          });
          const micPub = sfuRoomRef.current?.localParticipant.getTrackPublication(Track.Source.Microphone);
          if (micPub && !micPub.isMuted) void micPub.mute().catch(() => undefined);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canHostControl, pushToTalkActive, room.allowUnmuteSelf, room.suspendedActivities]);

  const copyInviteLink = async () => {
    const url = `${window.location.origin}/meet?room=${room.roomCode}`;
    const text = room.passcode ? `${url}\nPasscode: ${room.passcode}` : url;
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const leaveCall = async (endForAll = false) => {
    setShowLeaveMenu(false);
    if (typeof document !== 'undefined' && document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => undefined);
    }
    setIsPip(false);
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    }
    setIsFullscreen(false);
    if (recording) recorderRef.current?.stop();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    if (sfuRoomRef.current) {
      await sfuRoomRef.current.disconnect().catch(() => undefined);
      sfuRoomRef.current = null;
    }

    try {
      if (endForAll && !isGuest) {
        await patch(`/meetings/${room.id}`, { status: 'COMPLETED' });
      } else {
        await mPost('/leave', {});
      }
    } catch {
      // Proceed cleanly out of studio
    }
    void onExited(endForAll);
  };

  // Sync fullscreen state with native browser Fullscreen API + Esc key fallback
  useEffect(() => {
    const syncNativeFullscreen = () => {
      const fsDoc = document as Document & { webkitFullscreenElement?: Element | null };
      const activeEl = fsDoc.fullscreenElement ?? fsDoc.webkitFullscreenElement ?? null;
      setIsFullscreen(Boolean(activeEl));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen && !document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', syncNativeFullscreen);
    document.addEventListener('webkitfullscreenchange', syncNativeFullscreen as EventListener);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', syncNativeFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncNativeFullscreen as EventListener);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    const el = studioRef.current as (HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    }) | null;
    const fsDoc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const nativeEl = fsDoc.fullscreenElement ?? fsDoc.webkitFullscreenElement ?? null;

    if (nativeEl || isFullscreen) {
      try {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (fsDoc.webkitExitFullscreen) {
          await fsDoc.webkitExitFullscreen();
        }
      } catch {
        // Fallback below clears CSS fullscreen
      }
      setIsFullscreen(false);
      return;
    }

    if (!el) return;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      } else if (el.msRequestFullscreen) {
        await el.msRequestFullscreen();
      }
      setIsFullscreen(true);
    } catch {
      // Fallback to CSS expanded viewport fullscreen when OS/iOS restricts Fullscreen API
      setIsFullscreen(true);
    }
  }, [isFullscreen]);

  // Sync browser Picture-in-Picture state
  useEffect(() => {
    const vid = pipVideoRef.current;
    if (!vid) return;
    const onEnter = () => setIsPip(true);
    const onLeave = () => setIsPip(false);
    vid.addEventListener('enterpictureinpicture', onEnter);
    vid.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      vid.removeEventListener('enterpictureinpicture', onEnter);
      vid.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, []);

  const togglePictureInPicture = useCallback(async () => {
    if (typeof document === 'undefined') return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => undefined);
      setIsPip(false);
      return;
    }
    if (!document.pictureInPictureEnabled) {
      showToast('Picture-in-Picture is not supported on this browser.');
      return;
    }

    const pickLiveVideoStream = (): MediaStream | null => {
      const hasLiveVideo = (s?: MediaStream | null) =>
        Boolean(s?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled));

      if (screenStream && hasLiveVideo(screenStream)) return screenStream;
      for (const s of Object.values(remoteScreenStreams)) {
        if (hasLiveVideo(s)) return s;
      }
      const speakerId = room.participants.find(
        (p) => speakingUsers[p.userId] && p.micOn && p.userId !== currentUser.id,
      )?.userId;
      if (speakerId && hasLiveVideo(remoteCamStreams[speakerId])) {
        return remoteCamStreams[speakerId];
      }
      for (const s of Object.values(remoteCamStreams)) {
        if (hasLiveVideo(s)) return s;
      }
      if (hasLiveVideo(localStream)) return localStream;
      return null;
    };

    const targetStream = pickLiveVideoStream();
    if (!targetStream) {
      showToast('Turn on a camera or screen share first to open Picture-in-Picture.');
      return;
    }

    const vid = pipVideoRef.current;
    if (!vid) return;
    try {
      vid.srcObject = targetStream;
      await vid.play();
      await vid.requestPictureInPicture();
      setIsPip(true);
    } catch {
      showToast('Could not open Picture-in-Picture window.');
    }
  }, [currentUser.id, localStream, remoteCamStreams, remoteScreenStreams, room.participants, screenStream, showToast, speakingUsers]);

  // Resolve current active presenter screen share (local OR remote)
  const activeScreenShare = useMemo(() => {
    const hasLiveScreenVideo = (s?: MediaStream | null) =>
      Boolean(s?.getVideoTracks().some((t) => t.readyState === 'live'));

    if (screenStream && hasLiveScreenVideo(screenStream)) {
      return {
        userId: currentUser.id,
        presenterName: `${formatParticipantDisplay(currentUser)} (You)`,
        stream: screenStream,
      };
    }
    for (const [peerId, stream] of Object.entries(remoteScreenStreams)) {
      if (!hasLiveScreenVideo(stream)) continue;
      const p = room.participants.find((item) => item.userId === peerId);
      // In SFU mode, TrackSubscribed can arrive 1-2s before the 3G /room HTTP poll flips p.screenSharing=true
      if (p && !p.screenSharing && !sfuActive) continue;
      return {
        userId: peerId,
        presenterName: p ? formatParticipantDisplay(p) : 'Presenter',
        stream,
      };
    }
    return null;
  }, [currentUser, remoteScreenStreams, room.participants, screenStream, sfuActive]);

  const GALLERY_PAGE_SIZE = 16;

  const sortedGalleryParticipants = useMemo(() => {
    return [...room.participants].sort((a, b) => {
      if (a.userId === currentUser.id) return -1;
      if (b.userId === currentUser.id) return 1;
      const aSpeak = speakingUsers[a.userId] ? 1 : 0;
      const bSpeak = speakingUsers[b.userId] ? 1 : 0;
      if (aSpeak !== bSpeak) return bSpeak - aSpeak;
      if (a.camOn !== b.camOn) return a.camOn ? -1 : 1;
      return a.joinedAt.localeCompare(b.joinedAt);
    });
  }, [currentUser.id, room.participants, speakingUsers]);

  const totalGalleryPages = Math.max(
    1,
    Math.ceil(sortedGalleryParticipants.length / GALLERY_PAGE_SIZE),
  );
  const safeGalleryPage = Math.min(galleryPage, totalGalleryPages - 1);

  const visibleGalleryParticipants = useMemo(() => {
    const filtered = sortedGalleryParticipants.filter((p) => {
      if (hideSelfView && p.userId === currentUser.id && sortedGalleryParticipants.length > 1) {
        return false;
      }
      if (hideNonVideo && !p.camOn && p.userId !== room.spotlightUserId && sortedGalleryParticipants.length > 1) {
        return false;
      }
      return true;
    });
    const list = filtered.length > 0 ? filtered : sortedGalleryParticipants;
    const start = safeGalleryPage * GALLERY_PAGE_SIZE;
    return list.slice(start, start + GALLERY_PAGE_SIZE);
  }, [
    currentUser.id,
    hideNonVideo,
    hideSelfView,
    room.spotlightUserId,
    safeGalleryPage,
    sortedGalleryParticipants,
  ]);

  // Compute grid columns in Gallery View based on visible tile count (up to 16 per page for 100+ rooms)
  const gridColsClass = useMemo(() => {
    const n = visibleGalleryParticipants.length;
    if (n <= 1) return 'w-full grid-cols-1 max-w-4xl mx-auto';
    if (n === 2) return 'w-full grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto';
    if (n <= 4) return 'w-full grid-cols-1 sm:grid-cols-2 max-w-6xl mx-auto';
    if (n <= 6) return 'w-full grid-cols-2 lg:grid-cols-3';
    if (n <= 9) return 'w-full grid-cols-2 sm:grid-cols-3';
    return 'w-full grid-cols-2 sm:grid-cols-3 xl:grid-cols-4';
  }, [visibleGalleryParticipants.length]);

  const togglePinMainScreen = useCallback((userId: string) => {
    setPinnedUserId((prev) => {
      const next = prev === userId ? null : userId;
      if (next) setLayoutMode('speaker');
      return next;
    });
  }, []);

  const activeSpeakerParticipant = useMemo(() => {
    if (room.spotlightUserId) {
      const spot = room.participants.find((p) => p.userId === room.spotlightUserId);
      if (spot) return spot;
    }
    if (pinnedUserId) {
      const pinned = room.participants.find((p) => p.userId === pinnedUserId);
      if (pinned) return pinned;
    }
    const speaking = room.participants.find(
      (p) => speakingUsers[p.userId] && p.micOn && p.userId !== currentUser.id,
    );
    const hostParticipant = room.participants.find(
      (p) => p.userId === room.organizerId || p.fullName === room.organizerName,
    );
    return (
      speaking ??
      hostParticipant ??
      room.participants.find((p) => p.userId !== currentUser.id) ??
      room.participants[0] ??
      null
    );
  }, [
    currentUser.id,
    pinnedUserId,
    room.organizerId,
    room.organizerName,
    room.participants,
    room.spotlightUserId,
    speakingUsers,
  ]);

  // In SFU mode, subscribe/upgrade video only for visible page tiles (+ active speakers) so 100+ cameras run with zero lag
  useEffect(() => {
    const lkRoom = sfuRoomRef.current;
    if (!sfuActive || !lkRoom || lkRoom.state !== 'connected') return;
    const knownIds = new Set(room.participants.map((p) => p.userId));
    const visibleIds = new Set(visibleGalleryParticipants.map((p) => p.userId));
    const n = visibleGalleryParticipants.length;
    const isSlow3G =
      activeTierRef.current === '3g-ultra' ||
      activeTierRef.current === 'low-signal' ||
      networkStats.rttMs >= 220;
    const targetQuality = isSlow3G
      ? VideoQuality.LOW
      : n <= 4
        ? VideoQuality.HIGH
        : n <= 9
          ? VideoQuality.MEDIUM
          : VideoQuality.LOW;

    for (const remote of lkRoom.remoteParticipants.values()) {
      const scrPub = remote.getTrackPublication(Track.Source.ScreenShare) as
        | RemoteTrackPublication
        | undefined;
      if (scrPub) {
        try {
          scrPub.setSubscribed(true);
          scrPub.setVideoQuality(isSlow3G ? VideoQuality.MEDIUM : VideoQuality.HIGH);
        } catch {
          // ignore
        }
      }
      const scrAudioPub = remote.getTrackPublication(Track.Source.ScreenShareAudio) as
        | RemoteTrackPublication
        | undefined;
      if (scrAudioPub) {
        try {
          scrAudioPub.setSubscribed(true);
        } catch {
          // ignore
        }
      }
      const camPub = remote.getTrackPublication(Track.Source.Camera) as
        | RemoteTrackPublication
        | undefined;
      if (!camPub) continue;
      const shouldWatch =
        layoutMode === 'gallery'
          ? room.participants.length <= GALLERY_PAGE_SIZE ||
            !knownIds.has(remote.identity) ||
            visibleIds.has(remote.identity) ||
            Boolean(speakingUsers[remote.identity])
          : remote.identity === activeSpeakerParticipant?.userId || Boolean(speakingUsers[remote.identity]);
      try {
        camPub.setSubscribed(shouldWatch);
        if (shouldWatch) {
          camPub.setVideoQuality(
            isSlow3G
              ? VideoQuality.LOW
              : remote.identity === activeSpeakerParticipant?.userId
                ? VideoQuality.HIGH
                : targetQuality,
          );
        }
      } catch {
        // Ignore transient track subscription errors
      }
    }
  }, [activeSpeakerParticipant?.userId, layoutMode, networkStats.rttMs, room.participants, sfuActive, speakingUsers, visibleGalleryParticipants]);

  return (
    <div
      ref={studioRef}
      onMouseMove={isFullscreen ? resetFullscreenAutoHide : undefined}
      onMouseDown={isFullscreen ? resetFullscreenAutoHide : undefined}
      onTouchStart={isFullscreen ? resetFullscreenAutoHide : undefined}
      onKeyDown={isFullscreen ? resetFullscreenAutoHide : undefined}
      className={cn(
        'relative flex flex-col overflow-hidden bg-[#08090C] text-white shadow-2xl',
        standalone || isFullscreen
          ? 'fixed inset-0 z-50 h-screen w-screen rounded-none border-0'
          : 'h-[calc(100vh-110px)] min-h-[640px] rounded-[28px] border border-white/[0.08]',
        isFullscreen && controlsHidden && 'cursor-none',
      )}
    >
      {/* Hidden video element powering Picture-in-Picture floating window */}
      <video
        ref={pipVideoRef}
        autoPlay
        playsInline
        muted
        className="pointer-events-none fixed -left-[9999px] h-px w-px opacity-0"
      />
      {/* Hidden audio playback elements for remote mics AND shared screen audio */}
      {room.participants
        .filter((p) => p.userId !== currentUser.id)
        .map((p) => (
          <div key={`audio-wrap-${p.userId}`} className="hidden">
            <RemoteAudioPlayer
              key={`audio-cam-${p.userId}`}
              stream={remoteCamStreams[p.userId]}
              sinkId={selectedSpeakerId}
              muted={(remoteVolumes[p.userId] ?? 1) === 0}
              volume={remoteVolumes[p.userId] ?? 1}
              onAutoplayBlocked={handleAudioBlocked}
            />
            <RemoteAudioPlayer
              key={`audio-scr-${p.userId}`}
              stream={remoteScreenStreams[p.userId]}
              sinkId={selectedSpeakerId}
              muted={screenAudioMuted}
              volume={screenAudioMuted ? 0 : 1}
              onAutoplayBlocked={handleAudioBlocked}
            />
          </div>
        ))}

      {/* ─── TOP ZOOM × APPLE ULTRA PRO MAX FROSTED BAR ──────────────────── */}
      <header
        className={cn(
          'relative z-30 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-[#0A0C11]/90 px-4 py-2 backdrop-blur-2xl transition-all duration-300',
          isFullscreen && controlsHidden && 'pointer-events-none h-0 overflow-hidden border-0 py-0 opacity-0',
        )}
      >
        {/* Left: Zoom Green Shield Info Popover + Title + Tabular Timer + Live Status Pills */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMeetingInfo((v) => !v)}
              title="Meeting Information & Encryption"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/15 text-[#30D158] transition hover:bg-emerald-500/25"
            >
              <Shield className="h-4 w-4" />
            </button>
            {showMeetingInfo && (
              <div className="absolute left-0 top-10 z-50 w-72 space-y-2.5 rounded-2xl border border-white/15 bg-[#121620]/95 p-4 text-xs text-white shadow-2xl backdrop-blur-2xl">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{room.title}</span>
                  <button
                    type="button"
                    onClick={() => setShowMeetingInfo(false)}
                    className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 border-t border-white/10 pt-2 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-white/50">Meeting ID</span>
                    <span className="font-mono font-semibold text-white">{room.roomCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Host</span>
                    <span className="font-medium text-white">{room.organizerName}</span>
                  </div>
                  {room.passcode && canHostControl && (
                    <div className="flex justify-between">
                      <span className="text-white/50">Passcode</span>
                      <span className="font-mono font-semibold text-[#F5C451]">{room.passcode}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-white/50">Encryption</span>
                    <span className="font-semibold text-[#30D158]">DTLS-SRTP Verified</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void copyInviteLink()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#2D8CFF] py-2 text-xs font-semibold text-white transition hover:bg-[#3B96FF]"
                >
                  {copiedCode ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedCode ? 'Invite Link Copied!' : 'Copy Invite Link'}
                </button>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="max-w-[200px] truncate font-display text-sm font-semibold tracking-tight text-white sm:max-w-[300px]">
                {room.title}
              </h2>
              <span className="rounded-lg border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] tabular-nums text-white/80">
                {formatDuration(elapsedSec)}
              </span>
              {room.isLocked && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-[#FF453A]/20 px-2 py-0.5 text-[10px] font-semibold text-[#FF6961]">
                  <Lock className="h-3 w-3" /> Locked
                </span>
              )}
              {sfuActive && (
                <span className="hidden rounded-lg border border-[#30D158]/25 bg-[#30D158]/10 px-2 py-0.5 text-[10px] font-semibold text-[#30D158] md:inline-block">
                  HD · SFU
                </span>
              )}
              {(recording || room.recordingActive) && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF453A]/90 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-white shadow">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  {recording
                    ? `${recordingPaused ? 'PAUSED' : 'REC'} ${formatDuration(recordingSec)}`
                    : `REC · ${room.recordingByName || 'Host'}`}
                </span>
              )}
              {bandwidthSaver && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  <Wifi className="h-3 w-3" /> Audio-Only
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Apple Signal Meter + Zoom View Segmented Control + PiP + Fullscreen */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowStatsModal(true)}
            title="Live Network Statistics"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.05] px-2.5 py-1.5 text-[11px] font-medium tabular-nums text-white/80 transition hover:bg-white/10"
          >
            <Activity
              className={cn(
                'h-3.5 w-3.5',
                networkStats.bars >= 3 ? 'text-[#30D158]' : networkStats.bars === 2 ? 'text-amber-400' : 'text-[#FF453A]',
              )}
            />
            <span className="hidden sm:inline">{networkStats.rttMs}ms</span>
          </button>

          {audioBlocked && (
            <button
              type="button"
              onClick={unlockRoomAudio}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 shadow-lg transition hover:bg-amber-300"
            >
              <Volume2 className="h-3.5 w-3.5" /> Enable Audio
            </button>
          )}

          {!activeScreenShare && (
            <div className="inline-flex rounded-xl border border-white/[0.08] bg-white/[0.05] p-0.5 text-[11px] backdrop-blur-md">
              <button
                type="button"
                onClick={() => setLayoutMode('gallery')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition',
                  layoutMode === 'gallery' ? 'bg-white/20 text-white shadow-sm' : 'text-white/60 hover:text-white',
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Gallery
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('speaker')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition',
                  layoutMode === 'speaker' ? 'bg-white/20 text-white shadow-sm' : 'text-white/60 hover:text-white',
                )}
              >
                <Sparkles className="h-3.5 w-3.5" /> Speaker
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void togglePictureInPicture()}
            title={isPip ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-semibold transition',
              isPip
                ? 'border-[#30D158]/40 bg-[#30D158]/15 text-[#30D158]'
                : 'border-white/[0.08] bg-white/[0.05] text-white/80 hover:bg-white/10 hover:text-white',
            )}
          >
            <PictureInPicture2 className="h-3.5 w-3.5" />
            <span className="hidden md:inline">PiP</span>
          </button>

          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Fullscreen'}
            className={cn(
              'inline-flex h-8 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-semibold transition',
              isFullscreen
                ? 'border-[#2D8CFF]/40 bg-[#2D8CFF]/20 text-[#6BB0FF]'
                : 'border-white/[0.08] bg-white/[0.05] text-white/80 hover:bg-white/10 hover:text-white',
            )}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span className="hidden md:inline">{isFullscreen ? 'Exit' : 'Full'}</span>
          </button>
        </div>
      </header>

      {/* Auto-Reconnect Banner */}
      {reconnecting && (
        <div className="z-40 flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-xs font-bold text-slate-950">
          <span className="h-2 w-2 animate-ping rounded-full bg-slate-950" />
          Connection unstable — Reconnecting automatically...
        </div>
      )}

      {/* Active Breakout Room Banner */}
      {(room.breakoutRooms ?? []).some((b) => b.active) && (
        <div className="z-30 flex flex-wrap items-center justify-between gap-2 border-b border-[#D4A843]/30 bg-[#D4A843]/15 px-5 py-1.5 text-xs text-amber-100">
          <span className="flex items-center gap-2 font-medium">
            <DoorOpen className="h-3.5 w-3.5 text-[#D4A843]" />
            {activeBreakoutId
              ? `In Breakout Room: ${(room.breakoutRooms ?? []).find((b) => b.id === activeBreakoutId)?.name ?? 'Sub-room'}`
              : 'Breakout Rooms are open!'}
          </span>
          <div className="flex items-center gap-2">
            {activeBreakoutId ? (
              <button
                type="button"
                onClick={() => void handleLeaveBreakoutRoom()}
                className="rounded-lg bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-white/25"
              >
                Return to Main Room
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setBreakoutModalOpen(true)}
                className="rounded-lg bg-[#D4A843] px-2.5 py-0.5 text-[11px] font-bold text-slate-950 hover:bg-[#e5ba52]"
              >
                Open Breakout Rooms
              </button>
            )}
          </div>
        </div>
      )}

      {/* Push-to-Talk Indicator Pill */}
      {pushToTalkActive && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-40 -translate-x-1/2 rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow-xl">
          🎙️ Push-to-Talk Active (Release Space to Mute)
        </div>
      )}

      {/* Host Ask-to-Unmute Modal Prompt */}
      {askUnmutePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm space-y-4 rounded-3xl border border-white/15 bg-[#111827] p-6 text-center text-white shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#D4A843]/20 text-[#D4A843]">
              <Mic className="h-6 w-6" />
            </div>
            <h3 className="font-display text-base font-semibold">The host would like you to unmute</h3>
            <p className="text-xs text-white/65">
              <strong>{askUnmutePrompt.by}</strong> asked you to unmute your microphone.
            </p>
            <div className="flex justify-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="border-white/15 bg-white/10 text-white"
                onClick={() => setAskUnmutePrompt(null)}
              >
                Stay Muted
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setAskUnmutePrompt(null);
                  if (!micOn) void toggleMic();
                }}
              >
                Unmute Now
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {bannerNotice && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-slate-900/95 px-4 py-1.5 text-xs font-medium text-white shadow-xl backdrop-blur">
          {bannerNotice}
        </div>
      )}

      {/* Host Waiting Room Live Banner */}
      {canHostControl && (room.waitingRoom?.length ?? 0) > 0 && (
        <div className="absolute left-1/2 top-16 z-30 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl border border-amber-400/35 bg-slate-950/95 px-4 py-2 text-xs text-white shadow-2xl backdrop-blur-xl">
          <Users className="h-4 w-4 text-amber-400" />
          <span>
            <strong>{room.waitingRoom![0].fullName}</strong> is in the Waiting Room
            {room.waitingRoom!.length > 1 ? ` (+${room.waitingRoom!.length - 1} more)` : ''}
          </span>
          <button
            type="button"
            onClick={() => void hostAction('admit', room.waitingRoom![0].userId)}
            className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600"
          >
            Admit
          </button>
          <button
            type="button"
            onClick={() => void hostAction('remove', room.waitingRoom![0].userId)}
            className="rounded-lg bg-rose-500/25 px-2 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/40"
          >
            Deny
          </button>
        </div>
      )}

      {/* Host Screen-Share Access Request Banner */}
      {canHostControl && shareRequests.length > 0 && (
        <div className="absolute left-1/2 top-24 z-30 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl border border-sky-400/35 bg-slate-950/95 px-4 py-2.5 text-xs text-white shadow-2xl backdrop-blur-xl">
          <MonitorUp className="h-4 w-4 text-sky-400" />
          <span>
            <strong>{shareRequests[0].fullName}</strong> requested screen-share access
          </span>
          <button
            type="button"
            onClick={() => void hostAction('approve-screenshare', shareRequests[0].userId)}
            className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600"
          >
            Allow Share
          </button>
          <button
            type="button"
            onClick={() =>
              setShareRequests((prev) => prev.filter((r) => r.userId !== shareRequests[0].userId))
            }
            className="rounded-lg bg-white/10 px-2 py-1 text-[11px] text-white/75 hover:bg-white/20"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ─── MAIN VIDEO STAGE + RIGHT PANEL ──────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Stage */}
        <div ref={stageRef} className="relative flex-1 overflow-y-auto p-4 md:p-5">
          {whiteboardMode === 'whiteboard' && (
            <WhiteboardOverlay
              mode="whiteboard"
              strokes={whiteboardStrokes}
              authorName={currentUser.fullName}
              onAddStroke={handleAddWhiteboardStroke}
              onUndo={handleUndoWhiteboard}
              onClear={handleClearWhiteboard}
              onClose={() => setWhiteboardMode('closed')}
            />
          )}

          {activeScreenShare ? (
            <div className="flex h-full flex-col gap-4 lg:flex-row">
              {/* Spotlight Presented Screen (with Side-by-Side Resizer, Zoom, Optimize Video & Live Annotation) */}
              <div
                onDoubleClick={() => void toggleFullscreen()}
                style={sideBySideShare ? { width: `${shareSplitPct}%`, flex: 'none' } : undefined}
                className="relative flex h-full min-h-[380px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-emerald-500/40 bg-black shadow-2xl"
              >
                <div
                  className="h-full w-full overflow-auto"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <VideoCanvas
                    stream={activeScreenShare.stream}
                    style={{
                      transform: `scale(${shareZoom})`,
                      transformOrigin: 'center center',
                      transition: 'transform 150ms ease',
                    }}
                    className="h-full w-full object-contain"
                  />
                </div>

                {whiteboardMode === 'annotate' && (
                  <WhiteboardOverlay
                    mode="annotate"
                    strokes={whiteboardStrokes}
                    authorName={currentUser.fullName}
                    onAddStroke={handleAddWhiteboardStroke}
                    onUndo={handleUndoWhiteboard}
                    onClear={handleClearWhiteboard}
                    onClose={() => setWhiteboardMode('closed')}
                  />
                )}

                <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-1.5">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-600/95 px-3 py-1 text-xs font-semibold text-white shadow">
                    <MonitorUp className="h-3.5 w-3.5" /> {activeScreenShare.presenterName} is sharing
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
                            <VolumeX className="h-3.5 w-3.5" /> Sound Off
                          </>
                        ) : (
                          <>
                            <Volume2 className="h-3.5 w-3.5" /> Sound On
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

                  {/* Zoom Pro Screen Share Tools: Side-by-Side, Zoom, Annotate, Optimize */}
                  <button
                    type="button"
                    onClick={() => setSideBySideShare((v) => !v)}
                    title="Toggle Side-by-Side Mode"
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow backdrop-blur transition',
                      sideBySideShare
                        ? 'bg-[#D4A843] text-slate-950'
                        : 'bg-black/65 text-white/90 hover:bg-black/85',
                    )}
                  >
                    <Columns2 className="h-3 w-3" /> Side-by-Side
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setWhiteboardMode((m) => (m === 'annotate' ? 'closed' : 'annotate'))
                    }
                    title="Annotate on Shared Screen"
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow backdrop-blur transition',
                      whiteboardMode === 'annotate'
                        ? 'bg-[#D4A843] text-slate-950'
                        : 'bg-black/65 text-white/90 hover:bg-black/85',
                    )}
                  >
                    <PenTool className="h-3 w-3" /> Annotate
                  </button>
                  <div className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] text-white backdrop-blur">
                    <button
                      type="button"
                      onClick={() => setShareZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                      title="Zoom Out"
                      className="p-0.5 hover:text-[#D4A843]"
                    >
                      <ZoomOut className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShareZoom(1)}
                      className="font-mono text-[10px]"
                      title="Reset Zoom"
                    >
                      {Math.round(shareZoom * 100)}%
                    </button>
                    <button
                      type="button"
                      onClick={() => setShareZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                      title="Zoom In"
                      className="p-0.5 hover:text-[#D4A843]"
                    >
                      <ZoomIn className="h-3 w-3" />
                    </button>
                  </div>
                  {activeScreenShare.userId === currentUser.id && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !optimizeVideoShare;
                          setOptimizeVideoShare(next);
                          const vt = screenStreamRef.current?.getVideoTracks()[0];
                          if (vt) vt.contentHint = next ? 'motion' : 'detail';
                          showToast(
                            next ? 'Optimized screen share for smooth video clips.' : 'Optimized for crisp text/slides.',
                          );
                        }}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[11px] font-semibold shadow backdrop-blur transition',
                          optimizeVideoShare
                            ? 'bg-sky-500 text-white'
                            : 'bg-black/65 text-white/80 hover:bg-black/85',
                        )}
                      >
                        {optimizeVideoShare ? 'Video Mode' : 'Crisp Text'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void stopScreenShare()}
                        className="rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white shadow transition hover:bg-rose-500"
                      >
                        Stop Share
                      </button>
                    </>
                  )}
                </div>

                {sideBySideShare && (
                  <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-3 py-1 text-[11px] text-white backdrop-blur">
                    <span>Split: {shareSplitPct}%</span>
                    <input
                      type="range"
                      min={40}
                      max={82}
                      value={shareSplitPct}
                      onChange={(e) => setShareSplitPct(Number(e.target.value))}
                      className="w-24 accent-[#D4A843]"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void toggleFullscreen()}
                  title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen meeting'}
                  className="absolute right-3 top-3 z-20 rounded-lg bg-black/60 p-2 text-white/80 backdrop-blur transition hover:bg-black/85 hover:text-white"
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              </div>

              {/* Participant Filmstrip */}
              <div
                className={cn(
                  'flex gap-3 overflow-x-auto lg:flex-col lg:overflow-y-auto',
                  sideBySideShare ? 'lg:flex-1' : 'lg:w-64',
                )}
              >
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
                        isSpotlight={room.spotlightUserId === p.userId}
                        mirrorSelf={mirrorVideo}
                        touchUp={touchUp}
                        videoEffect={videoEffect}
                        remoteVolume={remoteVolumes[p.userId] ?? 1}
                        onVolumeChange={(uid, vol) =>
                          setRemoteVolumes((prev) => ({ ...prev, [uid]: vol }))
                        }
                        reaction={react}
                        compact={!sideBySideShare}
                        canHostControl={canHostControl}
                        onHostMute={hostMute}
                        onHostStopVideo={(uid) => void hostAction('stop-video', uid)}
                        onToggleSpotlight={(uid) =>
                          void hostAction('spotlight', room.spotlightUserId === uid ? undefined : uid)
                        }
                        connectionStatus={peerConnStates[p.userId]}
                        iceTurnConfigured={iceTurnConfigured}
                        onRetryConnection={handleRetryPeerConnection}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : layoutMode === 'speaker' && activeSpeakerParticipant ? (
            <div className="flex h-full flex-col gap-3">
              <div className="flex min-h-0 w-full flex-1 items-stretch">
                <ParticipantTile
                  participant={activeSpeakerParticipant}
                  stream={
                    activeSpeakerParticipant.userId === currentUser.id
                      ? localStream
                      : remoteCamStreams[activeSpeakerParticipant.userId]
                  }
                  isSelf={activeSpeakerParticipant.userId === currentUser.id}
                  isSpeaking={Boolean(speakingUsers[activeSpeakerParticipant.userId])}
                  isSpotlight={room.spotlightUserId === activeSpeakerParticipant.userId}
                  mirrorSelf={mirrorVideo}
                  touchUp={touchUp}
                  videoEffect={videoEffect}
                  remoteVolume={remoteVolumes[activeSpeakerParticipant.userId] ?? 1}
                  onVolumeChange={(uid, vol) =>
                    setRemoteVolumes((prev) => ({ ...prev, [uid]: vol }))
                  }
                  reaction={
                    [...reactions].reverse().find((r) => r.userId === activeSpeakerParticipant.userId)
                      ?.emoji
                  }
                  fillStage
                  isPinned={pinnedUserId === activeSpeakerParticipant.userId}
                  onTogglePin={togglePinMainScreen}
                  onToggleSpotlight={(uid) =>
                    void hostAction('spotlight', room.spotlightUserId === uid ? undefined : uid)
                  }
                  canHostControl={canHostControl}
                  onHostMute={hostMute}
                  onHostStopVideo={(uid) => void hostAction('stop-video', uid)}
                  connectionStatus={peerConnStates[activeSpeakerParticipant.userId]}
                  iceTurnConfigured={iceTurnConfigured}
                  onRetryConnection={handleRetryPeerConnection}
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
                            isSpotlight={room.spotlightUserId === p.userId}
                            mirrorSelf={mirrorVideo}
                            touchUp={touchUp}
                            videoEffect={videoEffect}
                            reaction={react}
                            compact
                            canHostControl={canHostControl}
                            onHostMute={hostMute}
                            connectionStatus={peerConnStates[p.userId]}
                            iceTurnConfigured={iceTurnConfigured}
                            onRetryConnection={handleRetryPeerConnection}
                          />
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full w-full flex-col gap-3">
              <div className={cn('grid w-full flex-1 content-center gap-4', gridColsClass)}>
                {visibleGalleryParticipants.map((p) => {
                  const isSelf = p.userId === currentUser.id;
                  const react = [...reactions].reverse().find((r) => r.userId === p.userId)?.emoji;
                  return (
                    <ParticipantTile
                      key={p.userId}
                      participant={p}
                      stream={isSelf ? localStream : remoteCamStreams[p.userId]}
                      isSelf={isSelf}
                      isSpeaking={Boolean(speakingUsers[p.userId])}
                      isSpotlight={room.spotlightUserId === p.userId}
                      mirrorSelf={mirrorVideo}
                      touchUp={touchUp}
                      videoEffect={videoEffect}
                      remoteVolume={remoteVolumes[p.userId] ?? 1}
                      onVolumeChange={(uid, vol) =>
                        setRemoteVolumes((prev) => ({ ...prev, [uid]: vol }))
                      }
                      reaction={react}
                      isPinned={pinnedUserId === p.userId}
                      onTogglePin={togglePinMainScreen}
                      onToggleSpotlight={(uid) =>
                        void hostAction('spotlight', room.spotlightUserId === uid ? undefined : uid)
                      }
                      canHostControl={canHostControl}
                      onHostMute={hostMute}
                      onHostStopVideo={(uid) => void hostAction('stop-video', uid)}
                      connectionStatus={peerConnStates[p.userId]}
                      iceTurnConfigured={iceTurnConfigured}
                      onRetryConnection={handleRetryPeerConnection}
                    />
                  );
                })}
              </div>
              {totalGalleryPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={safeGalleryPage === 0}
                    onClick={() => setGalleryPage((p) => Math.max(0, p - 1))}
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <span className="text-xs font-medium text-white/70">
                    Page {safeGalleryPage + 1} / {totalGalleryPages} ({room.participants.length} in call)
                  </span>
                  <button
                    type="button"
                    disabled={safeGalleryPage >= totalGalleryPages - 1}
                    onClick={() => setGalleryPage((p) => Math.min(totalGalleryPages - 1, p + 1))}
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-40"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Live Closed Captions (CC) Subtitle Overlay */}
          {captionsOn && liveCaptions.length > 0 && (
            <div className="pointer-events-none sticky bottom-3 z-30 mx-auto mt-3 flex max-w-2xl flex-col items-center gap-1">
              {liveCaptions.map((cap) => (
                <div
                  key={cap.id}
                  className="rounded-xl bg-black/80 px-4 py-1.5 text-center text-xs text-white shadow-xl backdrop-blur"
                >
                  <span className="mr-1.5 font-bold text-[#D4A843]">{cap.speaker}:</span>
                  <span>{cap.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Collapsible Right Inspector Panel: Participants | Chat | Polls & Q&A | Notes */}
        {sideTab !== 'closed' && (
          <aside className="flex w-full max-w-[348px] shrink-0 flex-col border-l border-white/[0.08] bg-[#0D1017]/95 backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-3 py-2.5">
              <div className="flex flex-wrap gap-0.5 rounded-xl bg-white/[0.05] p-0.5">
                {(
                  [
                    ['participants', `People (${room.participants.length})`],
                    ['chat', 'Chat'],
                    ['polls', 'Polls'],
                    ['notes', 'Notes'],
                  ] as const
                ).map(([tabKey, label]) => (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setSideTab(tabKey)}
                    className={cn(
                      'rounded-lg px-2 py-1 text-[11px] font-semibold transition',
                      sideTab === tabKey
                        ? 'bg-[#2D8CFF] text-white shadow-sm'
                        : 'text-white/60 hover:text-white',
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
                {/* Search bar */}
                <div className="relative mb-2.5">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                  <input
                    value={participantSearch}
                    onChange={(e) => setParticipantSearch(e.target.value)}
                    placeholder="Search participants..."
                    className="w-full rounded-xl border border-white/15 bg-white/5 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-white/40 focus:border-[#D4A843] focus:outline-none"
                  />
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto">
                  {canHostControl && (room.waitingRoom?.length ?? 0) > 0 && (
                    <div className="mb-3 space-y-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-2.5">
                      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-amber-300">
                        <span>Waiting Room ({room.waitingRoom?.length})</span>
                        <button
                          type="button"
                          onClick={() => void hostAction('admit-all')}
                          className="rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-600"
                        >
                          Admit All
                        </button>
                      </div>
                      {(room.waitingRoom ?? []).map((w) => (
                        <div
                          key={w.userId}
                          className="flex items-center justify-between gap-2 rounded-lg bg-black/30 px-2.5 py-1.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-white">{w.fullName}</p>
                            <p className="text-[10px] text-white/50">{w.isGuest ? 'EXTERNAL GUEST' : w.role}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void hostAction('admit', w.userId)}
                              className="rounded bg-emerald-500/25 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/40"
                            >
                              Admit
                            </button>
                            <button
                              type="button"
                              onClick={() => void hostAction('remove', w.userId)}
                              className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/35"
                            >
                              Deny
                            </button>
                          </div>
                        </div>
                      ))}
                      {/* Host -> Waiting Room Broadcast Message */}
                      <div className="flex gap-1.5 pt-1">
                        <input
                          value={waitingBroadcastDraft}
                          onChange={(e) => setWaitingBroadcastDraft(e.target.value)}
                          placeholder="Message waiting room..."
                          className="flex-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-white placeholder:text-white/40 outline-none"
                        />
                        <button
                          type="button"
                          disabled={!waitingBroadcastDraft.trim()}
                          onClick={() => {
                            void hostAction('waiting-room-message', undefined, {
                              message: waitingBroadcastDraft.trim(),
                            });
                            setWaitingBroadcastDraft('');
                          }}
                          className="rounded-lg bg-[#D4A843] px-2 py-1 text-[10px] font-bold text-slate-950 disabled:opacity-40"
                        >
                          <Megaphone className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Raised hands sorted automatically to top */}
                  {[...room.participants]
                    .filter((p) =>
                      participantSearch.trim()
                        ? p.fullName.toLowerCase().includes(participantSearch.trim().toLowerCase()) ||
                          (p.companyId ?? '').toLowerCase().includes(participantSearch.trim().toLowerCase())
                        : true,
                    )
                    .sort((a, b) => Number(b.handRaised) - Number(a.handRaised))
                    .map((p) => {
                      const isSelf = p.userId === currentUser.id;
                      const internApproved = (room.screenShareApprovedIds ?? []).includes(p.userId);
                      const isCoHost = (room.coHostIds ?? []).includes(p.userId);
                      const isHostPerson = p.userId === room.organizerId || p.fullName === room.organizerName;
                      const isSpot = room.spotlightUserId === p.userId;
                      return (
                        <div
                          key={p.userId}
                          className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#D4A843] to-[#9A7222] text-xs font-bold text-slate-950">
                                {getInitials(p.fullName)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-white">
                                  {formatParticipantDisplay(p)} {isSelf && '(You)'}
                                </p>
                                <p className="text-[10px] text-white/50">
                                  {p.isGuest ? 'GUEST' : p.role}
                                  {isHostPerson ? ' · Host' : isCoHost ? ' · Co-Host' : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {p.handRaised && (
                                <span title="Hand raised" className="text-amber-400">
                                  <Hand className="h-3.5 w-3.5" />
                                </span>
                              )}
                              <span className={p.micOn ? 'text-emerald-400' : 'text-rose-400'}>
                                {p.micOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                              </span>
                              <span className={p.camOn ? 'text-emerald-400' : 'text-white/35'}>
                                {p.camOn ? <Video className="h-3.5 w-3.5" /> : <CameraOff className="h-3.5 w-3.5" />}
                              </span>
                            </div>
                          </div>

                          {/* Action pills row */}
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            <button
                              type="button"
                              onClick={() => togglePinMainScreen(p.userId)}
                              className={cn(
                                'rounded px-1.5 py-0.5 text-[10px] font-semibold transition',
                                pinnedUserId === p.userId
                                  ? 'bg-[#D4A843] text-slate-950'
                                  : 'bg-white/10 text-white/75 hover:bg-white/20',
                              )}
                            >
                              {pinnedUserId === p.userId ? 'Pinned' : 'Pin'}
                            </button>
                            {isSelf && !isGuest && room.allowRenameSelf !== false && (
                              <button
                                type="button"
                                onClick={() => void renameSelf()}
                                className="inline-flex items-center gap-0.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/75 hover:bg-white/20"
                              >
                                <Edit3 className="h-2.5 w-2.5" /> Rename
                              </button>
                            )}
                            {canHostControl && (
                              <button
                                type="button"
                                onClick={() =>
                                  void hostAction('spotlight', isSpot ? undefined : p.userId)
                                }
                                className={cn(
                                  'rounded px-1.5 py-0.5 text-[10px] font-semibold transition',
                                  isSpot
                                    ? 'bg-[#D4A843] text-slate-950'
                                    : 'bg-white/10 text-amber-200 hover:bg-white/20',
                                )}
                              >
                                {isSpot ? 'Unspotlight' : 'Spotlight'}
                              </button>
                            )}
                            {canHostControl && !isSelf && (
                              p.micOn ? (
                                <button
                                  type="button"
                                  onClick={() => void hostMute(p.userId)}
                                  className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-500/35"
                                >
                                  Mute
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void hostAction('ask-unmute', p.userId)}
                                  className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/35"
                                >
                                  Ask Unmute
                                </button>
                              )
                            )}
                            {canHostControl && !isSelf && p.camOn && (
                              <button
                                type="button"
                                onClick={() => void hostAction('stop-video', p.userId)}
                                className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/30"
                              >
                                Stop Cam
                              </button>
                            )}
                            {isPrimaryHost && !isSelf && !p.isGuest && p.role !== 'INTERN' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void hostAction('toggle-cohost', p.userId)}
                                  className={cn(
                                    'rounded px-1.5 py-0.5 text-[10px] font-semibold transition',
                                    isCoHost
                                      ? 'bg-[#D4A843]/25 text-[#D4A843]'
                                      : 'bg-white/10 text-white/70 hover:bg-white/20',
                                  )}
                                >
                                  {isCoHost ? 'Co-Host ✓' : '+ Co-Host'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Transfer primary Host role to ${p.fullName}?`)) {
                                      void hostAction('transfer-host', p.userId);
                                    }
                                  }}
                                  className="inline-flex items-center gap-0.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/25"
                                >
                                  <Crown className="h-2.5 w-2.5" /> Make Host
                                </button>
                              </>
                            )}
                            {canHostControl && !isSelf && (p.role === 'INTERN' || p.isGuest) && (
                              internApproved ? (
                                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                                  Share OK
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void hostAction('approve-screenshare', p.userId)}
                                  className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300 hover:bg-sky-500/35"
                                >
                                  Allow Share
                                </button>
                              )
                            )}
                            {canHostControl && !isSelf && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = window.prompt(`Rename ${p.fullName}:`, p.fullName);
                                    if (next && next.trim().length >= 2) {
                                      void hostAction('rename', p.userId, { newName: next.trim() });
                                    }
                                  }}
                                  className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/20"
                                >
                                  Rename
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void hostAction('remove', p.userId)}
                                  title="Move to Waiting Room"
                                  className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/35"
                                >
                                  Remove
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
                <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                  {canHostControl && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="border-white/15 bg-white/10 text-[11px] text-white hover:bg-white/20"
                        onClick={() => void hostMute()}
                      >
                        <MicOff className="h-3.5 w-3.5" /> Mute All
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="border-white/15 bg-white/10 text-[11px] text-white hover:bg-white/20"
                        onClick={() => void hostAction('lower-all-hands')}
                      >
                        <Hand className="h-3.5 w-3.5" /> Lower Hands
                      </Button>
                    </div>
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

            {sideTab === 'polls' && (
              <PollsQaPanel
                polls={room.polls ?? []}
                qaItems={room.qaItems ?? []}
                currentUserId={currentUser.id}
                canHostControl={canHostControl}
                onCreatePoll={handleCreatePoll}
                onVotePoll={handleVotePoll}
                onClosePoll={handleClosePoll}
                onAskQuestion={handleAskQuestion}
                onUpvoteQuestion={handleUpvoteQuestion}
                onAnswerQuestion={handleAnswerQuestion}
              />
            )}

            {sideTab === 'chat' && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
                  {room.chatMessages.filter(
                    (msg) =>
                      !msg.recipientId ||
                      msg.senderId === currentUser.id ||
                      msg.recipientId === currentUser.id,
                  ).length === 0 ? (
                    <div className="mt-10 text-center text-xs text-white/45">
                      In-meeting messages appear here for everyone or as private direct messages.
                    </div>
                  ) : (
                    room.chatMessages
                      .filter(
                        (msg) =>
                          !msg.recipientId ||
                          msg.senderId === currentUser.id ||
                          msg.recipientId === currentUser.id,
                      )
                      .map((msg) => {
                        const isMine =
                          msg.senderId === currentUser.id || msg.senderName === currentUser.fullName;
                        return (
                          <div
                            key={msg.id}
                            className={cn('group flex flex-col', isMine ? 'items-end' : 'items-start')}
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
                              {msg.recipientId && (
                                <p className={cn(
                                  'mb-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                                  isMine ? 'bg-black/15 text-slate-900' : 'bg-sky-500/25 text-sky-300',
                                )}>
                                  Direct · {isMine ? `To ${msg.recipientName ?? 'Host'}` : 'Private to You'}
                                </p>
                              )}
                              {msg.replyPreview && (
                                <div className={cn(
                                  'mb-1.5 rounded-lg border-l-2 px-2 py-1 text-[10px]',
                                  isMine
                                    ? 'border-slate-900/50 bg-black/10 text-slate-900/80'
                                    : 'border-[#D4A843] bg-white/10 text-white/75',
                                )}>
                                  {msg.replyPreview}
                                </div>
                              )}
                              {msg.attachmentUrl && (
                                <div className="mb-1.5">
                                  {msg.attachmentUrl.startsWith('data:image/') ? (
                                    <a
                                      href={msg.attachmentUrl}
                                      download={msg.attachmentName || 'image.png'}
                                      className="block overflow-hidden rounded-xl border border-white/15"
                                    >
                                      <img
                                        src={msg.attachmentUrl}
                                        alt={msg.attachmentName || 'Attachment'}
                                        className="max-h-40 w-auto rounded-xl object-cover"
                                      />
                                    </a>
                                  ) : (
                                    <a
                                      href={msg.attachmentUrl}
                                      download={msg.attachmentName || 'attachment'}
                                      className="inline-flex items-center gap-1.5 rounded-lg bg-black/20 px-2.5 py-1 text-[11px] font-semibold underline"
                                    >
                                      <Download className="h-3 w-3" />
                                      <span className="max-w-[160px] truncate">
                                        {msg.attachmentName || 'Download file'}
                                      </span>
                                    </a>
                                  )}
                                </div>
                              )}
                              <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-[10px] text-white/35">
                              <span>
                                {new Date(msg.createdAt).toLocaleTimeString('en-LK', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setChatReplyTo(msg);
                                  if (msg.recipientId && msg.senderId && msg.senderId !== currentUser.id) {
                                    setChatRecipientId(msg.senderId);
                                  }
                                }}
                                className="opacity-70 transition hover:text-[#D4A843] hover:opacity-100"
                              >
                                Reply
                              </button>
                            </div>
                          </div>
                        );
                      })
                  )}
                  <div ref={chatBottomRef} />
                </div>
                <div className="border-t border-white/10 px-3 pt-2">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-white/50">To:</span>
                    <select
                      value={chatRecipientId}
                      onChange={(e) => setChatRecipientId(e.target.value)}
                      className="flex-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white focus:outline-none"
                    >
                      <option value="ALL" className="bg-[#0F1522]">Everyone in meeting</option>
                      {directMessageRecipients.map((h) => (
                        <option key={h.userId} value={h.userId} className="bg-[#0F1522]">
                          Direct: {h.fullName} ({h.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  {chatReplyTo && (
                    <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] text-white/80">
                      <span className="truncate">
                        Replying to <strong>{chatReplyTo.senderName}</strong>: {chatReplyTo.body}
                      </span>
                      <button
                        type="button"
                        onClick={() => setChatReplyTo(null)}
                        className="text-white/50 hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {chatAttachment && (
                    <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] text-white/80">
                      <span className="truncate">📎 {chatAttachment.name}</span>
                      <button
                        type="button"
                        onClick={() => setChatAttachment(null)}
                        className="text-white/50 hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
                {!canHostControl && (room.chatPermission === 'DISABLED' || room.suspendedActivities) ? (
                  <div className="border-t border-white/10 px-3 py-3 text-center text-xs text-rose-300">
                    Chat is currently disabled by the meeting host.
                  </div>
                ) : (
                <form
                  onSubmit={sendChat}
                  className="flex items-center gap-1.5 px-3 pb-3 pt-1"
                >
                  <input
                    ref={chatFileRef}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.txt,.zip"
                    className="hidden"
                    onChange={onPickChatFile}
                  />
                  <button
                    type="button"
                    onClick={() => chatFileRef.current?.click()}
                    title="Attach image or file"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                  </button>
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={
                      chatRecipientId === 'ALL' ? 'Message everyone...' : 'Direct private message...'
                    }
                    className="h-9 border-white/15 bg-white/5 text-xs text-white placeholder:text-white/40"
                  />
                  <Button type="submit" size="sm" variant="primary" className="h-9 px-3">
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </form>
                )}
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
                  {!isGuest && (
                    <Button
                      size="sm"
                      variant="primary"
                      className="flex-1"
                      disabled={savingNotes}
                      onClick={() => void saveNotes()}
                    >
                      {savingNotes ? 'Saving...' : 'Save Notes'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    title="Download Notes (.txt)"
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
                  {canHostControl && (
                    <Button
                      size="sm"
                      variant="secondary"
                      title="Export Attendance & Notes PDF"
                      className="border-white/15 bg-white/10 text-emerald-300 hover:bg-white/20"
                      onClick={() => void handleExportAttendancePdf()}
                    >
                      <FileDown className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ─── 1000% ZOOM DESKTOP × APPLE LIQUID GLASS BOTTOM CONTROL DOCK ─── */}
      <footer
        className={cn(
          'relative z-30 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] bg-[#0A0C11]/95 px-4 py-2 backdrop-blur-2xl transition-all duration-300',
          isFullscreen && controlsHidden && 'pointer-events-none h-0 overflow-hidden border-0 py-0 opacity-0',
        )}
      >
        {/* Left: Zoom Exact Split Audio & Video Controls (Icon Above Label + Up-Chevron) */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex items-stretch rounded-2xl border border-white/[0.06] bg-white/[0.03]">
            <button
              type="button"
              onClick={() => void toggleMic()}
              title="Mute / Unmute (Alt+A · Hold Space for Push-to-Talk)"
              className={cn(
                'flex min-w-[60px] flex-col items-center justify-center gap-1 rounded-l-2xl px-3 py-2 text-[11px] font-medium transition active:scale-95',
                micOn
                  ? 'text-white/90 hover:bg-white/[0.08]'
                  : 'bg-[#FF453A]/15 text-[#FF6961] hover:bg-[#FF453A]/25',
              )}
            >
              {micOn ? <Mic className="h-[18px] w-[18px]" /> : <MicOff className="h-[18px] w-[18px]" />}
              <span className="hidden text-[10px] tracking-tight sm:inline">{micOn ? 'Mute' : 'Unmute'}</span>
            </button>
            <button
              type="button"
              onClick={() => setDeviceMenu((m) => (m === 'mic' ? null : 'mic'))}
              title="Audio, Speaker & Mic Settings"
              className="flex items-center rounded-r-2xl border-l border-white/[0.06] px-1.5 text-white/55 transition hover:bg-white/[0.08] hover:text-white"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            {deviceMenu === 'mic' && (
              <div className="absolute bottom-16 left-0 z-50 max-h-[70vh] w-72 overflow-y-auto rounded-2xl border border-white/15 bg-[#121620]/95 p-2.5 shadow-2xl backdrop-blur-2xl">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/45">
                  Select a Microphone
                </p>
                {audioDevices.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-white/50">Default microphone</p>
                ) : (
                  audioDevices.map((d) => (
                    <button
                      key={d.deviceId}
                      type="button"
                      onClick={() => void switchDevice('audio', d.deviceId)}
                      className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-xs text-white hover:bg-white/10"
                    >
                      <span className="truncate">{d.label || 'Microphone'}</span>
                      {selectedMicId === d.deviceId && <Check className="h-3.5 w-3.5 text-[#30D158]" />}
                    </button>
                  ))
                )}

                <div className="my-2 border-t border-white/10" />
                <div className="flex items-center justify-between px-2 py-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                    Select a Speaker
                  </p>
                  <button
                    type="button"
                    onClick={() => void playSpeakerTestTone(selectedSpeakerId || undefined)}
                    className="rounded-lg bg-[#2D8CFF]/20 px-2 py-0.5 text-[10px] font-bold text-[#6BB0FF] hover:bg-[#2D8CFF]/30"
                  >
                    Test Speaker
                  </button>
                </div>
                {speakerDevices.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-white/50">System default speaker</p>
                ) : (
                  speakerDevices.map((d) => (
                    <button
                      key={d.deviceId}
                      type="button"
                      onClick={() => {
                        setSelectedSpeakerId(d.deviceId);
                        showToast(`Speaker switched to ${d.label || 'selected output'}.`);
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-xs text-white hover:bg-white/10"
                    >
                      <span className="truncate">{d.label || 'Speaker'}</span>
                      {selectedSpeakerId === d.deviceId && <Check className="h-3.5 w-3.5 text-[#30D158]" />}
                    </button>
                  ))
                )}

                <div className="my-2 border-t border-white/10" />
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/45">
                  Audio Processing
                </p>
                <div className="space-y-1 px-1 text-xs">
                  <label className="flex cursor-pointer items-center justify-between rounded-xl px-2 py-1 hover:bg-white/5">
                    <span>Noise Suppression</span>
                    <input
                      type="checkbox"
                      checked={!audioProfile.originalSound && audioProfile.noiseSuppression}
                      onChange={(e) =>
                        void updateAudioProfile({ noiseSuppression: e.target.checked, originalSound: false })
                      }
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between rounded-xl px-2 py-1 hover:bg-white/5">
                    <span>Echo Cancellation</span>
                    <input
                      type="checkbox"
                      checked={!audioProfile.originalSound && audioProfile.echoCancellation}
                      onChange={(e) =>
                        void updateAudioProfile({ echoCancellation: e.target.checked, originalSound: false })
                      }
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between rounded-xl px-2 py-1 hover:bg-white/5">
                    <span>Original Sound (Studio)</span>
                    <input
                      type="checkbox"
                      checked={audioProfile.originalSound}
                      onChange={(e) => void updateAudioProfile({ originalSound: e.target.checked })}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="relative flex items-stretch rounded-2xl border border-white/[0.06] bg-white/[0.03]">
            <button
              type="button"
              onClick={() => void toggleCam()}
              title="Start / Stop Video (Alt+V)"
              className={cn(
                'flex min-w-[68px] flex-col items-center justify-center gap-1 rounded-l-2xl px-3 py-2 text-[11px] font-medium transition active:scale-95',
                camOn
                  ? 'text-white/90 hover:bg-white/[0.08]'
                  : 'bg-[#FF453A]/15 text-[#FF6961] hover:bg-[#FF453A]/25',
              )}
            >
              {camOn ? <Camera className="h-[18px] w-[18px]" /> : <CameraOff className="h-[18px] w-[18px]" />}
              <span className="hidden text-[10px] tracking-tight sm:inline">
                {camOn ? 'Stop Video' : 'Start Video'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDeviceMenu((m) => (m === 'cam' ? null : 'cam'))}
              title="Camera & Virtual Background Settings"
              className="flex items-center rounded-r-2xl border-l border-white/[0.06] px-1.5 text-white/55 transition hover:bg-white/[0.08] hover:text-white"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            {deviceMenu === 'cam' && (
              <div className="absolute bottom-16 left-0 z-50 w-64 rounded-2xl border border-white/15 bg-[#121620]/95 p-2.5 shadow-2xl backdrop-blur-2xl">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/45">
                  Select a Camera
                </p>
                {videoDevices.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-white/50">Default camera</p>
                ) : (
                  videoDevices.map((d) => (
                    <button
                      key={d.deviceId}
                      type="button"
                      onClick={() => void switchDevice('video', d.deviceId)}
                      className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-xs text-white hover:bg-white/10"
                    >
                      <span className="truncate">{d.label || 'Camera'}</span>
                      {selectedCamId === d.deviceId && <Check className="h-3.5 w-3.5 text-[#30D158]" />}
                    </button>
                  ))
                )}
                <div className="my-2 border-t border-white/10" />
                <button
                  type="button"
                  onClick={() => {
                    setDeviceMenu(null);
                    setShowEffectsModal(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs font-semibold text-[#6BB0FF] hover:bg-white/10"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Choose Virtual Background...
                </button>
                <label className="mt-1 flex cursor-pointer items-center justify-between rounded-xl px-2 py-1 text-xs hover:bg-white/5">
                  <span>Mirror My Video</span>
                  <input
                    type="checkbox"
                    checked={mirrorVideo}
                    onChange={() => setMirrorVideo((v) => !v)}
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Center: Exact Zoom Icon-Above-Label Ergonomics */}
        <div className="flex flex-wrap items-center justify-center gap-1">
          {canHostControl && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSecurityMenu((v) => !v)}
                className={cn(
                  'flex min-w-[58px] flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-2 transition active:scale-95',
                  room.isLocked || room.suspendedActivities
                    ? 'bg-[#FF453A]/20 text-[#FF6961]'
                    : showSecurityMenu
                      ? 'bg-white/15 text-white'
                      : 'text-white/80 hover:bg-white/[0.08] hover:text-white',
                )}
              >
                <Shield className="h-[18px] w-[18px]" />
                <span className="hidden text-[10px] font-medium md:inline">Security</span>
              </button>
              {showSecurityMenu && (
                <SecurityPopover
                  room={room}
                  onUpdateSecurity={(p) => hostAction('update-security', undefined, p)}
                  onPanicSuspend={() => hostAction('panic-suspend')}
                  onClose={() => setShowSecurityMenu(false)}
                />
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setSideTab((s) => (s === 'participants' ? 'closed' : 'participants'))}
            title="Participants (Alt+U)"
            className={cn(
              'relative flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-2 transition active:scale-95',
              sideTab === 'participants'
                ? 'bg-white/15 text-white'
                : 'text-white/80 hover:bg-white/[0.08] hover:text-white',
            )}
          >
            <div className="relative">
              <Users className="h-[18px] w-[18px]" />
              <span className="absolute -right-3 -top-1.5 rounded-full bg-white/15 px-1 text-[9px] font-bold tabular-nums text-white">
                {room.participants.length}
              </span>
              {canHostControl && (room.waitingRoom?.length ?? 0) > 0 && (
                <span className="absolute -left-1.5 -top-1 h-2 w-2 rounded-full bg-amber-400" />
              )}
            </div>
            <span className="hidden text-[10px] font-medium md:inline">Participants</span>
          </button>

          <button
            type="button"
            onClick={() => setSideTab((s) => (s === 'chat' ? 'closed' : 'chat'))}
            title="Chat (Alt+H)"
            className={cn(
              'relative flex min-w-[54px] flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-2 transition active:scale-95',
              sideTab === 'chat'
                ? 'bg-white/15 text-white'
                : 'text-white/80 hover:bg-white/[0.08] hover:text-white',
            )}
          >
            <div className="relative">
              <MessagesSquare className="h-[18px] w-[18px]" />
              {unreadChat > 0 && (
                <span className="absolute -right-2.5 -top-1.5 rounded-full bg-[#FF453A] px-1.5 text-[9px] font-bold text-white">
                  {unreadChat}
                </span>
              )}
            </div>
            <span className="hidden text-[10px] font-medium md:inline">Chat</span>
          </button>

          {/* Zoom Signature Vibrant Emerald Share Screen */}
          <button
            type="button"
            onClick={() => void toggleScreenShare()}
            title="Share Screen (Alt+S)"
            className={cn(
              'flex min-w-[74px] flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 transition active:scale-95',
              screenOn
                ? 'bg-[#0EBA64] text-white shadow-[0_8px_22px_-4px_rgba(14,186,100,0.55)] hover:bg-[#12CC6F]'
                : 'bg-[#0EBA64]/12 text-[#2EE588] hover:bg-[#0EBA64]/20',
            )}
          >
            <MonitorUp className="h-[18px] w-[18px]" />
            <span className="hidden text-[10px] font-semibold sm:inline">
              {screenOn ? 'Stop Share' : isScreenShareLockedForSelf ? 'Request' : 'Share'}
            </span>
          </button>

          {/* Policy-gated Record with Pause/Resume */}
          {canRecord && (
            <div className="hidden items-center gap-0.5 md:flex">
              <button
                type="button"
                onClick={toggleRecording}
                className={cn(
                  'flex min-w-[56px] flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-2 transition active:scale-95',
                  recording
                    ? 'bg-[#FF453A]/20 text-[#FF6961]'
                    : 'text-white/80 hover:bg-white/[0.08] hover:text-white',
                )}
              >
                <Radio className={cn('h-[18px] w-[18px]', recording && !recordingPaused && 'animate-pulse')} />
                <span className="text-[10px] font-medium">{recording ? 'Stop Rec' : 'Record'}</span>
              </button>
              {recording && (
                <button
                  type="button"
                  onClick={togglePauseRecording}
                  title={recordingPaused ? 'Resume Recording' : 'Pause Recording'}
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-amber-300 hover:bg-white/[0.08]"
                >
                  {recordingPaused ? <Play className="h-[18px] w-[18px]" /> : <Pause className="h-[18px] w-[18px]" />}
                  <span className="text-[10px] font-medium">{recordingPaused ? 'Resume' : 'Pause'}</span>
                </button>
              )}
            </div>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowReactionTray((v) => !v)}
              title="Reactions & Raise Hand (Alt+Y)"
              className={cn(
                'flex min-w-[56px] flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-2 transition active:scale-95',
                handRaised
                  ? 'bg-amber-400/20 text-amber-300'
                  : 'text-white/80 hover:bg-white/[0.08] hover:text-white',
              )}
            >
              <Smile className="h-[18px] w-[18px]" />
              <span className="hidden text-[10px] font-medium md:inline">React</span>
            </button>
            {showReactionTray && (
              <div className="absolute bottom-16 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2 rounded-2xl border border-white/15 bg-[#121620]/95 p-2.5 shadow-2xl backdrop-blur-2xl">
                <div className="flex items-center gap-1">
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
            onClick={() => setSideTab((s) => (s === 'polls' ? 'closed' : 'polls'))}
            className={cn(
              'hidden min-w-[56px] flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-2 transition active:scale-95 lg:flex',
              sideTab === 'polls'
                ? 'bg-white/15 text-white'
                : 'text-white/80 hover:bg-white/[0.08] hover:text-white',
            )}
          >
            <BarChart3 className="h-[18px] w-[18px]" />
            <span className="text-[10px] font-medium">Polls</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setWhiteboardMode((m) => (m === 'whiteboard' ? 'closed' : 'whiteboard'))
            }
            className={cn(
              'hidden min-w-[66px] flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-2 transition active:scale-95 xl:flex',
              whiteboardMode === 'whiteboard'
                ? 'bg-[#2D8CFF]/25 text-[#6BB0FF]'
                : 'text-white/80 hover:bg-white/[0.08] hover:text-white',
            )}
          >
            <PenTool className="h-[18px] w-[18px]" />
            <span className="text-[10px] font-medium">Whiteboard</span>
          </button>

          <button
            type="button"
            onClick={() => setCaptionsOn((v) => !v)}
            title="Live Captions (Alt+C)"
            className={cn(
              'hidden min-w-[56px] flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-2 transition active:scale-95 xl:flex',
              captionsOn
                ? 'bg-[#30D158]/20 text-[#30D158]'
                : 'text-white/80 hover:bg-white/[0.08] hover:text-white',
            )}
          >
            <Captions className="h-[18px] w-[18px]" />
            <span className="text-[10px] font-medium">Captions</span>
          </button>

          {/* Zoom More (•••) Responsive Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreMenu((v) => !v)}
              title="More Zoom Tools"
              className={cn(
                'flex min-w-[52px] flex-col items-center justify-center gap-1 rounded-2xl px-2.5 py-2 transition active:scale-95',
                showMoreMenu
                  ? 'bg-white/15 text-white'
                  : 'text-white/80 hover:bg-white/[0.08] hover:text-white',
              )}
            >
              <MoreHorizontal className="h-[18px] w-[18px]" />
              <span className="hidden text-[10px] font-medium sm:inline">More</span>
            </button>
            {showMoreMenu && (
              <MoreToolsPopover
                canRecord={canRecord}
                recording={recording}
                recordingPaused={recordingPaused}
                notesOpen={sideTab === 'notes'}
                pollsOpen={sideTab === 'polls'}
                whiteboardOpen={whiteboardMode === 'whiteboard'}
                captionsOn={captionsOn}
                bandwidthSaver={bandwidthSaver}
                isFullscreen={isFullscreen}
                canHostControl={canHostControl}
                onToggleRecording={toggleRecording}
                onTogglePauseRecording={togglePauseRecording}
                onToggleNotes={() => setSideTab((s) => (s === 'notes' ? 'closed' : 'notes'))}
                onTogglePolls={() => setSideTab((s) => (s === 'polls' ? 'closed' : 'polls'))}
                onToggleWhiteboard={() =>
                  setWhiteboardMode((m) => (m === 'whiteboard' ? 'closed' : 'whiteboard'))
                }
                onToggleCaptions={() => setCaptionsOn((v) => !v)}
                onOpenBreakouts={() => setBreakoutModalOpen(true)}
                onOpenEffects={() => setShowEffectsModal(true)}
                onToggleBandwidthSaver={() => setBandwidthSaver((v) => !v)}
                onExportAttendancePdf={() => void handleExportAttendancePdf()}
                onOpenShortcuts={() => setShowShortcutsModal(true)}
                onOpenStats={() => setShowStatsModal(true)}
                onToggleFullscreen={() => void toggleFullscreen()}
                onClose={() => setShowMoreMenu(false)}
              />
            )}
          </div>
        </div>

        {/* Right: Authentic Zoom Crimson End / Leave Pill */}
        <div className="relative">
          <button
            type="button"
            onClick={() =>
              canHostControl ? setShowLeaveMenu((v) => !v) : void leaveCall(false)
            }
            className="flex h-10 items-center gap-1.5 rounded-xl bg-[#E53935] px-4 text-xs font-bold text-white shadow-[0_8px_20px_-4px_rgba(229,57,53,0.55)] transition hover:bg-[#F44336] active:scale-95"
          >
            <PhoneOff className="h-4 w-4" />
            <span>{canHostControl ? 'End' : 'Leave'}</span>
          </button>
          {showLeaveMenu && (
            <div className="absolute bottom-14 right-0 z-50 w-56 space-y-1.5 rounded-2xl border border-white/15 bg-[#121620]/95 p-2 shadow-2xl backdrop-blur-2xl">
              <button
                type="button"
                onClick={() => void leaveCall(true)}
                className="w-full rounded-xl bg-[#E53935] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#F44336]"
              >
                End Meeting for All
              </button>
              <button
                type="button"
                onClick={() => void leaveCall(false)}
                className="w-full rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                Leave Meeting
              </button>
            </div>
          )}
        </div>
      </footer>

      {/* ─── ZOOM PRO MODALS ─────────────────────────────────────────────── */}
      <BreakoutRoomsModal
        open={breakoutModalOpen}
        rooms={room.breakoutRooms ?? []}
        participants={room.participants}
        canHostControl={canHostControl}
        activeBreakoutId={activeBreakoutId}
        onConfigureOrOpen={handleConfigureOrOpenBreakouts}
        onBroadcast={handleBroadcastBreakouts}
        onCloseAll={handleCloseAllBreakouts}
        onJoinRoom={handleJoinBreakoutRoom}
        onLeaveRoom={handleLeaveBreakoutRoom}
        onClose={() => setBreakoutModalOpen(false)}
      />
      <VideoEffectsModal
        open={showEffectsModal}
        effect={videoEffect}
        mirrorVideo={mirrorVideo}
        hideSelfView={hideSelfView}
        hideNonVideo={hideNonVideo}
        touchUp={touchUp}
        onChangeEffect={setVideoEffect}
        onToggleMirror={() => setMirrorVideo((v) => !v)}
        onToggleHideSelf={() => setHideSelfView((v) => !v)}
        onToggleHideNonVideo={() => setHideNonVideo((v) => !v)}
        onToggleTouchUp={() => setTouchUp((v) => !v)}
        onClose={() => setShowEffectsModal(false)}
      />
      <KeyboardShortcutsModal
        open={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />
      <NetworkStatsModal
        open={showStatsModal}
        stats={networkStats}
        onClose={() => setShowStatsModal(false)}
      />
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
  onJoin: (opts: {
    micOn: boolean;
    camOn: boolean;
    micDeviceId?: string;
    camDeviceId?: string;
    speakerDeviceId?: string;
  }) => void;
}) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');
  const [selectedCamId, setSelectedCamId] = useState('');
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [deviceWarn, setDeviceWarn] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let current: MediaStream | null = null;

    async function setupPreview() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
      setDeviceWarn(null);
      try {
        current = await navigator.mediaDevices.getUserMedia({
          video: selectedCamId
            ? { deviceId: { exact: selectedCamId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
          audio: {
            ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {}),
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
              ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {}),
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
      current?.getAudioTracks().forEach((t) => {
        t.enabled = micOn;
      });
      current?.getVideoTracks().forEach((t) => {
        t.enabled = camOn;
      });
      setPreviewStream(current);

      if (navigator.mediaDevices?.enumerateDevices) {
        try {
          const all = await navigator.mediaDevices.enumerateDevices();
          if (!active) return;
          const mics = all.filter((d) => d.kind === 'audioinput');
          const speakers = all.filter((d) => d.kind === 'audiooutput');
          const cams = all.filter((d) => d.kind === 'videoinput');
          setAudioInputs(mics);
          setAudioOutputs(speakers);
          setVideoInputs(cams);
          if (!selectedMicId && mics[0]?.deviceId) setSelectedMicId(mics[0].deviceId);
          if (!selectedSpeakerId && speakers[0]?.deviceId) setSelectedSpeakerId(speakers[0].deviceId);
          if (!selectedCamId && cams[0]?.deviceId) setSelectedCamId(cams[0].deviceId);
        } catch {
          // Ignore device enumeration errors
        }
      }
    }

    void setupPreview();

    return () => {
      active = false;
      current?.getTracks().forEach((t) => t.stop());
    };
    // Re-capture preview when user switches selected mic or camera device before joining
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMicId, selectedCamId]);

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
    <div className="mx-auto max-w-5xl rounded-[28px] border border-white/10 bg-[#0b0d13]/95 p-6 text-white shadow-pop backdrop-blur-2xl md:p-8">
      <div className="grid gap-7 md:grid-cols-[1.45fr_1fr] md:items-center">
        {/* Live Camera Preview Box (Apple FaceTime + Zoom Pro) */}
        <div className="relative aspect-video overflow-hidden rounded-[22px] border border-white/10 bg-[#121622] shadow-card">
          {camOn && previewStream?.getVideoTracks().some((t) => t.readyState === 'live') ? (
            <VideoCanvas stream={previewStream} mirrored />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#192030] to-[#0b0d13]">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#D4A843] to-[#9A7222] font-display text-2xl font-bold text-slate-950 shadow-lg">
                {getInitials(userName)}
              </div>
              <p className="mt-3 text-xs font-medium text-white/60">Camera is off</p>
            </div>
          )}

          {/* Top-left live status pill */}
          <div className="absolute left-3.5 top-3.5 flex items-center gap-2 rounded-full bg-black/45 px-3 py-1 text-[11px] font-medium text-white/85 backdrop-blur-md">
            <span className={cn('h-2 w-2 rounded-full', micOn || camOn ? 'bg-emerald-400' : 'bg-white/40')} />
            <span>Pre-Join Check</span>
          </div>

          {/* Floating Apple Frosted Dock toggles */}
          <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={togglePreviewMic}
              className={cn(
                'flex h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold shadow-lg backdrop-blur-xl transition active:scale-95',
                micOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-rose-600 text-white hover:bg-rose-500',
              )}
              title={micOn ? 'Mute mic' : 'Unmute mic'}
            >
              {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              <span>{micOn ? 'Mic On' : 'Mic Off'}</span>
            </button>
            <button
              type="button"
              onClick={togglePreviewCam}
              className={cn(
                'flex h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold shadow-lg backdrop-blur-xl transition active:scale-95',
                camOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-rose-600 text-white hover:bg-rose-500',
              )}
              title={camOn ? 'Turn camera off' : 'Turn camera on'}
            >
              {camOn ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
              <span>{camOn ? 'Cam On' : 'Cam Off'}</span>
            </button>
          </div>
        </div>

        {/* Room Join Details & Device Selectors */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge tone="gold" className="w-fit">
              Room {roomCode}
            </Badge>
            <span className="text-[11px] font-medium text-white/50">Zoom + Apple Studio</span>
          </div>
          <div>
            <h3 className="font-display text-2xl font-bold tracking-tight text-white">{meetingTitle}</h3>
            <p className="mt-1 text-xs text-white/60">Hosted by {organizerName}</p>
          </div>

          {deviceWarn && (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
              {deviceWarn}
            </div>
          )}

          {/* Device Selection Card */}
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-xs text-white/80 backdrop-blur-md">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-semibold text-white/90">Microphone</span>
                <span className={micOn ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'}>
                  {micOn ? 'On' : 'Muted'}
                </span>
              </div>
              <select
                aria-label="Select Microphone"
                value={selectedMicId}
                onChange={(e) => setSelectedMicId(e.target.value)}
                className="h-9 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white focus:border-gold focus:outline-none"
              >
                {audioInputs.length === 0 ? (
                  <option value="">Default Microphone</option>
                ) : (
                  audioInputs.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Microphone ${idx + 1}`}
                    </option>
                  ))
                )}
              </select>
              {micOn && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all duration-100"
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-semibold text-white/90">Speaker Output</span>
                <button
                  type="button"
                  onClick={() => void playSpeakerTestTone(selectedSpeakerId || undefined)}
                  className="rounded-lg bg-[#D4A843]/20 px-2 py-0.5 text-[10px] font-bold text-[#D4A843] hover:bg-[#D4A843]/30"
                >
                  Test Speaker
                </button>
              </div>
              <select
                aria-label="Select Speaker"
                value={selectedSpeakerId}
                onChange={(e) => setSelectedSpeakerId(e.target.value)}
                className="h-9 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white focus:border-gold focus:outline-none"
              >
                {audioOutputs.length === 0 ? (
                  <option value="">System Default Speaker</option>
                ) : (
                  audioOutputs.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Speaker ${idx + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-semibold text-white/90">Camera</span>
                <span className={camOn ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'}>
                  {camOn ? 'On' : 'Off'}
                </span>
              </div>
              <select
                aria-label="Select Camera"
                value={selectedCamId}
                onChange={(e) => setSelectedCamId(e.target.value)}
                className="h-9 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-xs text-white focus:border-gold focus:outline-none"
              >
                {videoInputs.length === 0 ? (
                  <option value="">Default Camera</option>
                ) : (
                  videoInputs.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Camera ${idx + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              disabled={joining}
              onClick={() => {
                previewStream?.getTracks().forEach((t) => t.stop());
                onJoin({
                  micOn,
                  camOn,
                  micDeviceId: selectedMicId || undefined,
                  camDeviceId: selectedCamId || undefined,
                  speakerDeviceId: selectedSpeakerId || undefined,
                });
              }}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#2D8CFF] to-[#0E71EB] px-5 text-sm font-bold text-white shadow-[0_12px_28px_-6px_rgba(14,113,235,0.55)] ring-1 ring-inset ring-white/25 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
            >
              <Video className="h-4 w-4" /> {joining ? 'Connecting to Room...' : 'Join Meeting'}
            </button>
            <button
              type="button"
              onClick={() => {
                previewStream?.getTracks().forEach((t) => t.stop());
                onCancel();
              }}
              className="flex h-10 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              Cancel &amp; Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
