'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Globe, Lock, Megaphone, Shield, Video } from 'lucide-react';
import {
  MeetingStudio,
  PreJoinGreenRoom,
  type MeetingRow,
} from '@/components/modules/meeting-studio';
import {
  guestApiFetch,
  type MeetingAccessPolicy,
} from '@/components/modules/meeting/meeting-types';
import { useAuth } from '@/components/providers';
import { ApiError, api, liveGet, post } from '@/lib/api';

interface PublicMeetingMeta {
  id: string;
  roomCode: string;
  title: string;
  agenda: string;
  organizerName: string;
  status: string;
  allowExternalGuests: boolean;
  requiresPasscode: boolean;
  waitingRoomEnabled: boolean;
  isLocked: boolean;
}

function StandaloneMeetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, status } = useAuth();
  const authLoading = status === 'loading';

  const roomParam = searchParams.get('room')?.trim().toUpperCase() ?? '';
  const isInstant = searchParams.get('instant') === '1';
  const autoJoin = searchParams.get('autojoin') === '1';
  const titleParam = searchParams.get('title')?.trim() ?? '';
  const initialMic = searchParams.get('mic') !== 'false';
  const initialCam = searchParams.get('cam') !== 'false';
  const initialMicId = searchParams.get('micId') ?? '';
  const initialCamId = searchParams.get('camId') ?? '';

  const [policy, setPolicy] = useState<MeetingAccessPolicy | null>(null);
  const [targetRoom, setTargetRoom] = useState<MeetingRow | null>(null);
  const [publicMeta, setPublicMeta] = useState<PublicMeetingMeta | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestReadyForPreJoin, setGuestReadyForPreJoin] = useState(false);
  const [guestSession, setGuestSession] = useState<{
    token: string;
    user: { id: string; companyId?: string | null; fullName: string; role: string };
  } | null>(null);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeNeeded, setPasscodeNeeded] = useState(false);

  const [activeSession, setActiveSession] = useState<{
    room: MeetingRow;
    micOn: boolean;
    camOn: boolean;
    micDeviceId?: string;
    camDeviceId?: string;
    speakerDeviceId?: string;
  } | null>(null);
  const [waitingSession, setWaitingSession] = useState<{
    room: MeetingRow;
    micOn: boolean;
    camOn: boolean;
    micDeviceId?: string;
    camDeviceId?: string;
    speakerDeviceId?: string;
  } | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If unauthenticated: check whether room allows External Guests before redirecting to /login
  useEffect(() => {
    if (authLoading || user) return;
    let active = true;

    async function checkPublicGuestAccess() {
      if (!roomParam) {
        const next = `${window.location.pathname}${window.location.search}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      setLoadingRoom(true);
      try {
        const res = await fetch(`/api/meetings/public/${encodeURIComponent(roomParam)}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          const next = `${window.location.pathname}${window.location.search}`;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
          return;
        }
        const meta = (await res.json()) as PublicMeetingMeta;
        if (active) {
          setPublicMeta(meta);
          setPasscodeNeeded(Boolean(meta.requiresPasscode));
          setLoadingRoom(false);
        }
      } catch {
        const next = `${window.location.pathname}${window.location.search}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      }
    }

    void checkPublicGuestAccess();
    return () => {
      active = false;
    };
  }, [authLoading, roomParam, router, user]);

  // Authenticated bootstrap
  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;

    async function bootstrap() {
      setLoadingRoom(true);
      setError(null);
      try {
        const pol = await api<MeetingAccessPolicy>('/meetings/access-policy').catch(() => null);
        if (active && pol) setPolicy(pol);

        if (autoJoin && roomParam) {
          try {
            const joined = await post<MeetingRow>('/meetings/join-by-code', {
              roomCode: roomParam,
              micOn: initialMic,
              camOn: initialCam,
            });
            if (active) {
              const inWaiting =
                !joined.participants.some((p) => p.userId === user!.id) &&
                (joined.waitingRoom ?? []).some((w) => w.userId === user!.id);
              const payload = {
                room: joined,
                micOn: initialMic,
                camOn: initialCam,
                micDeviceId: initialMicId || undefined,
                camDeviceId: initialCamId || undefined,
              };
              if (inWaiting) setWaitingSession(payload);
              else setActiveSession(payload);
            }
            return;
          } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            if (msg.includes('PASSCODE_REQUIRED')) {
              if (active) setPasscodeNeeded(true);
            } else {
              throw err;
            }
          }
        }

        if (roomParam) {
          let match: MeetingRow | undefined;
          try {
            match = await liveGet<MeetingRow>(`/meetings/by-code/${encodeURIComponent(roomParam)}`);
          } catch {
            const list = await liveGet<MeetingRow[]>('/meetings');
            match = list.find(
              (m) => m.roomCode.toUpperCase() === roomParam || m.id.toUpperCase() === roomParam,
            );
          }
          if (!match) {
            if (active) setError(`Meeting room "${roomParam}" was not found.`);
            return;
          }
          if (active) {
            setTargetRoom(match);
            const isHostOrAdmin =
              match.organizerId === user!.id ||
              (!match.organizerId && match.organizerName === user!.fullName) ||
              user!.role === 'SUPER_ADMIN' ||
              user!.role === 'ADMIN' ||
              user!.role === 'PROJECT_MANAGER' ||
              (match.coHostIds ?? []).includes(user!.id);
            if (match.status === 'CANCELLED' || (match.status === 'COMPLETED' && !isHostOrAdmin)) {
              setError(match.status === 'CANCELLED' ? 'This meeting was cancelled.' : 'This meeting has ended.');
              return;
            }
            if ((match.hasPasscode ?? Boolean(match.passcode)) && !isHostOrAdmin) {
              setPasscodeNeeded(true);
            }
          }
          return;
        }

        if (isInstant && user!.role === 'INTERN') {
          if (active) setError('Interns have Join-Only meeting access and cannot start instant meetings.');
          return;
        }

        if (!isInstant) {
          if (active) setError('No meeting room specified.');
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? cleanMeetingError(err.message) : 'Unable to load meeting room.');
        }
      } finally {
        if (active) setLoadingRoom(false);
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [authLoading, autoJoin, initialCam, initialCamId, initialMic, initialMicId, isInstant, roomParam, user]);

  const handleConfirmJoin = async ({
    micOn,
    camOn,
    micDeviceId,
    camDeviceId,
    speakerDeviceId,
  }: {
    micOn: boolean;
    camOn: boolean;
    micDeviceId?: string;
    camDeviceId?: string;
    speakerDeviceId?: string;
  }) => {
    setJoining(true);
    setError(null);
    try {
      // Guest public join flow
      if (!user && publicMeta) {
        const res = await fetch(`/api/meetings/public/${encodeURIComponent(publicMeta.roomCode)}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: guestName.trim(),
            passcode: passcodeInput.trim() || undefined,
            micOn,
            camOn,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = typeof data?.message === 'string' ? data.message : 'Unable to join meeting as guest.';
          if (msg.includes('PASSCODE_REQUIRED')) setPasscodeNeeded(true);
          throw new Error(cleanMeetingError(msg));
        }
        setGuestSession({ token: data.guestToken, user: data.guestUser });
        const joined = data.room as MeetingRow;
        const inWaiting =
          !joined.participants.some((p) => p.userId === data.guestUser.id) &&
          (joined.waitingRoom ?? []).some((w) => w.userId === data.guestUser.id);
        const payload = { room: joined, micOn, camOn, micDeviceId, camDeviceId, speakerDeviceId };
        if (inWaiting) setWaitingSession(payload);
        else setActiveSession(payload);
        return;
      }

      // Authenticated Yakunex join flow
      let joined: MeetingRow;
      if (targetRoom) {
        joined = await post<MeetingRow>(`/meetings/${targetRoom.id}/join`, {
          micOn,
          camOn,
          passcode: passcodeInput.trim() || undefined,
        });
      } else if (roomParam) {
        joined = await post<MeetingRow>('/meetings/join-by-code', {
          roomCode: roomParam,
          micOn,
          camOn,
          passcode: passcodeInput.trim() || undefined,
        });
      } else {
        joined = await post<MeetingRow>('/meetings', {
          title: titleParam || `${user?.fullName ?? 'Team'}'s Instant Meeting`,
          agenda: 'Live video sync & screen share huddle',
          instant: true,
          micOn,
          camOn,
        });
      }
      const inWaiting =
        Boolean(user) &&
        !joined.participants.some((p) => p.userId === user!.id) &&
        (joined.waitingRoom ?? []).some((w) => w.userId === user!.id);
      const payload = { room: joined, micOn, camOn, micDeviceId, camDeviceId, speakerDeviceId };
      if (inWaiting) setWaitingSession(payload);
      else setActiveSession(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to enter meeting room.';
      if (msg.includes('PASSCODE_REQUIRED')) setPasscodeNeeded(true);
      setError(cleanMeetingError(msg));
      // The error banner sits at the top; on small screens the Join button is far below it.
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setJoining(false);
    }
  };

  const handleExit = () => {
    setActiveSession(null);
    setWaitingSession(null);
    if (typeof window !== 'undefined') {
      window.close();
      setTimeout(() => {
        if (!window.closed) {
          router.replace(user ? '/meetings' : '/login');
        }
      }, 200);
    }
  };

  // Waiting Room live polling (supports both authenticated users & external guests + live Host broadcast messages)
  useEffect(() => {
    const activeUserId = user?.id ?? guestSession?.user.id;
    if (!waitingSession || !activeUserId) return;
    let active = true;
    const pollId = setInterval(async () => {
      try {
        let fresh: MeetingRow | undefined;
        if (guestSession) {
          fresh = await guestApiFetch<MeetingRow>(
            `/meetings/public/${waitingSession.room.id}/room`,
            guestSession.token,
          );
        } else {
          fresh = await liveGet<MeetingRow>(`/meetings/${waitingSession.room.id}/room`);
        }
        if (!fresh || !active) return;
        if (fresh.status === 'COMPLETED' || fresh.status === 'CANCELLED') {
          setWaitingSession(null);
          setError(fresh.status === 'CANCELLED' ? 'This meeting was cancelled.' : 'This meeting has ended.');
        } else if (fresh.participants.some((p) => p.userId === activeUserId)) {
          setActiveSession({ ...waitingSession, room: fresh });
          setWaitingSession(null);
        } else if (!(fresh.waitingRoom ?? []).some((w) => w.userId === activeUserId)) {
          setWaitingSession(null);
          setError('Host declined or removed your waiting room request.');
        } else if (fresh.waitingRoomMessage !== waitingSession.room.waitingRoomMessage) {
          setWaitingSession((prev) => (prev ? { ...prev, room: fresh! } : null));
        }
      } catch (err) {
        if (!active) return;
        // 403 = no longer in the waiting room (declined/removed): stop waiting instead of retrying forever.
        const forbidden =
          (err instanceof ApiError && err.status === 403) ||
          (err instanceof Error && /not a participant/i.test(err.message));
        if (forbidden) {
          setWaitingSession(null);
          setError('Host declined or removed your waiting room request.');
        }
        // Anything else (network blip on 3G): retry on the next tick.
      }
    }, 2000);
    return () => {
      active = false;
      clearInterval(pollId);
    };
  }, [waitingSession, user, guestSession]);

  if (authLoading || loadingRoom) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#070B12] text-sm text-white/75">
        Connecting to Yakunex Meeting Studio...
      </div>
    );
  }

  // External Guest Entry Screen (before Pre-Join)
  if (!user && publicMeta && !guestReadyForPreJoin && !activeSession && !waitingSession) {
    const onGuestContinue = (e: FormEvent) => {
      e.preventDefault();
      if (guestName.trim().length < 2) {
        setError('Please enter your name (at least 2 characters).');
        return;
      }
      if (publicMeta.requiresPasscode && !passcodeInput.trim()) {
        setError('Please enter the meeting passcode.');
        return;
      }
      setError(null);
      setGuestReadyForPreJoin(true);
    };

    return (
      <div className="flex min-h-screen w-screen items-center justify-center bg-[#070B12] p-4 text-white">
        <form
          onSubmit={onGuestContinue}
          className="w-full max-w-md space-y-5 rounded-3xl border border-white/10 bg-[#0F1522] p-7 shadow-2xl"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D4A843]/15 text-[#D4A843]">
              <Globe className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#D4A843]">
                Yakunex Hub Meet · External Guest Access
              </p>
              <h1 className="font-display text-lg font-semibold">{publicMeta.title}</h1>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70">
            <p>
              Host: <strong className="text-white">{publicMeta.organizerName}</strong> · Room:{' '}
              <span className="font-mono text-[#D4A843]">{publicMeta.roomCode}</span>
            </p>
            {publicMeta.waitingRoomEnabled && (
              <p className="mt-1 flex items-center gap-1 text-amber-300">
                <Shield className="h-3.5 w-3.5" /> Waiting Room enabled — Host will admit you.
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/75">
                Your Full Name
              </label>
              <input
                required
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="e.g. Kasun Perera (Client)"
                className="w-full rounded-xl border border-white/15 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[#D4A843] focus:outline-none"
              />
            </div>

            {publicMeta.requiresPasscode && (
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-white/75">
                  <Lock className="h-3 w-3 text-[#D4A843]" /> Meeting Passcode
                </label>
                <input
                  required
                  value={passcodeInput}
                  onChange={(e) => setPasscodeInput(e.target.value)}
                  placeholder="Enter passcode from invite"
                  className="w-full rounded-xl border border-white/15 bg-black/30 px-3.5 py-2.5 font-mono text-sm text-white placeholder:text-white/35 focus:border-[#D4A843] focus:outline-none"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={publicMeta.isLocked}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4A843] px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-[#e5ba52] disabled:opacity-50"
          >
            <Video className="h-4 w-4" />
            {publicMeta.isLocked ? 'Meeting Locked by Host' : 'Continue to Camera & Mic Preview'}
          </button>

          <p className="text-center text-[11px] text-white/45">
            Yakunex employee?{' '}
            <button
              type="button"
              onClick={() =>
                router.replace(`/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`)
              }
              className="font-semibold text-[#D4A843] hover:underline"
            >
              Sign in with company account
            </button>
          </p>
        </form>
      </div>
    );
  }

  if (waitingSession) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#070B12] p-6 text-center text-white">
        <div className="w-full max-w-md space-y-4 rounded-3xl border border-white/10 bg-[#0F1522] p-8 shadow-2xl">
          <div className="mx-auto flex h-14 w-14 animate-pulse items-center justify-center rounded-full border border-[#D4A843]/40 bg-[#D4A843]/15 text-[#D4A843]">
            <span className="h-3 w-3 rounded-full bg-[#D4A843]" />
          </div>
          <h2 className="font-display text-xl font-semibold">Waiting Room</h2>
          <p className="text-sm text-white/70">
            Please wait — the host of <strong>{waitingSession.room.title}</strong> will admit you shortly.
          </p>
          {waitingSession.room.waitingRoomMessage && (
            <div className="rounded-2xl border border-[#D4A843]/35 bg-[#D4A843]/10 p-3 text-left text-xs text-amber-100">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#D4A843]">
                <Megaphone className="h-3.5 w-3.5" /> Message from Host
              </p>
              <p className="mt-1">{waitingSession.room.waitingRoomMessage}</p>
            </div>
          )}
          <p className="font-mono text-xs text-white/45">Room: {waitingSession.room.roomCode}</p>
          <button
            type="button"
            onClick={handleExit}
            className="mt-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
          >
            Leave Waiting Room
          </button>
        </div>
      </div>
    );
  }

  if (activeSession) {
    const currentActor = user
      ? {
          id: user.id,
          companyId: user.companyId ?? null,
          fullName: user.fullName ?? 'You',
          role: user.role ?? 'STAFF',
        }
      : guestSession!.user;

    return (
      <MeetingStudio
        standalone
        initialRoom={activeSession.room}
        initialMicOn={activeSession.micOn}
        initialCamOn={activeSession.camOn}
        initialMicId={activeSession.micDeviceId}
        initialCamId={activeSession.camDeviceId}
        initialSpeakerId={activeSession.speakerDeviceId}
        policy={policy}
        guestToken={guestSession?.token ?? null}
        currentUser={currentActor}
        onMovedToWaitingRoom={(updatedRoom) => {
          setWaitingSession({
            room: updatedRoom,
            micOn: activeSession.micOn,
            camOn: activeSession.camOn,
            micDeviceId: activeSession.micDeviceId,
            camDeviceId: activeSession.camDeviceId,
            speakerDeviceId: activeSession.speakerDeviceId,
          });
          setActiveSession(null);
        }}
        onExited={handleExit}
      />
    );
  }

  if (error && !targetRoom && !publicMeta && (!isInstant || user?.role === 'INTERN')) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#070B12] p-6 text-center text-white">
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
        <button
          type="button"
          onClick={handleExit}
          className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
        >
          Back to Meetings
        </button>
      </div>
    );
  }

  const displayName = user
    ? user.companyId
      ? `${user.fullName.trim().split(/\s+/).pop() || user.fullName} · ${user.companyId}`
      : user.fullName
    : `${guestName.trim() || 'Guest'} (Guest)`;

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-[#070B12] p-4">
      <div className="w-full max-w-4xl space-y-4">
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
            {error}
          </div>
        )}
        {passcodeNeeded && user && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#D4A843]/35 bg-[#0F1522] px-4 py-3 text-white">
            <Lock className="h-4 w-4 text-[#D4A843]" />
            <span className="text-xs font-semibold">This meeting requires a passcode:</span>
            <input
              value={passcodeInput}
              onChange={(e) => setPasscodeInput(e.target.value)}
              placeholder="Enter passcode"
              className="flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-1.5 font-mono text-xs text-white focus:border-[#D4A843] focus:outline-none"
            />
          </div>
        )}
        <PreJoinGreenRoom
          meetingTitle={
            targetRoom?.title ??
            publicMeta?.title ??
            (titleParam || `${user?.fullName ?? 'Team'}'s Instant Meeting`)
          }
          roomCode={targetRoom?.roomCode ?? publicMeta?.roomCode ?? (roomParam || 'NEW ROOM')}
          organizerName={targetRoom?.organizerName ?? publicMeta?.organizerName ?? user?.fullName ?? 'Host'}
          userName={displayName}
          joining={joining}
          onCancel={handleExit}
          onJoin={handleConfirmJoin}
        />
      </div>
    </div>
  );
}

/** Server errors carry machine prefixes (PASSCODE_REQUIRED:, MEETING_ENDED:, INTERNAL_ONLY:) – hide them from people. */
function cleanMeetingError(msg: string): string {
  return msg.replace(/^(PASSCODE_REQUIRED|MEETING_ENDED|INTERNAL_ONLY):\s*/, '').trim();
}

export default function StandaloneMeetPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-[#070B12] text-sm text-white/75">
          Loading Meeting Studio...
        </div>
      }
    >
      <StandaloneMeetContent />
    </Suspense>
  );
}
