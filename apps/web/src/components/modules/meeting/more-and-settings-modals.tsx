'use client';

import {
  Activity,
  BarChart3,
  Captions,
  Check,
  DoorOpen,
  FileDown,
  FileText,
  Keyboard,
  Maximize2,
  Minimize2,
  PenTool,
  Radio,
  Sparkles,
  Wifi,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { NetworkHealthStats, VideoEffectMode } from './meeting-types';

export function MoreToolsPopover({
  canRecord,
  recording,
  recordingPaused,
  notesOpen,
  pollsOpen,
  whiteboardOpen,
  captionsOn,
  bandwidthSaver,
  isFullscreen,
  canHostControl,
  onToggleRecording,
  onTogglePauseRecording,
  onToggleNotes,
  onTogglePolls,
  onToggleWhiteboard,
  onToggleCaptions,
  onOpenBreakouts,
  onOpenEffects,
  onToggleBandwidthSaver,
  onExportAttendancePdf,
  onOpenShortcuts,
  onOpenStats,
  onToggleFullscreen,
  onClose,
}: {
  canRecord: boolean;
  recording: boolean;
  recordingPaused: boolean;
  notesOpen: boolean;
  pollsOpen: boolean;
  whiteboardOpen: boolean;
  captionsOn: boolean;
  bandwidthSaver: boolean;
  isFullscreen: boolean;
  canHostControl: boolean;
  onToggleRecording: () => void;
  onTogglePauseRecording: () => void;
  onToggleNotes: () => void;
  onTogglePolls: () => void;
  onToggleWhiteboard: () => void;
  onToggleCaptions: () => void;
  onOpenBreakouts: () => void;
  onOpenEffects: () => void;
  onToggleBandwidthSaver: () => void;
  onExportAttendancePdf: () => void;
  onOpenShortcuts: () => void;
  onOpenStats: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
}) {
  const act = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <div className="absolute bottom-14 right-0 z-50 w-64 rounded-2xl border border-white/15 bg-[#141D2E] p-2 text-white shadow-2xl">
      <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/45">
        Zoom Pro Tools
      </p>
      <div className="space-y-0.5 text-xs">
        <button
          type="button"
          onClick={() => act(onTogglePolls)}
          className={cn(
            'flex w-full items-center justify-between rounded-xl px-2.5 py-2 hover:bg-white/10',
            pollsOpen && 'bg-[#D4A843]/20 text-[#D4A843]',
          )}
        >
          <span className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Polls &amp; Q&amp;A
          </span>
          {pollsOpen && <Check className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={() => act(onToggleWhiteboard)}
          className={cn(
            'flex w-full items-center justify-between rounded-xl px-2.5 py-2 hover:bg-white/10',
            whiteboardOpen && 'bg-[#D4A843]/20 text-[#D4A843]',
          )}
        >
          <span className="flex items-center gap-2">
            <PenTool className="h-4 w-4" /> Whiteboard
          </span>
          {whiteboardOpen && <Check className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={() => act(onToggleCaptions)}
          className={cn(
            'flex w-full items-center justify-between rounded-xl px-2.5 py-2 hover:bg-white/10',
            captionsOn && 'bg-emerald-500/20 text-emerald-300',
          )}
        >
          <span className="flex items-center gap-2">
            <Captions className="h-4 w-4" /> Live Captions (CC)
          </span>
          {captionsOn && <span className="text-[10px] font-bold">ON</span>}
        </button>

        <button
          type="button"
          onClick={() => act(onOpenBreakouts)}
          className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 hover:bg-white/10"
        >
          <span className="flex items-center gap-2">
            <DoorOpen className="h-4 w-4" /> Breakout Rooms
          </span>
        </button>

        <button
          type="button"
          onClick={() => act(onOpenEffects)}
          className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 hover:bg-white/10"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#D4A843]" /> Video Effects &amp; Blur
          </span>
        </button>

        <button
          type="button"
          onClick={() => act(onToggleNotes)}
          className={cn(
            'flex w-full items-center justify-between rounded-xl px-2.5 py-2 hover:bg-white/10',
            notesOpen && 'bg-white/15',
          )}
        >
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Meeting Notes
          </span>
        </button>

        {canRecord && (
          <>
            <button
              type="button"
              onClick={() => act(onToggleRecording)}
              className={cn(
                'flex w-full items-center justify-between rounded-xl px-2.5 py-2 hover:bg-white/10',
                recording && 'bg-rose-500/20 text-rose-300',
              )}
            >
              <span className="flex items-center gap-2">
                <Radio className={cn('h-4 w-4', recording && 'animate-pulse')} />
                {recording ? 'Stop Recording' : 'Start Composite Recording'}
              </span>
            </button>
            {recording && (
              <button
                type="button"
                onClick={() => act(onTogglePauseRecording)}
                className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-amber-300 hover:bg-white/10"
              >
                <span className="pl-6">{recordingPaused ? 'Resume Recording' : 'Pause Recording'}</span>
              </button>
            )}
          </>
        )}

        <div className="my-1.5 border-t border-white/10" />

        <button
          type="button"
          onClick={() => act(onToggleBandwidthSaver)}
          className={cn(
            'flex w-full items-center justify-between rounded-xl px-2.5 py-2 hover:bg-white/10',
            bandwidthSaver && 'bg-amber-500/20 text-amber-300',
          )}
        >
          <span className="flex items-center gap-2">
            <Wifi className="h-4 w-4" /> Audio-Only (Low Data)
          </span>
          {bandwidthSaver && <span className="text-[10px] font-bold">ON</span>}
        </button>

        {canHostControl && (
          <button
            type="button"
            onClick={() => act(onExportAttendancePdf)}
            className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 hover:bg-white/10"
          >
            <span className="flex items-center gap-2">
              <FileDown className="h-4 w-4 text-emerald-300" /> Attendance &amp; Notes PDF
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => act(onOpenStats)}
          className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 hover:bg-white/10"
        >
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4" /> Network Health Stats
          </span>
        </button>

        <button
          type="button"
          onClick={() => act(onOpenShortcuts)}
          className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 hover:bg-white/10"
        >
          <span className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" /> Keyboard Shortcuts (?)
          </span>
        </button>

        <button
          type="button"
          onClick={() => act(onToggleFullscreen)}
          className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 hover:bg-white/10"
        >
          <span className="flex items-center gap-2">
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          </span>
        </button>
      </div>
    </div>
  );
}

export function VideoEffectsModal({
  open,
  effect,
  mirrorVideo,
  hideSelfView,
  hideNonVideo,
  touchUp,
  onChangeEffect,
  onToggleMirror,
  onToggleHideSelf,
  onToggleHideNonVideo,
  onToggleTouchUp,
  onClose,
}: {
  open: boolean;
  effect: VideoEffectMode;
  mirrorVideo: boolean;
  hideSelfView: boolean;
  hideNonVideo: boolean;
  touchUp: boolean;
  onChangeEffect: (mode: VideoEffectMode) => void;
  onToggleMirror: () => void;
  onToggleHideSelf: () => void;
  onToggleHideNonVideo: () => void;
  onToggleTouchUp: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const presets: Array<{ id: VideoEffectMode; label: string; previewClass: string }> = [
    { id: 'none', label: 'None', previewClass: 'bg-slate-800' },
    { id: 'blur-light', label: 'Soft Blur', previewClass: 'bg-gradient-to-br from-slate-600 to-slate-800' },
    { id: 'blur-strong', label: 'Deep Blur', previewClass: 'bg-gradient-to-br from-slate-500 to-slate-900' },
    { id: 'bg-yakunex', label: 'Yakunex Gold HQ', previewClass: 'bg-gradient-to-br from-[#1C160A] via-[#2B200B] to-[#D4A843]/40' },
    { id: 'bg-studio', label: 'Midnight Studio', previewClass: 'bg-gradient-to-br from-indigo-950 via-slate-900 to-cyan-950' },
    { id: 'bg-slate', label: 'Minimal Slate', previewClass: 'bg-gradient-to-br from-zinc-800 to-zinc-950' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#111827] p-5 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#D4A843]" />
            <h3 className="font-display text-base font-semibold">Video Effects &amp; View Preferences</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-white/50">
          Virtual Background &amp; Frame Framing
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChangeEffect(p.id)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 text-xs transition',
                effect === p.id
                  ? 'border-[#D4A843] bg-[#D4A843]/15 text-[#D4A843]'
                  : 'border-white/10 bg-white/[0.03] text-white/75 hover:border-white/25',
              )}
            >
              <div className={cn('h-10 w-full rounded-xl border border-white/10', p.previewClass)} />
              <span className="font-medium">{p.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2 border-t border-white/10 pt-3 text-xs">
          {[
            { label: 'Mirror My Video', checked: mirrorVideo, onToggle: onToggleMirror },
            { label: 'Touch Up Appearance / Low-Light Boost', checked: touchUp, onToggle: onToggleTouchUp },
            { label: 'Hide Self View', checked: hideSelfView, onToggle: onToggleHideSelf },
            { label: 'Hide Non-Video Participants', checked: hideNonVideo, onToggle: onToggleHideNonVideo },
          ].map((row) => (
            <label
              key={row.label}
              className="flex cursor-pointer items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 hover:bg-white/[0.08]"
            >
              <span>{row.label}</span>
              <input type="checkbox" checked={row.checked} onChange={row.onToggle} />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function KeyboardShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const rows = [
    { key: 'Space (Hold)', desc: 'Push-to-Talk while muted' },
    { key: 'Alt + A', desc: 'Mute / Unmute Microphone' },
    { key: 'Alt + V', desc: 'Start / Stop Camera' },
    { key: 'Alt + S', desc: 'Start / Stop Screen Share' },
    { key: 'Alt + H', desc: 'Toggle Chat Drawer' },
    { key: 'Alt + U', desc: 'Toggle Participants Drawer' },
    { key: 'Alt + Y', desc: 'Raise / Lower Hand' },
    { key: 'Alt + C', desc: 'Toggle Live Captions (CC)' },
    { key: 'Alt + F', desc: 'Toggle Fullscreen' },
    { key: '?', desc: 'Show / Hide Keyboard Shortcuts' },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#111827] p-5 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-[#D4A843]" />
            <h3 className="font-display text-base font-semibold">Zoom Keyboard Shortcuts</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-white/60 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-xs">
              <span className="text-white/80">{r.desc}</span>
              <kbd className="rounded-lg border border-white/20 bg-black/40 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#D4A843]">
                {r.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function NetworkStatsModal({
  open,
  stats,
  onClose,
}: {
  open: boolean;
  stats: NetworkHealthStats;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-[#111827] p-5 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            <h3 className="font-display text-base font-semibold">Live Network Statistics</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-white/60 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
          <div className="rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[10px] uppercase text-white/45">Signal Quality</p>
            <p className="mt-1 text-base font-bold text-emerald-400">{stats.qualityLabel}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[10px] uppercase text-white/45">Transport</p>
            <p className="mt-1 text-sm font-bold text-[#D4A843]">{stats.transport}</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[10px] uppercase text-white/45">Latency (RTT)</p>
            <p className="mt-1 font-mono text-base font-bold text-white">{stats.rttMs} ms</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[10px] uppercase text-white/45">Bitrate</p>
            <p className="mt-1 font-mono text-base font-bold text-white">{stats.bitrateKbps} kbps</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[10px] uppercase text-white/45">Packet Loss</p>
            <p className="mt-1 font-mono text-base font-bold text-white">{stats.packetLossPct.toFixed(1)}%</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-3">
            <p className="text-[10px] uppercase text-white/45">Resolution</p>
            <p className="mt-1 font-mono text-base font-bold text-white">{stats.resolution}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
