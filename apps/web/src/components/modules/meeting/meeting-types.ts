export interface MeetingParticipant {
  userId: string;
  companyId?: string | null;
  fullName: string;
  role: string;
  isGuest?: boolean;
  micOn: boolean;
  camOn: boolean;
  screenSharing: boolean;
  screenStreamId?: string | null;
  handRaised: boolean;
  breakoutRoomId?: string | null;
  joinedAt: string;
}

export interface MeetingChatMessage {
  id: string;
  senderId?: string;
  senderName: string;
  body: string;
  createdAt: string;
  replyToId?: string | null;
  replyPreview?: string | null;
  recipientId?: string | null;
  recipientName?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
}

export interface MeetingPollItem {
  id: string;
  question: string;
  multipleChoice: boolean;
  options: Array<{ id: string; label: string; votes: string[] }>;
  status: 'OPEN' | 'CLOSED';
  createdById: string;
  createdByName: string;
  createdAt: string;
}

export interface MeetingQaItem {
  id: string;
  authorId: string;
  authorName: string;
  question: string;
  upvoterIds: string[];
  answered: boolean;
  answerText?: string | null;
  answeredByName?: string | null;
  createdAt: string;
}

export interface BreakoutRoomItem {
  id: string;
  name: string;
  roomCode: string;
  participantIds: string[];
  active: boolean;
  endsAt?: string | null;
}

export interface MeetingAttendanceEntry {
  userId: string;
  fullName: string;
  companyId?: string | null;
  role: string;
  isGuest?: boolean;
  joinedAt: string;
  leftAt?: string | null;
  durationSec?: number;
}

export interface MeetingAccessPolicy {
  tier: string;
  rolesLabel: string;
  canCreate: boolean;
  createLabel: string;
  allowedScopes: string[];
  waitingRoomControl: string;
  waitingRoomLabel: string;
  canInviteExternal: boolean;
  recordingScope: 'ALL' | 'OWN' | 'NONE';
  externalAndRecordingLabel: string;
  screenShareRequiresApproval: boolean;
}

export interface MeetingRow {
  id: string;
  roomCode: string;
  projectId: string | null;
  projectName: string;
  organizerId?: string;
  organizerName: string;
  title: string;
  agenda: string;
  startsAt: string;
  endsAt: string;
  status: 'LIVE' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  meetingScope?: 'BOARD' | 'LEGAL' | 'DEPT' | 'PROJECT' | 'HR' | 'INTERNAL';
  attendeeCount: number;
  notes: string;
  participants: MeetingParticipant[];
  chatMessages: MeetingChatMessage[];
  waitingRoomEnabled?: boolean;
  waitingRoomMessage?: string | null;
  waitingRoom?: Array<{
    userId: string;
    fullName: string;
    companyId?: string | null;
    role: string;
    isGuest?: boolean;
    requestedAt: string;
  }>;
  screenShareApprovedIds?: string[];
  coHostIds?: string[];
  removedUserIds?: string[];
  allowedRoles?: string[];
  allowExternalGuests?: boolean;
  recordingAllowed?: boolean;
  passcode?: string | null;
  recurrence?: 'NONE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  isLocked?: boolean;
  suspendedActivities?: boolean;
  muteUponEntry?: boolean;
  allowUnmuteSelf?: boolean;
  allowStartVideo?: boolean;
  allowRenameSelf?: boolean;
  chatPermission?: 'EVERYONE_DM' | 'EVERYONE_PUBLIC' | 'HOST_ONLY' | 'DISABLED';
  screenShareMode?: 'ALL' | 'HOST_ONLY' | 'APPROVAL_REQUIRED';
  spotlightUserId?: string | null;
  recordingActive?: boolean;
  recordingByName?: string | null;
  polls?: MeetingPollItem[];
  qaItems?: MeetingQaItem[];
  breakoutRooms?: BreakoutRoomItem[];
  breakoutBroadcast?: { message: string; sentAt: string } | null;
  attendanceLog?: MeetingAttendanceEntry[];
}

export type VideoEffectMode = 'none' | 'blur-light' | 'blur-strong' | 'bg-yakunex' | 'bg-studio' | 'bg-slate';

export interface AudioProfileSettings {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  originalSound: boolean;
}

export interface WhiteboardStroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'line' | 'rect' | 'circle' | 'text' | 'sticky' | 'eraser';
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
  text?: string;
  authorName?: string;
}

export interface NetworkHealthStats {
  rttMs: number;
  bitrateKbps: number;
  packetLossPct: number;
  resolution: string;
  transport: 'LiveKit SFU' | 'WebRTC P2P';
  qualityLabel: 'Excellent' | 'Good' | 'Fair' | 'Weak';
  bars: 1 | 2 | 3 | 4;
}

export async function guestApiFetch<T>(
  path: string,
  guestToken: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'x-meeting-guest-token': guestToken,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      typeof body?.message === 'string'
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join(' ')
          : 'Request failed.';
    throw new Error(msg);
  }
  return body as T;
}
