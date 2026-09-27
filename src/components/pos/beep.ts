"use client";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, ms: number, when = 0, type: OscillatorType = "square", volume = 0.06) {
  const a = audio();
  if (!a) return;
  const start = a.currentTime + when;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);
  osc.connect(gain).connect(a.destination);
  osc.start(start);
  osc.stop(start + ms / 1000 + 0.02);
}

/** Pitido corto y agudo: producto encontrado. */
export function beepOk() {
  tone(1760, 70);
}

/** Dos tonos graves: código no encontrado / sin stock. */
export function beepError() {
  tone(220, 130, 0, "sawtooth", 0.05);
  tone(180, 160, 0.15, "sawtooth", 0.05);
}
