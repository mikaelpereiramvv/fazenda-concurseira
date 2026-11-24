import { chaveDia, chaveMes, chaveSemana, somarDias } from './datas';
import type { AppState, Sessao } from './tipos';

export interface Totais { hoje: number; semana: number; mes: number; total: number }

export function totais(sessoes: Sessao[], agora = new Date()): Totais {
  const d = chaveDia(agora), w = chaveSemana(agora), m = chaveMes(agora);
  const t: Totais = { hoje: 0, semana: 0, mes: 0, total: 0 };
  for (const s of sessoes) {
    t.total += s.duracaoMin;
    if (chaveDia(s.inicio) === d) t.hoje += s.duracaoMin;
    if (chaveSemana(s.inicio) === w) t.semana += s.duracaoMin;
    if (chaveMes(s.inicio) === m) t.mes += s.duracaoMin;
  }
  return t;
}

export interface BarraDia { dia: string; rotulo: string; porMateria: Record<string, number>; manual: number; total: number }

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function ultimosDias(sessoes: Sessao[], n = 7, agora = new Date()): BarraDia[] {
  const out: BarraDia[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = somarDias(agora, -i);
    out.push({ dia: chaveDia(d), rotulo: DIAS[d.getDay()], porMateria: {}, manual: 0, total: 0 });
  }
  const idx = new Map(out.map((b, i) => [b.dia, i]));
  for (const s of sessoes) {
    const i = idx.get(chaveDia(s.inicio));
    if (i === undefined) continue;
    const b = out[i];
    b.porMateria[s.materiaId] = (b.porMateria[s.materiaId] ?? 0) + s.duracaoMin;
    if (s.origem === 'manual') b.manual += s.duracaoMin;
    b.total += s.duracaoMin;
  }
  return out;
}

export function porMateria(state: Pick<AppState, 'sessoes' | 'materias'>, desde?: Date) {
  const mapa = new Map<string, { min: number; questoes: number; acertos: number }>();
  for (const s of state.sessoes) {
    if (desde && new Date(s.inicio) < desde) continue;
    const v = mapa.get(s.materiaId) ?? { min: 0, questoes: 0, acertos: 0 };
    v.min += s.duracaoMin;
    v.questoes += s.questoes ?? 0;
    v.acertos += s.acertos ?? 0;
    mapa.set(s.materiaId, v);
  }
  return state.materias
    .map((m) => ({ materia: m, ...(mapa.get(m.id) ?? { min: 0, questoes: 0, acertos: 0 }) }))
    .filter((x) => x.min > 0)
    .sort((a, b) => b.min - a.min);
}

/** Mapa de calor: minutos por dia nas últimas `semanas` semanas. */
export function mapaCalor(sessoes: Sessao[], semanas = 12, agora = new Date()): { dia: string; min: number }[] {
  const porDia = new Map<string, number>();
  for (const s of sessoes) porDia.set(chaveDia(s.inicio), (porDia.get(chaveDia(s.inicio)) ?? 0) + s.duracaoMin);
  const out: { dia: string; min: number }[] = [];
  for (let i = semanas * 7 - 1; i >= 0; i--) {
    const k = chaveDia(somarDias(agora, -i));
    out.push({ dia: k, min: porDia.get(k) ?? 0 });
  }
  return out;
}
