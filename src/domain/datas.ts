// Utilitários de data sempre no fuso do aparelho.

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' no fuso local. */
export function chaveDia(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function deChaveDia(chave: string): Date {
  const [y, m, d] = chave.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function somarDias(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Diferença em dias de calendário (b - a). */
export function diffDias(a: Date | string, b: Date | string): number {
  const da = inicioDoDia(typeof a === 'string' ? new Date(a) : a);
  const db = inicioDoDia(typeof b === 'string' ? new Date(b) : b);
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/** Segunda-feira da semana (chave do dia). */
export function chaveSemana(d: Date | string): string {
  const x = inicioDoDia(typeof d === 'string' ? new Date(d) : d);
  const dow = (x.getDay() + 6) % 7; // 0 = segunda
  return chaveDia(somarDias(x, -dow));
}

export function chaveMes(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
}

export function formatarDuracao(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${pad(r)}`;
}

export function formatarRelogio(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

export function novoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
