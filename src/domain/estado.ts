import { ECONOMIA, animal } from './economia';
import { chaveDia, chaveSemana, diffDias, novoId } from './datas';
import { bonusSubidaNivel, nivelDeXp } from './niveis';
import { calcularOfensiva, multiplicadorOfensiva } from './ofensiva';
import { registrarNoCiclo } from './ciclo';
import { crescerCulturas, murcharCulturas } from './fazenda';
import type { AppState, Ajustes, ItemFazenda, LinhaRecompensa, ResumoSessao, Sessao } from './tipos';

export const SCHEMA_VERSION = 1;

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

  // acertos (limite diário)
  if (nova.acertos && nova.acertos > 0) {
    const dia = chaveDia(nova.inicio);
    const jaPagos = state.sessoes.filter((s) => chaveDia(s.inicio) === dia).reduce((a, s) => a + (s.acertos ?? 0), 0);
    const pagaveis = Math.max(0, Math.min(nova.acertos, eco.moedas.maxAcertosPagosPorDia - jaPagos));
    if (pagaveis > 0) linhas.push({ motivo: `${pagaveis} acerto(s) em questões`, moedas: pagaveis * eco.moedas.porAcerto });
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
  };

  let s: AppState = { ...state, sessoes: [...state.sessoes, sessao] };

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
  // XP e moedas já ganhos não são estornados (evita moedas negativas); só some do histórico.
  return { ...state, sessoes: state.sessoes.filter((s) => s.id !== id) };
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

/** Migrações entre versões do esquema + preenchimento de campos novos. */
export function migrar(dados: AppState): AppState {
  const base = estadoInicial();
  return {
    ...base,
    ...dados,
    ajustes: { ...AJUSTES_PADRAO, ...(dados.ajustes ?? {}) },
    registro: { ...base.registro, ...(dados.registro ?? {}) },
    ciclo: dados.ciclo ?? base.ciclo,
    schemaVersion: SCHEMA_VERSION,
  };
}
