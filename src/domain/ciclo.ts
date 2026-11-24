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

/** Próxima matéria sugerida: a primeira (na ordem) que ainda não completou a meta da volta. */
export function proximaMateria(state: Pick<AppState, 'materias' | 'ciclo'>): Materia | undefined {
  const itens = itensCiclo(state);
  return itens.find((i) => i.fracao < 1)?.materia ?? itens[0]?.materia;
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
  if (completa) novo = { ...novo, ciclo: { rodada: state.ciclo.rodada + 1, progresso: {} } };
  return { state: novo, voltaCompleta: completa };
}
