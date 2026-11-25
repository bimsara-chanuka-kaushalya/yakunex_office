'use client';

import { useState } from 'react';
import { DoorOpen, Megaphone, Plus, Shuffle, Trash2, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BreakoutRoomItem, MeetingParticipant } from './meeting-types';

export function BreakoutRoomsModal({
  open,
  rooms,
  participants,
  canHostControl,
  activeBreakoutId,
  onConfigureOrOpen,
  onBroadcast,
  onCloseAll,
  onJoinRoom,
  onLeaveRoom,
  onClose,
}: {
  open: boolean;
  rooms: BreakoutRoomItem[];
  participants: MeetingParticipant[];
  canHostControl: boolean;
  activeBreakoutId: string | null;
  onConfigureOrOpen: (
    action: 'configure' | 'open',
    rooms: Array<{ id?: string; name: string; participantIds: string[] }>,
    durationMinutes?: number,
  ) => Promise<void>;
  onBroadcast: (message: string) => Promise<void>;
  onCloseAll: () => Promise<void>;
  onJoinRoom: (room: BreakoutRoomItem) => Promise<void>;
  onLeaveRoom: () => Promise<void>;
  onClose: () => void;
}) {
  const [draftRooms, setDraftRooms] = useState<Array<{ id?: string; name: string; participantIds: string[] }>>(() =>
    rooms.length > 0
      ? rooms.map((r) => ({ id: r.id, name: r.name, participantIds: [...r.participantIds] }))
      : [
          { name: 'Room 1 — Engineering', participantIds: [] },
          { name: 'Room 2 — Product & QA', participantIds: [] },
        ],
  );
  const [durationMins, setDurationMins] = useState(15);
  const [broadcastText, setBroadcastText] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const anyActive = rooms.some((r) => r.active);

  const autoAssign = () => {
    if (draftRooms.length === 0) return;
    const cleared = draftRooms.map((r) => ({ ...r, participantIds: [] as string[] }));
    participants.forEach((p, idx) => {
      cleared[idx % cleared.length].participantIds.push(p.userId);
    });
    setDraftRooms(cleared);
  };

  const toggleAssign = (roomIdx: number, userId: string) => {
    setDraftRooms((prev) =>
      prev.map((r, idx) => {
        const without = r.participantIds.filter((id) => id !== userId);
        if (idx !== roomIdx) return { ...r, participantIds: without };
        const has = r.participantIds.includes(userId);
        return { ...r, participantIds: has ? without : [...without, userId] };
      }),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-md">
      <div className="liquid-glass-popover flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[30px] text-white">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="liquid-orb flex h-9 w-9 items-center justify-center rounded-2xl text-[#F5D06F]">
              <DoorOpen className="h-4.5 w-4.5" />
            </span>
            <div>
              <h3 className="font-display text-base font-semibold">Spatial Breakout Pods</h3>
              <p className="text-[11px] text-white/55">
                Split your studio into focused glass pods and reconvene in one tap.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="liquid-orb rounded-full p-1.5 text-white/70 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {anyActive ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200">
                <span>Breakout rooms are currently OPEN.</span>
                {activeBreakoutId && (
                  <Button size="sm" variant="secondary" onClick={() => void onLeaveRoom()}>
                    Return to Main Room
                  </Button>
                )}
              </div>

              {rooms.map((br) => (
                <div
                  key={br.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{br.name}</p>
                    <p className="text-[11px] text-white/55">
                      {br.participantIds.length} assigned · Code: {br.roomCode}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={activeBreakoutId === br.id ? 'secondary' : 'primary'}
                    onClick={() =>
                      activeBreakoutId === br.id ? void onLeaveRoom() : void onJoinRoom(br)
                    }
                  >
                    {activeBreakoutId === br.id ? 'Leave Breakout' : 'Join Room'}
                  </Button>
                </div>
              ))}

              {canHostControl && (
                <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                    Broadcast Message to All Breakout Rooms
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={broadcastText}
                      onChange={(e) => setBroadcastText(e.target.value)}
                      placeholder="e.g. 2 minutes remaining — wrap up your notes!"
                      className="flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-[#D4A843]"
                    />
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!broadcastText.trim() || busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await onBroadcast(broadcastText.trim());
                          setBroadcastText('');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Megaphone className="h-3.5 w-3.5" /> Broadcast
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : canHostControl ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="border-white/15 bg-white/10 text-white"
                    onClick={() =>
                      setDraftRooms((prev) => [
                        ...prev,
                        { name: `Room ${prev.length + 1}`, participantIds: [] },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Room
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="border-white/15 bg-white/10 text-white"
                    onClick={autoAssign}
                  >
                    <Shuffle className="h-3.5 w-3.5" /> Auto-Assign All
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-xs text-white/75">
                  Timer (mins):
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={durationMins}
                    onChange={(e) => setDurationMins(Number(e.target.value) || 15)}
                    className="w-16 rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-xs text-white"
                  />
                </label>
              </div>

              <div className="space-y-3">
                {draftRooms.map((r, rIdx) => (
                  <div
                    key={rIdx}
                    className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        value={r.name}
                        onChange={(e) =>
                          setDraftRooms((prev) =>
                            prev.map((item, idx) =>
                              idx === rIdx ? { ...item, name: e.target.value } : item,
                            ),
                          )
                        }
                        className="flex-1 rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs font-semibold text-white outline-none focus:border-[#D4A843]"
                      />
                      {draftRooms.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraftRooms((prev) => prev.filter((_, idx) => idx !== rIdx))
                          }
                          className="rounded-lg p-1.5 text-rose-300 hover:bg-rose-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {participants.map((p) => {
                        const assigned = r.participantIds.includes(p.userId);
                        return (
                          <button
                            key={p.userId}
                            type="button"
                            onClick={() => toggleAssign(rIdx, p.userId)}
                            className={
                              assigned
                                ? 'inline-flex items-center gap-1 rounded-full bg-[#D4A843]/25 px-2.5 py-0.5 text-[11px] font-semibold text-[#D4A843] ring-1 ring-[#D4A843]/60'
                                : 'inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] text-white/60 hover:bg-white/10 hover:text-white'
                            }
                          >
                            <Users className="h-2.5 w-2.5" /> {p.fullName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-10 text-center text-xs text-white/55">
              Waiting for the host to open breakout rooms.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3.5">
          {canHostControl && anyActive && (
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onCloseAll();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Close All Breakout Rooms
            </Button>
          )}
          {canHostControl && !anyActive && (
            <Button
              size="sm"
              variant="primary"
              disabled={busy || draftRooms.length === 0}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfigureOrOpen('open', draftRooms, durationMins);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Open All Breakout Rooms
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="border-white/15 bg-white/10 text-white"
            onClick={onClose}
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
