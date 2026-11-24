import type { Ajustes, SessaoAtiva } from './tipos';

/** Segundos líquidos (descontando pausas) até `agora`. Baseado só em datas: sobrevive a background. */
export function segundosLiquidos(s: SessaoAtiva, agora: Date = new Date()): number {
  const fimRef = s.encerradaEm ? new Date(s.encerradaEm) : agora;
  const ini = new Date(s.inicio).getTime();
  let total = (fimRef.getTime() - ini) / 1000;
  for (const p of s.pausas) {
    const pi = new Date(p.inicio).getTime();
    const pf = p.fim ? new Date(p.fim).getTime() : fimRef.getTime();
    total -= Math.max(0, Math.min(pf, fimRef.getTime()) - pi) / 1000;
  }
  return Math.max(0, total);
}

export const estaPausada = (s: SessaoAtiva) => s.pausas.length > 0 && !s.pausas[s.pausas.length - 1].fim;

export function pausar(s: SessaoAtiva, agora = new Date()): SessaoAtiva {
  if (estaPausada(s)) return s;
  return { ...s, pausas: [...s.pausas, { inicio: agora.toISOString() }] };
}

export function retomar(s: SessaoAtiva, agora = new Date()): SessaoAtiva {
  if (!estaPausada(s)) return s;
  const pausas = s.pausas.slice();
  pausas[pausas.length - 1] = { ...pausas[pausas.length - 1], fim: agora.toISOString() };
  return { ...s, pausas };
}

/** Pausa longa demais? Retorna o instante em que a sessão deve ser considerada encerrada. */
export function fimPorPausaLonga(s: SessaoAtiva, ajustes: Ajustes, agora = new Date()): Date | null {
  if (!estaPausada(s)) return null;
  const p = s.pausas[s.pausas.length - 1];
  const ini = new Date(p.inicio);
  return agora.getTime() - ini.getTime() > ajustes.pausaMaxMin * 60_000 ? ini : null;
}

export function pomodorosCompletos(segundos: number, ajustes: Ajustes): number {
  return Math.floor(segundos / 60 / ajustes.pomodoroMin);
}

/** Segundos até o próximo fim de Pomodoro (para agendar notificação). */
export function segundosAteProximoPomodoro(segundos: number, ajustes: Ajustes): number {
  const bloco = ajustes.pomodoroMin * 60;
  const resto = bloco - (segundos % bloco);
  return resto <= 0 ? bloco : resto;
}
