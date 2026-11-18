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

/** Request browser notification permission once (if still default) and show desktop alert if granted. */
export function showDesktopNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/icon.png' });
    } catch {
      // Ignore browser notification errors
    }
  } else if (Notification.permission === 'default') {
    void Notification.requestPermission().catch(() => undefined);
  }
}
