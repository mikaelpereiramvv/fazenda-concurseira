// Métricas de desempenho (fórmulas documentadas no Plano v0.3) e ciclo automático.
import { ECONOMIA } from './economia';
import { chaveDia, chaveSemana, deChaveDia, diffDias, somarDias } from './datas';
import type { AppState, BlocoQuestoes, Concurso, Materia, StatusAssunto } from './tipos';

const E = () => ECONOMIA.estudo;
export const blocosDe = (s: AppState) => s.blocos ?? [];

/** Acerto ajustado (média bayesiana): (a + k·p0) ÷ (q + k). Evita "100%" com 1 questão. */
export function acertoAjustado(acertos: number, questoes: number): number {
  const k = E().priorPeso, p0 = E().priorAcerto;
  return (acertos + k * p0) / (questoes + k);
}

interface Agregado { q: number; a: number; e: number }
function somar(bs: BlocoQuestoes[]): Agregado {
  return bs.reduce((t, b) => ({ q: t.q + b.feitas, a: t.a + b.acertos, e: t.e + (b.feitas - b.acertos - (b.brancos ?? 0)) }), { q: 0, a: 0, e: 0 });
}
const naJanela = (bs: BlocoQuestoes[], de: Date, ate: Date) => bs.filter((b) => { const t = new Date(b.em); return t >= de && t <= ate; });

export interface DesempenhoItem {
  id: string; nome: string; cor?: string; materiaId: string;
  q: number; a: number; bruto: number | null; ajustado: number; liquido: number | null;
  tendencia: number | null; peso: number;
}

function tendencia(bs: BlocoQuestoes[], agora: Date): number | null {
  const min = E().amostraMinima;
  const rec = somar(naJanela(bs, somarDias(agora, -14), agora));
  const ant = somar(naJanela(bs, somarDias(agora, -28), somarDias(agora, -14)));
  if (rec.q < min || ant.q < min) return null;
  return rec.a / rec.q - ant.a / ant.q;
}

/** Desempenho por matéria nos últimos 30 dias. */
export function desempenhoPorMateria(s: AppState, agora = new Date()): DesempenhoItem[] {
  const bs = naJanela(blocosDe(s), somarDias(agora, -30), agora);
  const todos = blocosDe(s);
  const ehCE = (b: BlocoQuestoes) => b.formato === 'certo_errado';
  return s.materias.map((m) => {
    const meus = bs.filter((b) => b.materiaId === m.id);
    const t = somar(meus);
    const ce = somar(meus.filter(ehCE));
    return {
      id: m.id, nome: m.nome, cor: m.cor, materiaId: m.id, q: t.q, a: t.a,
      bruto: t.q >= E().amostraMinima ? t.a / t.q : null,
      ajustado: acertoAjustado(t.a, t.q),
      liquido: ce.q >= E().amostraMinima ? (ce.a - ce.e) / ce.q : null,
      tendencia: tendencia(todos.filter((b) => b.materiaId === m.id), agora),
      peso: (m.questoesProva ?? 0) * (m.pesoProva ?? 1),
    };
  }).filter((x) => x.q > 0);
}

/** Top pontos fracos por assunto: peso × distância até o alvo × confiança da amostra (30 dias). */
export function pontosFracos(s: AppState, agora = new Date(), limite = 5) {
  const alvo = s.ajustes.alvoAcerto ?? E().alvoAcertoPadrao;
  const bs = naJanela(blocosDe(s), somarDias(agora, -30), agora).filter((b) => b.assuntoId);
  const out: (DesempenhoItem & { score: number })[] = [];
  for (const a of s.assuntos) {
    const t = somar(bs.filter((b) => b.assuntoId === a.id));
    if (t.q === 0) continue;
    const aj = acertoAjustado(t.a, t.q);
    const peso = a.peso ?? 2;
    const score = peso * Math.max(0, alvo - aj) * Math.min(1, t.q / 30);
    if (score <= 0) continue;
    const m = s.materias.find((x) => x.id === a.materiaId);
    out.push({
      id: a.id, nome: a.nome, cor: m?.cor, materiaId: a.materiaId, q: t.q, a: t.a,
      bruto: t.q >= E().amostraMinima ? t.a / t.q : null, ajustado: aj, liquido: null,
      tendencia: tendencia(blocosDe(s).filter((b) => b.assuntoId === a.id), agora), peso, score,
    });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limite);
}

const VALOR_STATUS: Record<StatusAssunto, number> = { nao_visto: 0, teoria: 0.4, questoes: 0.7, revisado: 1 };

/** Cobertura ponderada do edital: Σ peso·valor(status) ÷ Σ peso. "Revisado" só vale 1 com 2+ revisões. */
export function coberturaPonderada(s: AppState, materiaId?: string): number | null {
  const as = s.assuntos.filter((a) => !materiaId || a.materiaId === materiaId);
  if (!as.length) return null;
  let num = 0, den = 0;
  for (const a of as) {
    const p = a.peso ?? 2;
    const v = a.status === 'revisado' && (a.revisoesFeitas ?? 0) < 2 ? 0.7 : VALOR_STATUS[a.status];
    num += p * v; den += p;
  }
  return num / den;
}

/** Próxima prova (data futura mais próxima entre concursos ativos). */
export function proximaProva(s: AppState, hoje = new Date()): (Concurso & { dias: number }) | null {
  const h = chaveDia(hoje);
  const cs = (s.concursos ?? []).filter((c) => c.ativo && c.dataProva && c.dataProva >= h)
    .map((c) => ({ ...c, dias: diffDias(hoje, deChaveDia(c.dataProva!)) }))
    .sort((a, b) => a.dias - b.dias);
  return cs[0] ?? null;
}

/**
 * Ritmo: assuntos que ainda faltam (valor < 0,7) ÷ semanas até a prova (reservando as 2 últimas para revisão),
 * comparado com assuntos que avançaram por semana nas últimas 4 semanas.
 */
export function ritmo(s: AppState, hoje = new Date()) {
  const prova = proximaProva(s, hoje);
  const faltam = s.assuntos.filter((a) => VALOR_STATUS[a.status] < 0.7).length;
  const desde = somarDias(hoje, -28);
  const avancaram = s.assuntos.filter((a) => a.estudadoEm && new Date(a.estudadoEm) >= desde).length;
  const real = avancaram / 4;
  if (!prova) return { prova: null, faltam, necessario: null, real, fechaEm: null as string | null };
  const semanas = Math.max(0.5, prova.dias / 7 - 2);
  const necessario = faltam / semanas;
  const fechaEm = real > 0 ? chaveDia(somarDias(hoje, Math.ceil((faltam / real) * 7))) : null;
  return { prova, faltam, necessario, real, fechaEm };
}

/** Índice de foco (7 dias, cronômetro): líquido ÷ bruto e saídas do app por hora. */
export function indiceFoco(s: AppState, hoje = new Date()) {
  const xs = s.sessoes.filter((x) => x.origem === 'cronometro' && x.brutoMin && diffDias(x.inicio, hoje) <= 7);
  const liq = xs.reduce((a, x) => a + x.duracaoMin, 0), bruto = xs.reduce((a, x) => a + (x.brutoMin ?? 0), 0);
  const saidas = xs.reduce((a, x) => a + (x.saidas ?? 0), 0);
  return { indice: bruto ? liq / bruto : null, saidasPorHora: liq ? saidas / (liq / 60) : null, sessoes: xs.length };
}

/** Meta adaptativa: mediana dos últimos 14 dias × 1,1, entre 60 e 240 min, em passos de 15. */
export function metaSugerida(s: AppState, hoje = new Date()): number | null {
  const dias: number[] = [];
  for (let i = 1; i <= 14; i++) {
    const k = chaveDia(somarDias(hoje, -i));
    dias.push(s.sessoes.filter((x) => chaveDia(x.inicio) === k).reduce((a, x) => a + x.duracaoMin, 0));
  }
  if (dias.filter((d) => d > 0).length < 5) return null;
  const ord = [...dias].sort((a, b) => a - b);
  const med = (ord[6] + ord[7]) / 2;
  return Math.max(60, Math.min(240, Math.round((med * 1.1) / 15) * 15));
}

/** Relatório da semana passada (segunda a domingo). */
export function relatorioSemana(s: AppState, hoje = new Date()) {
  const ini = deChaveDia(chaveSemana(somarDias(hoje, -7)));
  const fim = somarDias(ini, 7);
  const xs = s.sessoes.filter((x) => { const t = new Date(x.inicio); return t >= ini && t < fim; });
  const min = xs.reduce((a, x) => a + x.duracaoMin, 0);
  const bs = blocosDe(s).filter((b) => { const t = new Date(b.em); return t >= ini && t < fim; });
  const t = somar(bs);
  const dias = new Set(xs.map((x) => chaveDia(x.inicio))).size;
  const porMat = new Map<string, number>();
  for (const x of xs) porMat.set(x.materiaId, (porMat.get(x.materiaId) ?? 0) + x.duracaoMin);
  const ordenado = [...porMat.entries()].sort((a, b) => b[1] - a[1]);
  const revs = (s.revisoes ?? []).filter((r) => r.feitaEm && new Date(r.feitaEm) >= ini && new Date(r.feitaEm) < fim).length;
  return {
    inicio: chaveDia(ini), minutos: min, metaPct: s.ajustes.metaSemanalMin ? min / s.ajustes.metaSemanalMin : 0, dias,
    questoes: t.q, acerto: t.q ? t.a / t.q : null, revisoes: revs,
    maisEstudada: ordenado[0]?.[0], menosEstudada: s.materias.filter((m) => m.ativa).find((m) => !porMat.has(m.id))?.id ?? ordenado[ordenado.length - 1]?.[0],
  };
}

// ---------- ciclo automático ----------

const FATOR_DIF = { 1: 0.8, 2: 1, 3: 1.25 } as const;
const arred5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);

/**
 * Minutos sugeridos por matéria numa volta:
 * w = P × D × (1 + 1,5·max(0, alvo − acerto ajustado)) × (1 − 0,4·cobertura)
 * meta = T × w ÷ Σw, limitada a [30 min, 2,5 × média].
 */
export function cicloSugerido(s: AppState, totalMin?: number, agora = new Date()): { materia: Materia; atual: number; sugerido: number }[] {
  const ativas = s.materias.filter((m) => m.ativa).sort((a, b) => a.ordem - b.ordem);
  if (!ativas.length) return [];
  const T = totalMin ?? s.ciclo.minutosPorVolta ?? ativas.reduce((a, m) => a + m.metaCicloMin, 0);
  const alvo = s.ajustes.alvoAcerto ?? E().alvoAcertoPadrao;
  const des = new Map(desempenhoPorMateria(s, agora).map((d) => [d.materiaId, d]));
  const ws = ativas.map((m) => {
    const P = Math.max(1, (m.questoesProva ?? 10) * (m.pesoProva ?? 1));
    const D = FATOR_DIF[m.dificuldade ?? 2];
    const aj = des.get(m.id)?.ajustado ?? E().priorAcerto;
    const C = coberturaPonderada(s, m.id) ?? 0;
    return P * D * (1 + 1.5 * Math.max(0, alvo - aj)) * (1 - 0.4 * C);
  });
  const soma = ws.reduce((a, w) => a + w, 0);
  const media = T / ativas.length;
  return ativas.map((m, i) => ({
    materia: m, atual: m.metaCicloMin,
    sugerido: arred5(Math.max(30, Math.min(2.5 * media, (T * ws[i]) / soma))),
  }));
}

export function aplicarCicloSugerido(s: AppState, sugestao: { materia: Materia; sugerido: number }[], totalMin?: number): AppState {
  const mapa = new Map(sugestao.map((x) => [x.materia.id, x.sugerido]));
  return {
    ...s,
    ciclo: { ...s.ciclo, minutosPorVolta: totalMin ?? s.ciclo.minutosPorVolta },
    materias: s.materias.map((m) => (mapa.has(m.id) ? { ...m, metaCicloMin: mapa.get(m.id)! } : m)),
  };
}

// ---------- CSV ----------

const csvCampo = (v: unknown) => {
  const t = v === undefined || v === null ? '' : String(v);
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const linhaCsv = (xs: unknown[]) => xs.map(csvCampo).join(';');

export function csvSessoes(s: AppState): string {
  const nomeM = (id: string) => s.materias.find((m) => m.id === id)?.nome ?? '';
  const nomeA = (id?: string) => (id ? s.assuntos.find((a) => a.id === id)?.nome ?? '' : '');
  const head = ['data', 'hora', 'materia', 'assunto', 'minutos_liquidos', 'minutos_brutos', 'origem', 'questoes', 'acertos', 'saidas', 'xp', 'moedas'];
  const rows = [...s.sessoes].sort((a, b) => a.inicio.localeCompare(b.inicio)).map((x) => {
    const d = new Date(x.inicio);
    return linhaCsv([chaveDia(d), d.toTimeString().slice(0, 5), nomeM(x.materiaId), nomeA(x.assuntoId), x.duracaoMin, x.brutoMin ?? '', x.origem, x.questoes ?? '', x.acertos ?? '', x.saidas ?? '', x.xp, x.moedas]);
  });
  return '﻿' + [head.join(';'), ...rows].join('\n');
}

export function csvQuestoes(s: AppState): string {
  const nomeM = (id: string) => s.materias.find((m) => m.id === id)?.nome ?? '';
  const nomeA = (id?: string) => (id ? s.assuntos.find((a) => a.id === id)?.nome ?? '' : '');
  const head = ['data', 'materia', 'assunto', 'banca', 'formato', 'feitas', 'acertos', 'brancos', 'origem'];
  const rows = [...blocosDe(s)].sort((a, b) => a.em.localeCompare(b.em)).map((b) =>
    linhaCsv([chaveDia(b.em), nomeM(b.materiaId), nomeA(b.assuntoId), b.banca ?? '', b.formato ?? '', b.feitas, b.acertos, b.brancos ?? '', b.simuladoId ? 'simulado' : b.sessaoId ? 'sessao' : 'avulso']));
  return '﻿' + [head.join(';'), ...rows].join('\n');
}

/** Tendência do acerto num assunto (14 dias vs. 14 anteriores), ou null sem amostra suficiente. */
export function tendenciaAssunto(s: AppState, assuntoId: string, agora = new Date()): number | null {
  return tendencia(blocosDe(s).filter((b) => b.assuntoId === assuntoId), agora);
}
