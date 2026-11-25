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
    <div className="liquid-glass-popover absolute bottom-16 right-0 z-50 w-68 rounded-[26px] p-2.5 text-white">
      <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#F5D06F]/80">
        Yakunex Spatial Suite
      </p>
      <div className="space-y-0.5 text-xs">
        <button
          type="button"
          onClick={() => act(onTogglePolls)}
          className={cn(
            'flex w-full items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/10',
            pollsOpen && 'bg-[#D4A843]/20 text-[#F5D06F]',
          )}
        >
          <span className="flex items-center gap-2.5">
            <BarChart3 className="h-4 w-4" /> Live Polls &amp; Q&amp;A
          </span>
          {pollsOpen && <Check className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={() => act(onToggleWhiteboard)}
          className={cn(
            'flex w-full items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/10',
            whiteboardOpen && 'bg-[#D4A843]/20 text-[#F5D06F]',
          )}
        >
          <span className="flex items-center gap-2.5">
            <PenTool className="h-4 w-4" /> Spatial Canvas
          </span>
          {whiteboardOpen && <Check className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={() => act(onToggleCaptions)}
          className={cn(
            'flex w-full items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/10',
            captionsOn && 'bg-emerald-500/20 text-emerald-300',
          )}
        >
          <span className="flex items-center gap-2.5">
            <Captions className="h-4 w-4" /> Live Subtitles (CC)
          </span>
          {captionsOn && <span className="text-[10px] font-bold">ON</span>}
        </button>

        <button
          type="button"
          onClick={() => act(onOpenBreakouts)}
          className="flex w-full items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/10"
        >
          <span className="flex items-center gap-2.5">
            <DoorOpen className="h-4 w-4" /> Breakout Pods
          </span>
        </button>

        <button
          type="button"
          onClick={() => act(onOpenEffects)}
          className="flex w-full items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/10"
        >
          <span className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-[#F5D06F]" /> Camera Studio &amp; Blur
          </span>
        </button>

        <button
          type="button"
          onClick={() => act(onToggleNotes)}
          className={cn(
            'flex w-full items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/10',
            notesOpen && 'bg-white/15',
          )}
        >
          <span className="flex items-center gap-2.5">
            <FileText className="h-4 w-4" /> Shared Minutes
          </span>
        </button>

        {canRecord && (
          <>
            <button
              type="button"
              onClick={() => act(onToggleRecording)}
              className={cn(
                'flex w-full items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/10',
                recording && 'bg-rose-500/20 text-rose-300',
              )}
            >
              <span className="flex items-center gap-2.5">
                <Radio className={cn('h-4 w-4', recording && 'animate-pulse')} />
                {recording ? 'Stop Studio Recording' : 'Record Session'}
              </span>
            </button>
            {recording && (
              <button
                type="button"
                onClick={() => act(onTogglePauseRecording)}
                className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-amber-300 transition hover:bg-white/10"
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
            'flex w-full items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/10',
            bandwidthSaver && 'bg-amber-500/20 text-amber-300',
          )}
        >
          <span className="flex items-center gap-2.5">
            <Wifi className="h-4 w-4" /> 3G Voice-Priority Mode
          </span>
          {bandwidthSaver && <span className="text-[10px] font-bold">ON</span>}
        </button>

        {canHostControl && (
          <button
            type="button"
            onClick={() => act(onExportAttendancePdf)}
            className="flex w-full items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/10"
          >
            <span className="flex items-center gap-2.5">
              <FileDown className="h-4 w-4 text-emerald-300" /> Export Attendance PDF
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => act(onOpenStats)}
          className="flex w-full items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/10"
        >
          <span className="flex items-center gap-2.5">
            <Activity className="h-4 w-4" /> Stream Telemetry
          </span>
        </button>

        <button
          type="button"
          onClick={() => act(onOpenShortcuts)}
          className="flex w-full items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/10"
        >
          <span className="flex items-center gap-2.5">
            <Keyboard className="h-4 w-4" /> Shortcuts (?)
          </span>
        </button>

        <button
          type="button"
          onClick={() => act(onToggleFullscreen)}
          className="flex w-full items-center justify-between rounded-2xl px-3 py-2 transition hover:bg-white/10"
        >
          <span className="flex items-center gap-2.5">
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {isFullscreen ? 'Exit Immersion' : 'Full Immersion'}
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
    { id: 'none', label: 'Natural Lens', previewClass: 'bg-slate-800' },
    { id: 'blur-light', label: 'Optical Bokeh', previewClass: 'bg-gradient-to-br from-slate-600 to-slate-800' },
    { id: 'blur-strong', label: 'Deep Frosted', previewClass: 'bg-gradient-to-br from-slate-500 to-slate-900' },
    { id: 'bg-yakunex', label: 'Yakunex Gold Lounge', previewClass: 'bg-gradient-to-br from-[#1C160A] via-[#2B200B] to-[#D4A843]/40' },
    { id: 'bg-studio', label: 'Aurora Spatial', previewClass: 'bg-gradient-to-br from-indigo-950 via-slate-900 to-cyan-950' },
    { id: 'bg-slate', label: 'Obsidian Glass', previewClass: 'bg-gradient-to-br from-zinc-800 to-zinc-950' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-md">
      <div className="liquid-glass-popover w-full max-w-lg rounded-[30px] p-6 text-white">
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-[#F5D06F]" />
            <h3 className="font-display text-base font-semibold">Camera Studio &amp; Optical Framing</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="liquid-orb rounded-full p-1.5 text-white/70 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
          Spatial Backdrop &amp; Depth Blur
        </p>
        <div className="mt-2.5 grid grid-cols-3 gap-2.5">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChangeEffect(p.id)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-2xl border p-2.5 text-xs transition',
                effect === p.id
                  ? 'border-[#F5D06F] bg-[#D4A843]/20 text-[#F5D06F] shadow-[0_0_20px_rgba(212,168,67,0.25)]'
                  : 'border-white/10 bg-white/[0.04] text-white/75 hover:border-white/25',
              )}
            >
              <div className={cn('h-11 w-full rounded-xl border border-white/15', p.previewClass)} />
              <span className="font-medium">{p.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2 border-t border-white/10 pt-3.5 text-xs">
          {[
            { label: 'Mirror Self Camera', checked: mirrorVideo, onToggle: onToggleMirror },
            { label: 'Studio Portrait Light Boost', checked: touchUp, onToggle: onToggleTouchUp },
            { label: 'Hide Self Pod from Stage', checked: hideSelfView, onToggle: onToggleHideSelf },
            { label: 'Focus on Camera-Enabled Pods Only', checked: hideNonVideo, onToggle: onToggleHideNonVideo },
          ].map((row) => (
            <label
              key={row.label}
              className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 transition hover:bg-white/[0.08]"
            >
              <span>{row.label}</span>
              <input type="checkbox" checked={row.checked} onChange={row.onToggle} className="accent-[#D4A843]" />
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
    { key: 'Alt + A', desc: 'Toggle Microphone Orb' },
    { key: 'Alt + V', desc: 'Toggle Camera Orb' },
    { key: 'Alt + S', desc: 'Start / Stop Screen Presentation' },
    { key: 'Alt + H', desc: 'Open / Close Spatial Chat' },
    { key: 'Alt + U', desc: 'Open / Close People Inspector' },
    { key: 'Alt + Y', desc: 'Raise / Lower Hand' },
    { key: 'Alt + C', desc: 'Toggle Live Subtitles (CC)' },
    { key: 'Alt + F', desc: 'Toggle Full Immersion' },
    { key: '?', desc: 'Open / Close Shortcuts' },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-md">
      <div className="liquid-glass-popover w-full max-w-md rounded-[30px] p-6 text-white">
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-2.5">
            <Keyboard className="h-4 w-4 text-[#F5D06F]" />
            <h3 className="font-display text-base font-semibold">Yakunex Studio Shortcuts</h3>
          </div>
          <button type="button" onClick={onClose} className="liquid-orb rounded-full p-1.5 text-white/70 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3.5 space-y-1.5">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs">
              <span className="text-white/85">{r.desc}</span>
              <kbd className="rounded-xl border border-white/20 bg-black/40 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#F5D06F]">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-md">
      <div className="liquid-glass-popover w-full max-w-sm rounded-[30px] p-6 text-white">
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-2.5">
            <Activity className="h-4 w-4 text-emerald-400" />
            <h3 className="font-display text-base font-semibold">Spatial Stream Telemetry</h3>
          </div>
          <button type="button" onClick={onClose} className="liquid-orb rounded-full p-1.5 text-white/70 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs">
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-white/45">Signal Grade</p>
            <p className="mt-1 text-base font-bold text-emerald-400">{stats.qualityLabel}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-white/45">Media Engine</p>
            <p className="mt-1 text-sm font-bold text-[#F5D06F]">{stats.transport}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-white/45">Round-Trip</p>
            <p className="mt-1 font-mono text-base font-bold text-white">{stats.rttMs} ms</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-white/45">Throughput</p>
            <p className="mt-1 font-mono text-base font-bold text-white">{stats.bitrateKbps} kbps</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-white/45">Packet Loss</p>
            <p className="mt-1 font-mono text-base font-bold text-white">{stats.packetLossPct.toFixed(1)}%</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5">
            <p className="text-[10px] uppercase tracking-wider text-white/45">Video Profile</p>
            <p className="mt-1 font-mono text-base font-bold text-white">{stats.resolution}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
