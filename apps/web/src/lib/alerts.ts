'use client';

let audioCtx: AudioContext | null = null;

/** Play a soft, non-intrusive two-tone notification chime via Web Audio API. */
export function playAlertChime() {
  if (typeof window === 'undefined') return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume().catch(() => undefined);
    }
    const now = audioCtx.currentTime;
    const notes = [880, 1174.66]; // A5 -> D6 soft Apple-style chime
    notes.forEach((freq, idx) => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.06, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.24);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.25);
    });
  } catch {
    // Ignore autoplay restriction errors
  }
}

/** Play a pleasant Zoom-style 3-note chime when a live meeting starts or someone joins waiting room. */
export function playMeetingStartChime() {
  if (typeof window === 'undefined') return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume().catch(() => undefined);
    }
    const now = audioCtx.currentTime;
    const notes = [659.25, 880, 1318.51]; // E5 -> A5 -> E6 crisp live-call chime
    notes.forEach((freq, idx) => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.11, now + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.32);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.34);
    });
  } catch {
    // Ignore autoplay restrictions
  }
}

/** Play a brief speaker test melody routed to a chosen audiooutput device (when supported). */
export async function playSpeakerTestTone(sinkId?: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const ctxWithSink = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (sinkId && typeof ctxWithSink.setSinkId === 'function') {
      await ctxWithSink.setSinkId(sinkId).catch(() => undefined);
    }
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.0001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.28);
    });
    setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 1000);
  } catch {
    // ignore
  }
}

/** Request browser notification permission once (if still default) and show desktop alert if granted. */
export function showDesktopNotification(title: string, body: string, onClickUrl?: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      const n = new Notification(title, { body, icon: '/icon.png' });
      if (onClickUrl) {
        n.onclick = () => {
          window.focus();
          window.open(onClickUrl, '_blank');
          n.close();
        };
      }
    } catch {
      // Ignore browser notification errors
    }
  } else if (Notification.permission === 'default') {
    void Notification.requestPermission().catch(() => undefined);
  }
}
