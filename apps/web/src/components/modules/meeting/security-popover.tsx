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
    { key: 'isLocked', label: 'Lock Studio (Block New Joiners)', active: Boolean(room.isLocked) },
    {
      key: 'waitingRoomEnabled',
      label: 'Enable Waiting Lounge',
      active: Boolean(room.waitingRoomEnabled),
    },
    { key: 'muteUponEntry', label: 'Mute Mics Upon Entry', active: Boolean(room.muteUponEntry) },
    {
      key: 'allowUnmuteSelf',
      label: 'Allow Unmuting Self',
      active: room.allowUnmuteSelf !== false,
    },
    {
      key: 'allowStartVideo',
      label: 'Allow Camera Video',
      active: room.allowStartVideo !== false,
    },
    {
      key: 'allowRenameSelf',
      label: 'Allow Display Name Edit',
      active: room.allowRenameSelf !== false,
    },
  ];

  return (
    <div
      ref={panelRef}
      className="liquid-glass-popover absolute bottom-16 left-0 z-50 w-80 rounded-[26px] p-4 text-white"
    >
      <div className="mb-2.5 flex items-center justify-between border-b border-white/10 pb-2.5">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#F5D06F]">
          <Shield className="h-3.5 w-3.5" /> Spatial Shield
        </span>
        {room.isLocked ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/35 bg-rose-500/20 px-2.5 py-0.5 text-[10px] font-bold text-rose-200">
            <Lock className="h-2.5 w-2.5" /> Locked
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-200">
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
            className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-xs text-white/90 transition hover:bg-white/10"
          >
            <span>{item.label}</span>
            <span
              className={cn(
                'flex h-4.5 w-4.5 items-center justify-center rounded-md border transition',
                item.active
                  ? 'border-[#F5D06F] bg-[#D4A843]/30 text-[#F5D06F] shadow-[0_0_10px_rgba(212,168,67,0.35)]'
                  : 'border-white/25 bg-white/5 text-transparent',
              )}
            >
              <Check className="h-3 w-3" />
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2.5 border-t border-white/10 pt-3">
        <div>
          <label className="block px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">
            Screen Presentation Access
          </label>
          <select
            value={room.screenShareMode ?? 'APPROVAL_REQUIRED'}
            onChange={(e) => void onUpdateSecurity({ screenShareMode: e.target.value })}
            className="mt-1 w-full rounded-2xl border border-white/15 bg-white/[0.07] px-3 py-2 text-xs text-white outline-none focus:border-[#D4A843]"
          >
            <option value="ALL" className="bg-[#121520]">Everyone (Interns request)</option>
            <option value="APPROVAL_REQUIRED" className="bg-[#121520]">Host Approval Required</option>
            <option value="HOST_ONLY" className="bg-[#121520]">Host &amp; Co-Host Only</option>
          </select>
        </div>

        <div>
          <label className="block px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">
            Spatial Chat Mode
          </label>
          <select
            value={room.chatPermission ?? 'EVERYONE_DM'}
            onChange={(e) => void onUpdateSecurity({ chatPermission: e.target.value })}
            className="mt-1 w-full rounded-2xl border border-white/15 bg-white/[0.07] px-3 py-2 text-xs text-white outline-none focus:border-[#D4A843]"
          >
            <option value="EVERYONE_DM" className="bg-[#121520]">Everyone + Private Whispers</option>
            <option value="EVERYONE_PUBLIC" className="bg-[#121520]">Public Room Feed Only</option>
            <option value="HOST_ONLY" className="bg-[#121520]">Host &amp; Co-Host Only</option>
            <option value="DISABLED" className="bg-[#121520]">Chat Muted</option>
          </select>
        </div>
      </div>

      <div className="mt-3.5 border-t border-white/10 pt-3">
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
                screenShareMode: 'APPROVAL_REQUIRED',
              });
              onClose();
            }}
            className="liquid-orb-gold flex w-full items-center justify-center gap-1.5 rounded-2xl px-3 py-2.5 text-xs font-bold"
          >
            Resume Studio Activities
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  'Freeze ALL participant video, audio, screen share & chat and lock the studio immediately?',
                )
              ) {
                void onPanicSuspend();
                onClose();
              }
            }}
            className="liquid-orb-ruby flex w-full items-center justify-center gap-1.5 rounded-2xl px-3 py-2.5 text-xs font-bold"
          >
            <AlertOctagon className="h-3.5 w-3.5" /> Freeze All Activities
          </button>
        )}
      </div>
    </div>
  );
}
