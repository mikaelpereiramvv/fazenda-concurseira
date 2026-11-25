// Sons sintetizados (WebAudio) — sem arquivos de áudio, offline, desligados por padrão.
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function nota(freq: number, ini: number, dur: number, tipo: OscillatorType = 'sine', vol = 0.12) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = tipo; o.frequency.value = freq;
  const t = a.currentTime + ini;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export type Som = 'clique' | 'moeda' | 'colheita' | 'nivel' | 'fim';

export function tocar(som: Som, ligado: boolean | undefined) {
  if (!ligado) return;
  switch (som) {
    case 'clique': nota(660, 0, 0.06, 'triangle', 0.06); break;
    case 'moeda': nota(988, 0, 0.08, 'square', 0.05); nota(1319, 0.07, 0.18, 'square', 0.05); break;
    case 'colheita': nota(523, 0, 0.1, 'triangle'); nota(659, 0.08, 0.1, 'triangle'); nota(784, 0.16, 0.22, 'triangle'); break;
    case 'nivel': [523, 659, 784, 1047].forEach((f, i) => nota(f, i * 0.1, 0.25, 'triangle', 0.1)); break;
    case 'fim': nota(784, 0, 0.2, 'sine'); nota(1047, 0.18, 0.4, 'sine'); break;
  }
}
