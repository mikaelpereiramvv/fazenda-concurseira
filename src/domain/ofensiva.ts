import { ECONOMIA } from './economia';
import { chaveDia, deChaveDia, diffDias, somarDias } from './datas';
import type { AppState, Sessao } from './tipos';

/** Sessão conta para a ofensiva? Manual só conta se lançada até N dias depois do dia estudado. */
export function contaParaOfensiva(s: Sessao): boolean {
  if (s.origem === 'cronometro') return true;
  return diffDias(s.inicio, s.criadaEm) <= ECONOMIA.ofensiva.recuperacaoManualMaxDias;
}

export function minutosOfensivaPorDia(sessoes: Sessao[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessoes) {
    if (!contaParaOfensiva(s)) continue;
    const k = chaveDia(s.inicio);
    m.set(k, (m.get(k) ?? 0) + s.duracaoMin);
  }
  return m;
}

/**
 * Dias seguidos de estudo terminando hoje (ou ontem, se hoje ainda não bateu o mínimo).
 * Dias "congelados" mantêm a sequência mas não somam.
 */
export function calcularOfensiva(state: Pick<AppState, 'sessoes' | 'registro'>, hoje = new Date()): number {
  const min = ECONOMIA.ofensiva.minutosMinimosNoDia;
  const porDia = minutosOfensivaPorDia(state.sessoes);
  const congelados = new Set(state.registro.diasCongelados);
  let d = hoje;
  if ((porDia.get(chaveDia(d)) ?? 0) < min) d = somarDias(d, -1);
  let dias = 0;
  for (let i = 0; i < 3650; i++) {
    const k = chaveDia(d);
    if ((porDia.get(k) ?? 0) >= min) dias++;
    else if (!congelados.has(k)) break;
    d = somarDias(d, -1);
  }
  return dias;
}

export function multiplicadorOfensiva(dias: number): number {
  let bonus = 0;
  for (const m of ECONOMIA.ofensiva.multiplicadores) if (dias >= m.dias) bonus = m.bonus;
  return bonus;
}

/**
 * Ao abrir o app: usa congeladores para cobrir dias perdidos logo antes de ontem/hoje,
 * se isso salvar uma ofensiva existente. Retorna o estado e quantos foram usados.
 */
export function aplicarCongeladores(state: AppState, hoje = new Date()): { state: AppState; usados: string[] } {
  const min = ECONOMIA.ofensiva.minutosMinimosNoDia;
  const porDia = minutosOfensivaPorDia(state.sessoes);
  const congelados = new Set(state.registro.diasCongelados);
  const faltando: string[] = [];
  let d = somarDias(hoje, -1);
  for (let i = 0; i < ECONOMIA.ofensiva.congeladorEstoqueMax + 1; i++) {
    const k = chaveDia(d);
    if ((porDia.get(k) ?? 0) >= min || congelados.has(k)) break;
    faltando.push(k);
    d = somarDias(d, -1);
  }
  if (faltando.length === 0 || faltando.length > state.jogador.congeladores) return { state, usados: [] };
  const anterior = chaveDia(somarDias(deChaveDia(faltando[faltando.length - 1]), -1));
  const haviaOfensiva = (porDia.get(anterior) ?? 0) >= min || congelados.has(anterior);
  if (!haviaOfensiva) return { state, usados: [] };
  return {
    usados: faltando,
    state: {
      ...state,
      jogador: { ...state.jogador, congeladores: state.jogador.congeladores - faltando.length },
      registro: { ...state.registro, diasCongelados: [...state.registro.diasCongelados, ...faltando] },
    },
  };
}
