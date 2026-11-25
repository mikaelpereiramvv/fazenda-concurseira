import { chaveDia, novoId } from './datas';
import type { AppState, BlocoQuestoes, Simulado } from './tipos';

export const simuladosDe = (s: AppState) => s.simulados ?? [];

export function notaSimulado(sim: Simulado): { feitas: number; acertos: number; pct: number } {
  const feitas = sim.porMateria.reduce((a, m) => a + m.feitas, 0);
  const acertos = sim.porMateria.reduce((a, m) => a + m.acertos, 0);
  return { feitas, acertos, pct: feitas ? acertos / feitas : 0 };
}

/** Registra um simulado: entra nas métricas por matéria como blocos de questões (origem "simulado"). */
export function registrarSimulado(s: AppState, sim: Omit<Simulado, 'id'>, agora = new Date()):
  { ok: true; state: AppState } | { ok: false; erro: string } {
  if (!sim.nome.trim()) return { ok: false, erro: 'Dê um nome ao simulado.' };
  if (chaveDia(sim.em) > chaveDia(agora)) return { ok: false, erro: 'Simulado não pode ter data futura.' };
  const validos = sim.porMateria.filter((m) => m.feitas > 0);
  if (!validos.length) return { ok: false, erro: 'Informe as questões de pelo menos uma matéria.' };
  if (validos.some((m) => m.acertos > m.feitas || m.acertos < 0)) return { ok: false, erro: 'Acertos não podem passar das questões feitas.' };
  const id = novoId();
  const completo: Simulado = { ...sim, id, porMateria: validos };
  const blocos: BlocoQuestoes[] = validos.map((m) => ({
    id: novoId(), simuladoId: id, em: sim.em, materiaId: m.materiaId, feitas: m.feitas, acertos: m.acertos, brancos: m.brancos,
  }));
  return { ok: true, state: { ...s, simulados: [...simuladosDe(s), completo], blocos: [...(s.blocos ?? []), ...blocos] } };
}

export function excluirSimulado(s: AppState, id: string): AppState {
  return { ...s, simulados: simuladosDe(s).filter((x) => x.id !== id), blocos: (s.blocos ?? []).filter((b) => b.simuladoId !== id) };
}
