'use client';

import { useEffect, useRef } from 'react';
import { AlertOctagon, Check, Lock, Shield, Unlock } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { MeetingRow } from './meeting-types';

export function SecurityPopover({
  room,
  onUpdateSecurity,
  onPanicSuspend,
  onClose,
}: {
  room: MeetingRow;
  onUpdateSecurity: (patch: Record<string, unknown>) => Promise<void>;
  onPanicSuspend: () => Promise<void>;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape or on a click outside the popover and its Security toolbar button.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const wrapper = panelRef.current?.parentElement;
      if (wrapper && e.target instanceof Node && !wrapper.contains(e.target)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const toggleItems: Array<{
    key: string;
    label: string;
    active: boolean;
  }> = [
    { key: 'isLocked', label: 'Lock Meeting (No New Joiners)', active: Boolean(room.isLocked) },
    {
      key: 'waitingRoomEnabled',
      label: 'Enable Waiting Room',
      active: Boolean(room.waitingRoomEnabled),
    },
    { key: 'muteUponEntry', label: 'Mute Participants Upon Entry', active: Boolean(room.muteUponEntry) },
    {
      key: 'allowUnmuteSelf',
      label: 'Allow Participants to Unmute Self',
      active: room.allowUnmuteSelf !== false,
    },
    {
      key: 'allowStartVideo',
      label: 'Allow Participants to Start Video',
      active: room.allowStartVideo !== false,
    },
    {
      key: 'allowRenameSelf',
      label: 'Allow Participants to Rename Self',
      active: room.allowRenameSelf !== false,
    },
  ];

  return (
    <div ref={panelRef} className="absolute bottom-14 left-0 z-50 w-76 rounded-2xl border border-white/15 bg-[#141D2E] p-3 text-white shadow-2xl">
      <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#D4A843]">
          <Shield className="h-3.5 w-3.5" /> Meeting Security
        </span>
        {room.isLocked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
            <Lock className="h-2.5 w-2.5" /> Locked
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
            <Unlock className="h-2.5 w-2.5" /> Open
          </span>
        )}
      </div>

      <div className="space-y-1">
        {toggleItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => void onUpdateSecurity({ [item.key]: !item.active })}
            className="flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs text-white/90 transition hover:bg-white/10"
          >
            <span>{item.label}</span>
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded border',
                item.active
                  ? 'border-emerald-400 bg-emerald-500/25 text-emerald-300'
                  : 'border-white/25 text-transparent',
              )}
            >
              <Check className="h-3 w-3" />
            </span>
          </button>
        ))}
      </div>

      <div className="mt-2.5 space-y-2 border-t border-white/10 pt-2.5">
        <div>
          <label className="block px-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
            Screen Share Rule
          </label>
          <select
            value={room.screenShareMode ?? 'ALL'}
            onChange={(e) => void onUpdateSecurity({ screenShareMode: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs text-white outline-none"
          >
            <option value="ALL" className="bg-[#141D2E]">Everyone (Interns still request)</option>
            <option value="APPROVAL_REQUIRED" className="bg-[#141D2E]">Host Approval Required</option>
            <option value="HOST_ONLY" className="bg-[#141D2E]">Host &amp; Co-Host Only</option>
          </select>
        </div>

        <div>
          <label className="block px-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
            Chat Permission
          </label>
          <select
            value={room.chatPermission ?? 'EVERYONE_DM'}
            onChange={(e) => void onUpdateSecurity({ chatPermission: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs text-white outline-none"
          >
            <option value="EVERYONE_DM" className="bg-[#141D2E]">Everyone + Direct Messages</option>
            <option value="EVERYONE_PUBLIC" className="bg-[#141D2E]">Everyone Public Only (No DM)</option>
            <option value="HOST_ONLY" className="bg-[#141D2E]">Host &amp; Co-Host Only</option>
            <option value="DISABLED" className="bg-[#141D2E]">Chat Disabled</option>
          </select>
        </div>
      </div>

      <div className="mt-3 border-t border-white/10 pt-2.5">
        {room.suspendedActivities ? (
          <button
            type="button"
            onClick={() => {
              void onUpdateSecurity({
                suspendedActivities: false,
                isLocked: false,
                allowUnmuteSelf: true,
                allowStartVideo: true,
                chatPermission: 'EVERYONE_DM',
                screenShareMode: 'ALL',
              });
              onClose();
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"
          >
            Resume All Participant Activities
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  'Suspend ALL participant video, audio, screen share & chat and lock the meeting immediately?',
                )
              ) {
                void onPanicSuspend();
                onClose();
              }
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-500"
          >
            <AlertOctagon className="h-3.5 w-3.5" /> Suspend Participant Activities
          </button>
        )}
      </div>
    </div>
  );
}
