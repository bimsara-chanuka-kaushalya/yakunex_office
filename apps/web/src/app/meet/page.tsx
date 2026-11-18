'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  MeetingStudio,
  PreJoinGreenRoom,
  type MeetingRow,
} from '@/components/modules/meeting-studio';
import { useAuth } from '@/components/providers';
import { api, post } from '@/lib/api';

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

  const [targetRoom, setTargetRoom] = useState<MeetingRow | null>(null);
  const [activeSession, setActiveSession] = useState<{
    room: MeetingRow;
    micOn: boolean;
    camOn: boolean;
    micDeviceId?: string;
    camDeviceId?: string;
  } | null>(null);
  const [waitingSession, setWaitingSession] = useState<{
    room: MeetingRow;
    micOn: boolean;
    camOn: boolean;
    micDeviceId?: string;
    camDeviceId?: string;
  } | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [authLoading, router, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;

    async function bootstrap() {
      setLoadingRoom(true);
      setError(null);
      try {
        if (autoJoin && roomParam) {
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
        }

        if (roomParam) {
          const list = await api<MeetingRow[]>('/meetings');
          const match = list.find(
            (m) => m.roomCode.toUpperCase() === roomParam || m.id.toUpperCase() === roomParam,
          );
          if (!match) {
            if (active) setError(`Meeting room "${roomParam}" was not found.`);
            return;
          }
          if (active) setTargetRoom(match);
          return;
        }

        if (!isInstant) {
          if (active) setError('No meeting room specified.');
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load meeting room.');
        }
      } finally {
        if (active) setLoadingRoom(false);
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [authLoading, autoJoin, initialCam, initialMic, isInstant, roomParam, user]);

  const handleConfirmJoin = async ({
    micOn,
    camOn,
    micDeviceId,
    camDeviceId,
  }: {
    micOn: boolean;
    camOn: boolean;
    micDeviceId?: string;
    camDeviceId?: string;
  }) => {
    setJoining(true);
    setError(null);
    try {
      let joined: MeetingRow;
      if (targetRoom) {
        joined = await post<MeetingRow>(`/meetings/${targetRoom.id}/join`, { micOn, camOn });
      } else if (roomParam) {
        joined = await post<MeetingRow>('/meetings/join-by-code', {
          roomCode: roomParam,
          micOn,
          camOn,
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
      const payload = { room: joined, micOn, camOn, micDeviceId, camDeviceId };
      if (inWaiting) setWaitingSession(payload);
      else setActiveSession(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to enter meeting room.');
    } finally {
      setJoining(false);
    }
  };

  const handleExit = () => {
    setActiveSession(null);
    if (typeof window !== 'undefined') {
      window.close();
      // Fallback if browser blocked window.close()
      setTimeout(() => {
        if (!window.closed) {
          router.replace('/meetings');
        }
      }, 200);
    }
  };

  useEffect(() => {
    if (!waitingSession || !user) return;
    let active = true;
    const pollId = setInterval(async () => {
      try {
        const list = await api<MeetingRow[]>('/meetings');
        const fresh = list.find((m) => m.id === waitingSession.room.id);
        if (!fresh || !active) return;
        if (fresh.participants.some((p) => p.userId === user.id)) {
          setActiveSession({ ...waitingSession, room: fresh });
          setWaitingSession(null);
        } else if (!(fresh.waitingRoom ?? []).some((w) => w.userId === user.id)) {
          setWaitingSession(null);
          setError('Host declined or removed your waiting room request.');
        }
      } catch {
        // retry on next tick
      }
    }, 2500);
    return () => {
      active = false;
      clearInterval(pollId);
    };
  }, [waitingSession, user]);

  if (authLoading || !user || loadingRoom) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#070B12] text-sm text-white/75">
        Connecting to Yakunex Meeting Studio...
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
    return (
      <MeetingStudio
        standalone
        initialRoom={activeSession.room}
        initialMicOn={activeSession.micOn}
        initialCamOn={activeSession.camOn}
        initialMicId={activeSession.micDeviceId}
        initialCamId={activeSession.camDeviceId}
        currentUser={{
          id: user.id,
          companyId: user.companyId ?? null,
          fullName: user.fullName ?? 'You',
          role: user.role ?? 'STAFF',
        }}
        onExited={handleExit}
      />
    );
  }

  if (error && !targetRoom && !isInstant) {
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

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-[#070B12] p-4">
      <div className="w-full max-w-4xl space-y-4">
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
            {error}
          </div>
        )}
        <PreJoinGreenRoom
          meetingTitle={targetRoom?.title ?? (titleParam || `${user.fullName}'s Instant Meeting`)}
          roomCode={targetRoom?.roomCode ?? (roomParam || 'NEW ROOM')}
          organizerName={targetRoom?.organizerName ?? user.fullName}
          userName={user.companyId ? `${user.fullName.trim().split(/\s+/).pop() || user.fullName} · ${user.companyId}` : user.fullName}
          joining={joining}
          onCancel={handleExit}
          onJoin={handleConfirmJoin}
        />
      </div>
    </div>
  );
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
