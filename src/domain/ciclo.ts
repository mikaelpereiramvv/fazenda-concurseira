import type { AppState, Materia } from './tipos';

export interface ItemCiclo {
  materia: Materia;
  feitoMin: number;
  metaMin: number;
  fracao: number;
}

export function itensCiclo(state: Pick<AppState, 'materias' | 'ciclo'>): ItemCiclo[] {
  return state.materias
    .filter((m) => m.ativa && m.metaCicloMin > 0)
    .sort((a, b) => a.ordem - b.ordem)
    .map((m) => {
      const feito = state.ciclo.progresso[m.id] ?? 0;
      return { materia: m, feitoMin: feito, metaMin: m.metaCicloMin, fracao: Math.min(1, feito / m.metaCicloMin) };
    });
}

/**
 * Próxima matéria sugerida: a mais atrasada EM PROPORÇÃO na volta atual;
 * empate → a que está há mais tempo sem estudo; depois a ordem do ciclo.
 */
export function proximaMateria(state: Pick<AppState, 'materias' | 'ciclo'> & { sessoes?: AppState['sessoes'] }): Materia | undefined {
  const itens = itensCiclo(state);
  if (!itens.length) return undefined;
  const ultimo = new Map<string, string>();
  for (const x of state.sessoes ?? []) if ((ultimo.get(x.materiaId) ?? '') < x.inicio) ultimo.set(x.materiaId, x.inicio);
  const ordenados = [...itens].sort((a, b) =>
    a.fracao - b.fracao || (ultimo.get(a.materia.id) ?? '').localeCompare(ultimo.get(b.materia.id) ?? '') || a.materia.ordem - b.materia.ordem);
  return ordenados[0].materia;
}

/** Desfaz minutos do ciclo (ex.: sessão excluída). */
export function estornarCiclo(state: AppState, materiaId: string, minutos: number): AppState {
  const atual = state.ciclo.progresso[materiaId] ?? 0;
  return { ...state, ciclo: { ...state.ciclo, progresso: { ...state.ciclo.progresso, [materiaId]: Math.max(0, atual - minutos) } } };
}

export function progressoCiclo(state: Pick<AppState, 'materias' | 'ciclo'>): number {
  const itens = itensCiclo(state);
  const meta = itens.reduce((a, i) => a + i.metaMin, 0);
  if (meta === 0) return 0;
  return itens.reduce((a, i) => a + Math.min(i.feitoMin, i.metaMin), 0) / meta;
}

/** Soma minutos ao ciclo; fecha a volta quando todas as matérias batem a meta. */
export function registrarNoCiclo(state: AppState, materiaId: string, minutos: number): { state: AppState; voltaCompleta: boolean } {
  const progresso = { ...state.ciclo.progresso, [materiaId]: (state.ciclo.progresso[materiaId] ?? 0) + minutos };
  let novo: AppState = { ...state, ciclo: { ...state.ciclo, progresso } };
  const itens = itensCiclo(novo);
  const completa = itens.length > 0 && itens.every((i) => i.fracao >= 1);
  if (completa) {
    // o que passou da meta vai para a próxima volta (não se perde)
    const excedente: Record<string, number> = {};
    for (const i of itens) if (i.feitoMin > i.metaMin) excedente[i.materia.id] = i.feitoMin - i.metaMin;
    novo = { ...novo, ciclo: { ...novo.ciclo, rodada: state.ciclo.rodada + 1, progresso: excedente, inicioRodadaEm: new Date().toISOString() } };
  }
  return { state: novo, voltaCompleta: completa };
}
