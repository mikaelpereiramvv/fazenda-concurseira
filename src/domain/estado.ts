import { ECONOMIA, animal } from './economia';
import { chaveDia, chaveSemana, diffDias, novoId } from './datas';
import { bonusSubidaNivel, nivelDeXp } from './niveis';
import { calcularOfensiva, multiplicadorOfensiva } from './ofensiva';
import { estornarCiclo, registrarNoCiclo } from './ciclo';
import { aplicarEstudoNoAssunto } from './revisoes';
import { tendenciaAssunto } from './desempenho';
import { crescerCulturas, murcharCulturas } from './fazenda';
import type { AppState, Ajustes, BlocoQuestoes, Concurso, FormatoQuestao, ItemFazenda, LinhaRecompensa, ResumoSessao, Sessao } from './tipos';

export const SCHEMA_VERSION = 2;

export const CONCURSOS_PADRAO: Concurso[] = [
  { id: 'pc-al', nome: 'PC-AL', ativo: true },
  { id: 'pm-al', nome: 'PM-AL', ativo: true },
  { id: 'pc-pe', nome: 'PC-PE', ativo: true },
];

export const AJUSTES_PADRAO: Ajustes = {
  metaDiariaMin: 120,
  metaSemanalMin: 720,
  pomodoroMin: 25,
  pausaMin: 5,
  toleranciaSaidaSeg: 15,
  avisarSaida: true,
  encerrarAoSair: false,
  pausaMaxMin: 15,
  usarAtalhoFoco: false,
  atalhoOn: 'Fazenda Foco On',
  atalhoOff: 'Fazenda Foco Off',
  appsRedirecionar: ['Instagram', 'TikTok', 'YouTube', 'WhatsApp'],
  appsSaidaAutorizada: ['Leitor de PDF', 'Anki', 'Sites/apps de questões'],
  simularSaidaNoNavegador: false,
  sons: false,
  sessaoTelaMinima: false,
};

export function estadoInicial(agora = new Date()): AppState {
  const n = 8;
  const itens: ItemFazenda[] = [{ id: novoId(), tipo: 'construcao', ref: 'casa', x: 0, y: 0, nivel: 1 }];
  const posCanteiros = [[3, 3], [4, 3], [5, 3], [3, 4], [4, 4], [5, 4]];
  for (const [x, y] of posCanteiros.slice(0, ECONOMIA.terreno.canteirosIniciais)) {
    itens.push({ id: novoId(), tipo: 'canteiro', ref: 'canteiro', x, y });
  }
  void n;
  return {
    schemaVersion: SCHEMA_VERSION,
    criadoEm: agora.toISOString(),
    jogador: { xp: 0, moedas: 50, congeladores: 0 },
    materias: [],
    assuntos: [],
    ciclo: { rodada: 1, progresso: {} },
    sessoes: [],
    transacoes: [{ id: novoId(), em: agora.toISOString(), delta: 50, motivo: 'Boas-vindas à fazenda' }],
    fazenda: { lote: 1, itens },
    ajustes: { ...AJUSTES_PADRAO },
    registro: {
      metasDiariasPagas: [], metasSemanaisPagas: [], diasCongelados: [],
      marcosCongeladorGratis: [], tentativas: [],
      missoesResgatadas: [], cartasLidas: [], inventario: {},
    },
    concursos: CONCURSOS_PADRAO.map((c) => ({ ...c })),
    revisoes: [], blocos: [], erros: [], simulados: [],
  };
}

export interface NovaSessao {
  materiaId: string;
  assuntoId?: string;
  inicio: Date;
  duracaoMin: number;
  origem: Sessao['origem'];
  modo?: Sessao['modo'];
  pomodoros?: number;
  questoes?: number;
  acertos?: number;
  penalizada?: boolean;
  banca?: string;
  formato?: FormatoQuestao;
  brutoMin?: number;
  pausasQtd?: number;
  saidas?: number;
}

/**
 * Registra uma sessão (cronômetro ou manual) e aplica TODAS as recompensas:
 * XP, moedas, bônus, níveis, metas, animais, ciclo e crescimento das plantações.
 */
export function registrarSessao(state: AppState, nova: NovaSessao, agora = new Date()): { state: AppState; resumo: ResumoSessao } {
  const eco = ECONOMIA;
  const cron = nova.origem === 'cronometro';
  const dur = Math.max(0, Math.floor(nova.duracaoMin));
  const linhas: LinhaRecompensa[] = [];
  const ofensivaAntes = calcularOfensiva(state, agora);
  const mult = multiplicadorOfensiva(ofensivaAntes);

  // moedas por minuto
  if (dur >= eco.moedas.sessaoMinimaParaMoedasMin) {
    const porMin = cron ? eco.moedas.porMinutoCronometro : eco.moedas.porMinutoManual;
    const base = Math.floor(dur * porMin);
    linhas.push({ motivo: `${dur} min de estudo${cron ? '' : ' (manual, 50%)'}`, moedas: base });
    const extra = Math.floor(base * mult);
    if (extra > 0) linhas.push({ motivo: `Ofensiva de ${ofensivaAntes} dias (+${Math.round(mult * 100)}%)`, moedas: extra });
  }
  if (cron && nova.modo === 'pomodoro' && nova.pomodoros) {
    linhas.push({ motivo: `${nova.pomodoros} Pomodoro(s) completo(s)`, moedas: nova.pomodoros * eco.moedas.bonusPomodoroCompleto });
  }
  if (cron && dur >= 60) linhas.push({ motivo: 'Sessão de 1 h ou mais', moedas: eco.moedas.bonusSessao60Min });

  // questões: paga por FAZER (não pelo acerto), só o que é plausível no tempo, com teto diário
  const est = eco.estudo;
  const q = Math.max(0, nova.questoes ?? 0);
  let questoesPagas = 0;
  if (q > 0 && dur > 0) {
    const plausivel = Math.floor((dur * 60) / est.segMinPorQuestao);
    const dia = chaveDia(nova.inicio);
    const jaPagas = state.sessoes.filter((x) => chaveDia(x.inicio) === dia).reduce((a, x) => a + Math.min(x.questoes ?? 0, Math.floor((x.duracaoMin * 60) / est.segMinPorQuestao)), 0);
    questoesPagas = Math.max(0, Math.min(q, plausivel, est.maxQuestoesPagasDia - jaPagas));
    const valor = Math.floor(questoesPagas * est.porQuestao * (cron ? 1 : 0.5));
    if (valor > 0) linhas.push({ motivo: `${questoesPagas} questão(ões) resolvida(s)${cron ? '' : ' (manual, 50%)'}`, moedas: valor });
  }
  // foco: sessão de cronômetro sem sair do app e quase sem pausas
  if (cron && dur >= est.focoMinMin && (nova.saidas ?? 0) === 0 && nova.brutoMin && dur / nova.brutoMin >= est.focoMinIndice) {
    linhas.push({ motivo: 'Foco total (sem sair do app) 🎯', moedas: est.bonusFoco });
  }

  const sessao: Sessao = {
    id: novoId(),
    materiaId: nova.materiaId,
    assuntoId: nova.assuntoId,
    inicio: nova.inicio.toISOString(),
    duracaoMin: dur,
    origem: nova.origem,
    criadaEm: agora.toISOString(),
    modo: nova.modo,
    pomodoros: nova.pomodoros,
    questoes: nova.questoes,
    acertos: nova.acertos,
    penalizada: nova.penalizada,
    xp: dur,
    moedas: 0,
    ...(nova.brutoMin !== undefined ? { brutoMin: Math.round(nova.brutoMin) } : {}),
    ...(nova.pausasQtd !== undefined ? { pausasQtd: nova.pausasQtd } : {}),
    ...(nova.saidas !== undefined ? { saidas: nova.saidas } : {}),
    ...(nova.banca ? { banca: nova.banca } : {}),
  };

  let s: AppState = { ...state, sessoes: [...state.sessoes, sessao] };

  // bloco de questões (fonte das métricas de desempenho)
  if (q > 0) {
    const bloco: BlocoQuestoes = {
      id: novoId(), sessaoId: sessao.id, em: sessao.inicio, materiaId: nova.materiaId, assuntoId: nova.assuntoId,
      feitas: q, acertos: Math.min(q, Math.max(0, nova.acertos ?? 0)), banca: nova.banca, formato: nova.formato,
    };
    s = { ...s, blocos: [...(s.blocos ?? []), bloco] };
  }

  // revisões espaçadas do assunto
  if (nova.assuntoId) {
    const r = aplicarEstudoNoAssunto(s, {
      assuntoId: nova.assuntoId, materiaId: nova.materiaId, quando: nova.inicio, minutos: dur,
      questoes: q || undefined, acertos: q ? nova.acertos : undefined, manual: !cron,
    }, agora);
    s = r.state;
    if (r.moedas > 0) linhas.push({ motivo: 'Revisão espaçada no prazo 🔁', moedas: r.moedas });
    // ponto fraco que melhorou (≥ +10 p.p., amostra mínima nas duas janelas, 1× a cada 30 dias por assunto)
    const t = tendenciaAssunto(s, nova.assuntoId, agora);
    const ultimo = s.registro.bonusPontoFraco?.[nova.assuntoId];
    if (t !== null && t >= 0.1 && (!ultimo || diffDias(ultimo, agora) >= 30)) {
      linhas.push({ motivo: 'Ponto fraco melhorou! 📈', moedas: eco.estudo.bonusPontoFracoMelhorou });
      s = { ...s, registro: { ...s.registro, bonusPontoFraco: { ...(s.registro.bonusPontoFraco ?? {}), [nova.assuntoId]: chaveDia(agora) } } };
    }
  }

  // XP e níveis
  const nivelAntes = nivelDeXp(state.jogador.xp).nivel;
  const xpDepois = state.jogador.xp + dur;
  const nivelDepois = nivelDeXp(xpDepois).nivel;
  if (nivelDepois > nivelAntes) {
    linhas.push({ motivo: `Subiu para o nível ${nivelDepois}!`, moedas: bonusSubidaNivel(nivelAntes, nivelDepois) });
  }

  // metas (pagas uma vez por dia/semana)
  const diaK = chaveDia(nova.inicio);
  const semK = chaveSemana(nova.inicio);
  const minDia = s.sessoes.filter((x) => chaveDia(x.inicio) === diaK).reduce((a, x) => a + x.duracaoMin, 0);
  const minSem = s.sessoes.filter((x) => chaveSemana(x.inicio) === semK).reduce((a, x) => a + x.duracaoMin, 0);
  const registro = { ...s.registro };
  if (minDia >= s.ajustes.metaDiariaMin && !registro.metasDiariasPagas.includes(diaK)) {
    registro.metasDiariasPagas = [...registro.metasDiariasPagas, diaK];
    linhas.push({ motivo: 'Meta diária batida! 🎯', moedas: eco.moedas.metaDiaria });
    for (const it of s.fazenda.itens.filter((i) => i.tipo === 'animal')) {
      const a = animal(it.ref);
      if (a?.bonusMetaDiaria) linhas.push({ motivo: `${a.nome} comemorou`, moedas: a.bonusMetaDiaria });
    }
  }
  if (minSem >= s.ajustes.metaSemanalMin && !registro.metasSemanaisPagas.includes(semK)) {
    registro.metasSemanaisPagas = [...registro.metasSemanaisPagas, semK];
    linhas.push({ motivo: 'Meta semanal batida! 🌼', moedas: eco.moedas.metaSemanal });
  }
  s = { ...s, registro };

  // congelador grátis a cada N dias de ofensiva
  const ofensivaDepois = calcularOfensiva(s, agora);
  const marco = eco.ofensiva.congeladorGratisACadaDias;
  let congeladores = s.jogador.congeladores;
  const hojeK = chaveDia(agora);
  if (ofensivaDepois > 0 && ofensivaDepois % marco === 0 && !s.registro.marcosCongeladorGratis.includes(hojeK)) {
    if (congeladores < eco.ofensiva.congeladorEstoqueMax) congeladores++;
    s = { ...s, registro: { ...s.registro, marcosCongeladorGratis: [...s.registro.marcosCongeladorGratis, hojeK] } };
  }

  const moedas = linhas.reduce((a, l) => a + l.moedas, 0);
  sessao.moedas = moedas;
  s = {
    ...s,
    jogador: { ...s.jogador, xp: xpDepois, moedas: s.jogador.moedas + moedas, congeladores },
    transacoes: moedas > 0
      ? [...s.transacoes, { id: novoId(), em: agora.toISOString(), delta: moedas, motivo: `Sessão de estudo (${dur} min)` }]
      : s.transacoes,
  };

  // ciclo de estudos (só conta estudo recente, para lançamentos antigos não bagunçarem a volta)
  if (diffDias(nova.inicio, agora) <= 2) s = registrarNoCiclo(s, nova.materiaId, dur).state;

  // plantações crescem com o estudo
  const fator = cron ? 1 : eco.plantacao.crescimentoManualFator;
  const cresc = crescerCulturas(s, Math.floor(dur * fator));
  s = cresc.state;

  return {
    state: s,
    resumo: { sessao, xp: dur, moedas, linhas, nivelAntes, nivelDepois, culturasProntas: cresc.prontas },
  };
}

export function excluirSessao(state: AppState, id: string): AppState {
  // XP e moedas já ganhos não são estornados (evita moedas negativas).
  // O progresso no ciclo é estornado se a sessão contou para a volta atual; o bloco de questões sai junto.
  const alvo = state.sessoes.find((s) => s.id === id);
  if (!alvo) return state;
  let s: AppState = { ...state, sessoes: state.sessoes.filter((x) => x.id !== id), blocos: (state.blocos ?? []).filter((b) => b.sessaoId !== id) };
  const daVoltaAtual = !state.ciclo.inicioRodadaEm || alvo.criadaEm >= state.ciclo.inicioRodadaEm;
  if (daVoltaAtual && diffDias(alvo.inicio, alvo.criadaEm) <= 2) s = estornarCiclo(s, alvo.materiaId, alvo.duracaoMin);
  return s;
}

export function aplicarPenalidadeSaida(state: AppState, app = 'fora do app'): { state: AppState; murchas: number } {
  const r = murcharCulturas(state);
  const s = r.state.sessaoAtiva
    ? { ...r.state, sessaoAtiva: { ...r.state.sessaoAtiva, penalidades: r.state.sessaoAtiva.penalidades + 1 } }
    : r.state;
  return {
    murchas: r.murchas,
    state: { ...s, registro: { ...s.registro, tentativas: [...s.registro.tentativas, { em: new Date().toISOString(), app }] } },
  };
}

// ---------- Backup ----------

export interface Backup {
  app: 'fazenda-concurseira';
  schemaVersion: number;
  exportadoEm: string;
  dados: AppState;
}

export function gerarBackup(state: AppState): Backup {
  return { app: 'fazenda-concurseira', schemaVersion: SCHEMA_VERSION, exportadoEm: new Date().toISOString(), dados: state };
}

export function lerBackup(texto: string): { ok: true; state: AppState; resumo: string } | { ok: false; erro: string } {
  let obj: unknown;
  try { obj = JSON.parse(texto); } catch { return { ok: false, erro: 'Arquivo não é um JSON válido.' }; }
  const b = obj as Partial<Backup>;
  if (b?.app !== 'fazenda-concurseira' || !b.dados) return { ok: false, erro: 'Esse arquivo não é um backup da Fazenda Concurseira.' };
  if ((b.schemaVersion ?? 0) > SCHEMA_VERSION) return { ok: false, erro: 'Backup de uma versão mais nova do app. Atualize o app primeiro.' };
  const state = migrar(b.dados);
  const futuras = state.sessoes.filter((s) => new Date(s.inicio).getTime() > Date.now() + 60_000);
  if (futuras.length) return { ok: false, erro: `Backup inválido: ${futuras.length} sessão(ões) com data futura.` };
  const nivel = nivelDeXp(state.jogador.xp).nivel;
  return { ok: true, state, resumo: `${state.sessoes.length} sessões, nível ${nivel}, ${state.jogador.moedas} moedas` };
}

/**
 * Migrações entre versões do esquema + preenchimento de campos novos. Idempotente e sem perda:
 * v1 → v2: cria blocos de questões a partir das sessões antigas, agenda revisão para assuntos já
 * "revisados", cadastra os concursos padrão e inicializa as coleções novas.
 */
export function migrar(dados: AppState): AppState {
  const base = estadoInicial();
  let s: AppState = {
    ...base,
    ...dados,
    ajustes: { ...AJUSTES_PADRAO, ...(dados.ajustes ?? {}) },
    registro: { ...base.registro, ...(dados.registro ?? {}) },
    ciclo: dados.ciclo ?? base.ciclo,
    concursos: dados.concursos ?? base.concursos,
    revisoes: dados.revisoes ?? [],
    blocos: dados.blocos ?? [],
    erros: dados.erros ?? [],
    simulados: dados.simulados ?? [],
  };
  // blocos a partir de sessões antigas com questões (não duplica se rodar de novo)
  const comBloco = new Set((s.blocos ?? []).map((b) => b.sessaoId).filter(Boolean));
  const novos: BlocoQuestoes[] = s.sessoes
    .filter((x) => (x.questoes ?? 0) > 0 && !comBloco.has(x.id))
    .map((x) => ({ id: `mig-${x.id}`, sessaoId: x.id, em: x.inicio, materiaId: x.materiaId, assuntoId: x.assuntoId, feitas: x.questoes!, acertos: Math.min(x.questoes!, x.acertos ?? 0), banca: x.banca }));
  if (novos.length) s = { ...s, blocos: [...(s.blocos ?? []), ...novos] };
  // assuntos marcados como "revisado" antes das revisões existirem: agenda a próxima em 7 dias
  const comRevisao = new Set((s.revisoes ?? []).map((r) => r.assuntoId));
  const hoje = new Date();
  const agendadas = s.assuntos
    .filter((a) => a.status === 'revisado' && !comRevisao.has(a.id))
    .map((a) => ({
      id: `mig-${a.id}`, assuntoId: a.id, materiaId: a.materiaId, etapa: 1, intervaloDias: 7,
      devidaEm: chaveDia(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 7)),
    }));
  if (agendadas.length) {
    s = {
      ...s,
      revisoes: [...(s.revisoes ?? []), ...agendadas],
      assuntos: s.assuntos.map((a) => (a.status === 'revisado' && a.revisoesFeitas === undefined ? { ...a, revisoesFeitas: 1 } : a)),
    };
  }
  // data do 1º estudo de cada assunto (para o ritmo), a partir das sessões antigas
  const primeiro = new Map<string, string>();
  for (const x of s.sessoes) if (x.assuntoId && (!primeiro.has(x.assuntoId) || x.inicio < primeiro.get(x.assuntoId)!)) primeiro.set(x.assuntoId, x.inicio);
  if ([...primeiro.keys()].some((id) => s.assuntos.find((a) => a.id === id && !a.estudadoEm))) {
    s = { ...s, assuntos: s.assuntos.map((a) => (!a.estudadoEm && primeiro.has(a.id) ? { ...a, estudadoEm: primeiro.get(a.id) } : a)) };
  }
  return { ...s, schemaVersion: SCHEMA_VERSION };
}
