// Revisões espaçadas por assunto (1-7-30-60-120 dias, ajustadas pelo acerto) e caderno de erros (Leitner).
import { ECONOMIA } from './economia';
import { chaveDia, deChaveDia, diffDias, novoId, somarDias } from './datas';
import { registrarCarta, registrarMissaoCapitulo } from './missoes';
import type { AppState, Assunto, BlocoQuestoes, FormatoQuestao, ItemErro, MotivoErro, Revisao, StatusAssunto } from './tipos';

const E = () => ECONOMIA.estudo;
const ORDEM_STATUS: StatusAssunto[] = ['nao_visto', 'teoria', 'questoes', 'revisado'];
const subir = (atual: StatusAssunto, novo: StatusAssunto) => (ORDEM_STATUS.indexOf(novo) > ORDEM_STATUS.indexOf(atual) ? novo : atual);

export const revisoesDe = (s: AppState) => s.revisoes ?? [];
export const pendentes = (s: AppState) => revisoesDe(s).filter((r) => !r.feitaEm);

/** Revisões vencidas até hoje (inclusive), mais atrasadas primeiro. */
export function revisoesDoDia(s: AppState, hoje = new Date()): (Revisao & { atrasoDias: number })[] {
  const h = chaveDia(hoje);
  return pendentes(s)
    .filter((r) => r.devidaEm <= h)
    .map((r) => ({ ...r, atrasoDias: diffDias(deChaveDia(r.devidaEm), hoje) }))
    .sort((a, b) => b.atrasoDias - a.atrasoDias);
}

export function revisoesAtrasadas(s: AppState, dias = E().atrasoErvaDias, hoje = new Date()) {
  return revisoesDoDia(s, hoje).filter((r) => r.atrasoDias > dias).length;
}

/**
 * Próximo intervalo de revisão:
 * - sem questões: segue a sequência 1 → 7 → 30 → 60 → 120 (depois dobra, até o máximo);
 * - acerto < 60%: volta para o começo (1 dia);
 * - 60–84%: avança, mas mais devagar (máx(60% do padrão, intervalo atual × 1,5));
 * - ≥ 85%: avança rápido (máx(padrão, intervalo atual × 2,5)).
 */
export function proximoIntervalo(r: Pick<Revisao, 'etapa' | 'intervaloDias'>, acerto?: number): { etapa: number; intervalo: number } {
  const seq = E().intervalosRevisao;
  const max = E().intervaloMaxDias;
  const etapa = r.etapa + 1;
  const padrao = etapa < seq.length ? seq[etapa] : seq[seq.length - 1] * 2 ** (etapa - seq.length + 1);
  if (acerto === undefined) return { etapa, intervalo: Math.min(max, padrao) };
  if (acerto < 0.6) return { etapa: 0, intervalo: seq[0] };
  const intervalo = acerto >= 0.85
    ? Math.max(padrao, Math.round(r.intervaloDias * 2.5))
    : Math.max(Math.round(padrao * 0.6), Math.round(r.intervaloDias * 1.5));
  return { etapa, intervalo: Math.max(1, Math.min(max, intervalo)) };
}

function atualizarAssunto(s: AppState, assuntoId: string, fn: (a: Assunto) => Assunto): AppState {
  return { ...s, assuntos: s.assuntos.map((a) => (a.id === assuntoId ? fn(a) : a)) };
}

/**
 * Chamado sempre que há estudo num assunto (sessão de cronômetro/manual ou bloco de questões).
 * - 1º estudo do assunto: agenda a 1ª revisão para o dia seguinte.
 * - Se há revisão vencida e o estudo foi relevante (≥10 min ou ≥5 questões): conclui a revisão e agenda a próxima.
 * Retorna as moedas a pagar (revisão feita no prazo), já descontando o fator manual.
 */
export function aplicarEstudoNoAssunto(
  s: AppState,
  o: { assuntoId: string; materiaId: string; quando: Date; minutos: number; questoes?: number; acertos?: number; manual?: boolean },
  agora = new Date(),
): { state: AppState; moedas: number; revisaoFeita: boolean } {
  let st = s;
  const assunto = st.assuntos.find((a) => a.id === o.assuntoId);
  if (!assunto) return { state: s, moedas: 0, revisaoFeita: false };
  const temQuestoes = (o.questoes ?? 0) > 0;
  st = atualizarAssunto(st, o.assuntoId, (a) => ({
    ...a,
    estudadoEm: a.estudadoEm ?? o.quando.toISOString(),
    status: subir(a.status, temQuestoes ? 'questoes' : 'teoria'),
  }));

  const revs = revisoesDe(st);
  const pendente = revs.find((r) => r.assuntoId === o.assuntoId && !r.feitaEm);
  const relevante = o.minutos >= 10 || (o.questoes ?? 0) >= 5;
  const diaEstudo = chaveDia(o.quando);

  if (!pendente) {
    // primeiro estudo (ou ciclo encerrado): agenda D+1
    const nova: Revisao = {
      id: novoId(), assuntoId: o.assuntoId, materiaId: o.materiaId, etapa: 0, intervaloDias: E().intervalosRevisao[0],
      devidaEm: chaveDia(somarDias(o.quando, E().intervalosRevisao[0])),
    };
    return { state: { ...st, revisoes: [...revs, nova] }, moedas: 0, revisaoFeita: false };
  }
  if (pendente.devidaEm > diaEstudo || !relevante) return { state: st, moedas: 0, revisaoFeita: false };

  // conclui a revisão
  const acerto = temQuestoes ? (o.acertos ?? 0) / (o.questoes as number) : undefined;
  const prox = proximoIntervalo(pendente, (o.questoes ?? 0) >= 5 ? acerto : undefined);
  const noPrazo = diffDias(deChaveDia(pendente.devidaEm), o.quando) <= 1;
  const hojeK = chaveDia(agora);
  const pagasHoje = revs.filter((r) => r.feitaEm && chaveDia(r.feitaEm) === hojeK && (r.moedas ?? 0) > 0).length;
  let moedas = noPrazo && pagasHoje < E().maxRevisoesPagasDia ? E().porRevisaoNoPrazo : 0;
  if (o.manual) moedas = Math.floor(moedas / 2);
  const feita: Revisao = { ...pendente, feitaEm: o.quando.toISOString(), questoes: o.questoes, acertos: o.acertos, moedas };
  const proxima: Revisao = {
    id: novoId(), assuntoId: o.assuntoId, materiaId: o.materiaId, etapa: prox.etapa, intervaloDias: prox.intervalo,
    devidaEm: chaveDia(somarDias(o.quando, prox.intervalo)),
  };
  st = { ...st, revisoes: revs.map((r) => (r.id === pendente.id ? feita : r)).concat(proxima) };
  st = atualizarAssunto(st, o.assuntoId, (a) => {
    const n = (a.revisoesFeitas ?? 0) + 1;
    return { ...a, revisoesFeitas: n, status: n >= 2 ? 'revisado' : a.status };
  });
  return { state: st, moedas, revisaoFeita: true };
}

/** Revisões feitas até 1 dia depois do vencimento ÷ revisões que venceram nos últimos 7 dias. */
export function revisoesEmDia(s: AppState, hoje = new Date()): { taxa: number | null; atrasadas: number } {
  const ini = chaveDia(somarDias(hoje, -7)), h = chaveDia(hoje);
  const venceram = revisoesDe(s).filter((r) => r.devidaEm >= ini && r.devidaEm <= h);
  const emDia = venceram.filter((r) => r.feitaEm && diffDias(deChaveDia(r.devidaEm), new Date(r.feitaEm)) <= 1).length;
  return { taxa: venceram.length ? emDia / venceram.length : null, atrasadas: revisoesDoDia(s, hoje).filter((r) => r.atrasoDias > 1).length };
}

/** Adia uma revisão (sem pagar nada). */
export function adiarRevisao(s: AppState, id: string, dias = 1): AppState {
  return { ...s, revisoes: revisoesDe(s).map((r) => (r.id === id ? { ...r, devidaEm: chaveDia(somarDias(new Date(), dias)) } : r)) };
}

// ---------- caderno de erros (Leitner) ----------

export const errosDe = (s: AppState) => s.erros ?? [];
export const errosDoDia = (s: AppState, hoje = new Date()) =>
  errosDe(s).filter((e) => !e.resolvidoEm && e.proximaEm <= chaveDia(hoje));

export const MOTIVOS: Record<MotivoErro, string> = {
  conteudo: 'Não sabia o conteúdo', interpretacao: 'Interpretei errado', atencao: 'Falta de atenção',
  pegadinha: 'Caí na pegadinha', chute: 'Chutei',
};

export function criarErro(s: AppState, e: Omit<ItemErro, 'id' | 'criadoEm' | 'caixa' | 'proximaEm'>, agora = new Date()): AppState {
  const item: ItemErro = { ...e, id: novoId(), criadoEm: agora.toISOString(), caixa: 1, proximaEm: chaveDia(somarDias(agora, E().intervalosErros[0])), revisoes: 0 };
  return { ...s, erros: [...errosDe(s), item] };
}

export function revisarErro(s: AppState, id: string, acertou: boolean, agora = new Date()): { state: AppState; moedas: number; resolvido: boolean } {
  const e = errosDe(s).find((x) => x.id === id);
  if (!e || e.resolvidoEm) return { state: s, moedas: 0, resolvido: false };
  const ints = E().intervalosErros;
  let caixa = acertou ? e.caixa + 1 : 1;
  let resolvidoEm: string | undefined;
  if (caixa > ints.length) { resolvidoEm = agora.toISOString(); caixa = ints.length; }
  const atualizado: ItemErro = {
    ...e, caixa, resolvidoEm, revisoes: (e.revisoes ?? 0) + 1,
    proximaEm: chaveDia(somarDias(agora, ints[Math.min(caixa, ints.length) - 1])),
  };
  const dia = chaveDia(agora);
  const pagos = s.registro.errosPagosDia?.[dia] ?? 0;
  const moedas = pagos < E().maxErrosPagosDia ? E().porErroRevisado : 0;
  const registro = { ...s.registro, errosPagosDia: { [dia]: pagos + (moedas ? 1 : 0) } };
  let st: AppState = { ...s, registro, erros: errosDe(s).map((x) => (x.id === id ? atualizado : x)) };
  if (moedas) {
    st = {
      ...st,
      jogador: { ...st.jogador, moedas: st.jogador.moedas + moedas },
      transacoes: [...st.transacoes, { id: novoId(), em: agora.toISOString(), delta: moedas, motivo: 'Caderno de erros' }],
    };
  }
  return { state: st, moedas, resolvido: !!resolvidoEm };
}

// ---------- missões e cartas ligadas às revisões ----------

registrarMissaoCapitulo({
  id: 'c_revisoes', npc: 'zuleide', tipo: 'capitulo', titulo: 'Revisão é colheita', descricao: 'Faça 10 revisões espaçadas.', meta: 10,
  progresso: (s) => revisoesDe(s).filter((r) => r.feitaEm).length, recompensa: { moedas: 80 },
});
registrarMissaoCapitulo({
  id: 'c_caderno', npc: 'zuleide', tipo: 'capitulo', titulo: 'Erro que ensina', descricao: 'Revise 20 itens do caderno de erros.', meta: 20,
  progresso: (s) => errosDe(s).reduce((a, e) => a + (e.revisoes ?? 0), 0), recompensa: { moedas: 60 },
});
registrarCarta({
  id: 'revisao_explica', npc: 'zuleide', titulo: 'Sobre as revisões',
  texto: 'Agora cada assunto que você estuda ganha revisões: amanhã, em 7 dias, em 30... Acertou bem, o intervalo cresce. Errou, volta pro começo. Atrasou muito, aparece mato no canteiro.',
  quando: (s) => revisoesDe(s).length > 0,
});

// ---------- registros avulsos (sem cronômetro) ----------


function creditar(s: AppState, moedas: number, motivo: string, agora: Date): AppState {
  if (moedas <= 0) return s;
  return {
    ...s,
    jogador: { ...s.jogador, moedas: s.jogador.moedas + moedas },
    transacoes: [...s.transacoes, { id: novoId(), em: agora.toISOString(), delta: moedas, motivo }],
  };
}

/**
 * Questões feitas fora do cronômetro (ex.: no Qconcursos). Entram nas métricas e podem concluir uma
 * revisão vencida do assunto (com 5+ questões). Não pagam moedas por questão (não há tempo medido).
 */
export function registrarQuestoesAvulsas(
  s: AppState,
  o: { materiaId: string; assuntoId?: string; banca?: string; formato?: FormatoQuestao; feitas: number; acertos: number },
  agora = new Date(),
): { state: AppState; moedas: number; revisaoFeita: boolean } {
  if (o.feitas <= 0) return { state: s, moedas: 0, revisaoFeita: false };
  const bloco: BlocoQuestoes = {
    id: novoId(), em: agora.toISOString(), materiaId: o.materiaId, assuntoId: o.assuntoId, banca: o.banca, formato: o.formato,
    feitas: o.feitas, acertos: Math.min(o.feitas, Math.max(0, o.acertos)),
  };
  let st: AppState = { ...s, blocos: [...(s.blocos ?? []), bloco] };
  if (!o.assuntoId) return { state: st, moedas: 0, revisaoFeita: false };
  const r = aplicarEstudoNoAssunto(st, { assuntoId: o.assuntoId, materiaId: o.materiaId, quando: agora, minutos: 0, questoes: o.feitas, acertos: bloco.acertos, manual: true }, agora);
  st = creditar(r.state, r.moedas, 'Revisão espaçada no prazo', agora);
  return { state: st, moedas: r.moedas, revisaoFeita: r.revisaoFeita };
}

/** "Revisei" a partir da lista do dia: com questões (5+) ou só leitura (conta como 10 min, paga metade). */
export function revisarAvulso(
  s: AppState, revisaoId: string, o: { questoes?: number; acertos?: number; banca?: string; formato?: FormatoQuestao }, agora = new Date(),
): { state: AppState; moedas: number; ok: boolean } {
  const r = revisoesDe(s).find((x) => x.id === revisaoId && !x.feitaEm);
  if (!r) return { state: s, moedas: 0, ok: false };
  const q = o.questoes ?? 0;
  let st = s;
  if (q > 0) {
    const bloco: BlocoQuestoes = {
      id: novoId(), em: agora.toISOString(), materiaId: r.materiaId, assuntoId: r.assuntoId, banca: o.banca, formato: o.formato,
      feitas: q, acertos: Math.min(q, Math.max(0, o.acertos ?? 0)),
    };
    st = { ...st, blocos: [...(st.blocos ?? []), bloco] };
  }
  const res = aplicarEstudoNoAssunto(st, {
    assuntoId: r.assuntoId, materiaId: r.materiaId, quando: agora, minutos: q >= 5 ? 0 : 10,
    questoes: q || undefined, acertos: q ? Math.min(q, o.acertos ?? 0) : undefined, manual: true,
  }, agora);
  return { state: creditar(res.state, res.moedas, 'Revisão espaçada no prazo', agora), moedas: res.moedas, ok: res.revisaoFeita };
}
