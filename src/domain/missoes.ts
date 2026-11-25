// Enredo e missões. Toda condição lê SÓ dados de estudo (nunca ações do jogo).
import { ECONOMIA, construcao } from './economia';
import { chaveDia, chaveSemana, deChaveDia, diffDias, novoId } from './datas';
import { nivelDeXp } from './niveis';
import { calcularOfensiva } from './ofensiva';
import type { AppState, Sessao } from './tipos';

export type Npc = 'benedita' | 'tiao' | 'zuleide' | 'ze';
export const NPCS: Record<Npc, { nome: string; emoji: string; papel: string }> = {
  benedita: { nome: 'Vó Benedita', emoji: '👵🏽', papel: 'Deixou o sítio pra você' },
  tiao: { nome: 'Seu Tião', emoji: '🤠', papel: 'Tropeiro, cobra constância' },
  zuleide: { nome: 'Profª Zuleide', emoji: '👩🏾‍🏫', papel: 'Aposentada, aprovada no TRT' },
  ze: { nome: 'Zé do Correio', emoji: '🚲', papel: 'Entrega as cartas' },
};

export interface Recompensa { moedas?: number; congelador?: number; item?: string }

type Tipo = 'diaria' | 'semanal' | 'capitulo';
export interface DefMissao {
  id: string; npc: Npc; tipo: Tipo; titulo: string; descricao: string; meta: number;
  progresso: (s: AppState, agora: Date) => number;
  recompensa: Recompensa;
}

export interface Missao extends Omit<DefMissao, 'progresso'> {
  chave: string; atual: number; concluida: boolean; resgatada: boolean;
}

// ---------- utilitários sobre sessões ----------

const fator = (x: Sessao) => (x.origem === 'manual' ? ECONOMIA.missoes.manualConta : 1);
const doDia = (s: AppState, d: Date) => s.sessoes.filter((x) => chaveDia(x.inicio) === chaveDia(d));
const daSemana = (s: AppState, d: Date) => s.sessoes.filter((x) => chaveSemana(x.inicio) === chaveSemana(d));
const minutos = (xs: Sessao[]) => xs.reduce((a, x) => a + x.duracaoMin * fator(x), 0);
const questoes = (xs: Sessao[]) => xs.reduce((a, x) => a + (x.questoes ?? 0) * fator(x), 0);
function porMateriaMin(xs: Sessao[]) {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x.materiaId, (m.get(x.materiaId) ?? 0) + x.duracaoMin * fator(x));
  return m;
}
function diasComMinimo(s: AppState, d: Date, min: number) {
  const porDia = new Map<string, number>();
  for (const x of daSemana(s, d)) porDia.set(chaveDia(x.inicio), (porDia.get(chaveDia(x.inicio)) ?? 0) + x.duracaoMin * fator(x));
  return [...porDia.values()].filter((v) => v >= min).length;
}

// ---------- catálogo ----------

const DIARIAS: DefMissao[] = [
  { id: 'd_60min', npc: 'tiao', tipo: 'diaria', titulo: 'Uma hora de lida', descricao: 'Estude 60 min hoje.', meta: 60,
    progresso: (s, d) => minutos(doDia(s, d)), recompensa: { moedas: ECONOMIA.missoes.diaria } },
  { id: 'd_pomodoros', npc: 'tiao', tipo: 'diaria', titulo: 'Três tomates', descricao: 'Complete 3 Pomodoros hoje.', meta: 3,
    progresso: (s, d) => doDia(s, d).reduce((a, x) => a + (x.pomodoros ?? 0), 0), recompensa: { moedas: ECONOMIA.missoes.diaria } },
  { id: 'd_duas_materias', npc: 'zuleide', tipo: 'diaria', titulo: 'Variar o roçado', descricao: 'Estude 2 matérias diferentes hoje (25+ min cada).', meta: 2,
    progresso: (s, d) => [...porMateriaMin(doDia(s, d)).values()].filter((v) => v >= 25).length, recompensa: { moedas: ECONOMIA.missoes.diaria } },
  { id: 'd_questoes', npc: 'zuleide', tipo: 'diaria', titulo: 'Mão na massa', descricao: 'Resolva 20 questões hoje.', meta: 20,
    progresso: (s, d) => questoes(doDia(s, d)), recompensa: { moedas: ECONOMIA.missoes.diaria } },
  { id: 'd_meta', npc: 'benedita', tipo: 'diaria', titulo: 'Terra boa', descricao: 'Bata a meta diária de estudo.', meta: 1,
    progresso: (s, d) => (minutos(doDia(s, d)) >= s.ajustes.metaDiariaMin ? 1 : 0), recompensa: { moedas: ECONOMIA.missoes.diaria } },
];

const SEMANAIS: DefMissao[] = [
  { id: 's_4metas', npc: 'tiao', tipo: 'semanal', titulo: 'Semana de tropa', descricao: 'Bata a meta diária em 4 dias desta semana.', meta: 4,
    progresso: (s, d) => diasComMinimo(s, d, s.ajustes.metaDiariaMin), recompensa: { moedas: ECONOMIA.missoes.semanal } },
  { id: 's_tres_materias', npc: 'zuleide', tipo: 'semanal', titulo: 'Três frentes', descricao: 'Estude 3 matérias com 1 h ou mais nesta semana.', meta: 3,
    progresso: (s, d) => [...porMateriaMin(daSemana(s, d)).values()].filter((v) => v >= 60).length, recompensa: { moedas: ECONOMIA.missoes.semanal } },
  { id: 's_questoes', npc: 'zuleide', tipo: 'semanal', titulo: 'Cem questões', descricao: 'Resolva 100 questões nesta semana.', meta: 100,
    progresso: (s, d) => questoes(daSemana(s, d)), recompensa: { moedas: ECONOMIA.missoes.semanal } },
  { id: 's_seis_dias', npc: 'tiao', tipo: 'semanal', titulo: 'Seis dias de lida', descricao: 'Estude 30+ min em 6 dias desta semana.', meta: 6,
    progresso: (s, d) => diasComMinimo(s, d, 30), recompensa: { moedas: ECONOMIA.missoes.semanal } },
];

export const CAPITULO: DefMissao[] = [
  { id: 'c_primeiro_rocado', npc: 'benedita', tipo: 'capitulo', titulo: 'Primeiro roçado', descricao: 'Faça uma sessão de cronômetro de 25 min ou mais.', meta: 1,
    progresso: (s) => (s.sessoes.some((x) => x.origem === 'cronometro' && x.duracaoMin >= 25) ? 1 : 0), recompensa: { moedas: 30, item: 'caixa_correio' } },
  { id: 'c_pe_na_estrada', npc: 'tiao', tipo: 'capitulo', titulo: 'Pé na estrada', descricao: 'Chegue a 5 dias seguidos de ofensiva.', meta: 5,
    progresso: (s, d) => calcularOfensiva(s, d), recompensa: { congelador: 1 } },
  { id: 'c_volta_completa', npc: 'zuleide', tipo: 'capitulo', titulo: 'Volta completa', descricao: 'Feche uma volta inteira do ciclo de estudos.', meta: 1,
    progresso: (s) => (s.ciclo.rodada >= 2 ? 1 : 0), recompensa: { item: 'espantalho', moedas: 40 } },
  { id: 'c_mao_na_massa', npc: 'zuleide', tipo: 'capitulo', titulo: 'Calo na mão', descricao: 'Some 200 questões resolvidas.', meta: 200,
    progresso: (s) => questoes(s.sessoes), recompensa: { moedas: 80 } },
  { id: 'c_madrugou', npc: 'tiao', tipo: 'capitulo', titulo: 'Quem madruga', descricao: 'Comece 3 sessões de cronômetro antes das 8h.', meta: 3,
    progresso: (s) => s.sessoes.filter((x) => x.origem === 'cronometro' && new Date(x.inicio).getHours() < 8).length, recompensa: { moedas: 60 } },
  { id: 'c_semana_cheia', npc: 'tiao', tipo: 'capitulo', titulo: 'Semana cheia', descricao: 'Bata a meta semanal em 2 semanas.', meta: 2,
    progresso: (s) => s.registro.metasSemanaisPagas.length, recompensa: { item: 'carro_de_boi', moedas: 100 } },
  { id: 'c_pontaria', npc: 'zuleide', tipo: 'capitulo', titulo: 'Pontaria', descricao: 'Acerte 80% ou mais em 50+ questões nos últimos 30 dias.', meta: 1,
    progresso: (s, d) => {
      const xs = s.sessoes.filter((x) => diffDias(x.inicio, d) <= 30 && x.questoes);
      const q = xs.reduce((a, x) => a + (x.questoes ?? 0), 0), ac = xs.reduce((a, x) => a + (x.acertos ?? 0), 0);
      return q >= 50 && ac / q >= 0.8 ? 1 : 0;
    }, recompensa: { item: 'placa_aprovado' } },
  { id: 'c_mata_atlantica', npc: 'benedita', tipo: 'capitulo', titulo: 'Fim do capítulo: Mata Atlântica', descricao: 'Chegue ao nível 15 com 20 h de estudo no total.', meta: 1,
    progresso: (s) => (nivelDeXp(s.jogador.xp).nivel >= 15 && s.sessoes.reduce((a, x) => a + x.duracaoMin, 0) >= 1200 ? 1 : 0),
    recompensa: { item: 'jabuticabeira', moedas: 150 } },
];

/** Missões extras que a parte de estudos registra (revisões, caderno de erros...). */
const extrasCapitulo: DefMissao[] = [];
export function registrarMissaoCapitulo(d: DefMissao) { if (!extrasCapitulo.some((x) => x.id === d.id)) extrasCapitulo.push(d); }

const indiceDia = (d: Date) => Math.floor(deChaveDia(chaveDia(d)).getTime() / 86_400_000);

function montar(def: DefMissao, chave: string, s: AppState, agora: Date): Missao {
  const { progresso, ...resto } = def;
  const atual = Math.min(def.meta, Math.floor(progresso(s, agora)));
  return { ...resto, chave, atual, concluida: atual >= def.meta, resgatada: (s.registro.missoesResgatadas ?? []).includes(chave) };
}

/** As 3 missões ativas: 1 diária, 1 semanal e a próxima do capítulo. */
export function missoesAtivas(s: AppState, agora = new Date()): Missao[] {
  const out: Missao[] = [];
  const dia = chaveDia(agora), sem = chaveSemana(agora);
  const d = DIARIAS[indiceDia(agora) % DIARIAS.length];
  out.push(montar(d, `d:${dia}:${d.id}`, s, agora));
  const nSem = Math.floor(indiceDia(deChaveDia(sem)) / 7);
  const w = SEMANAIS[nSem % SEMANAIS.length];
  out.push(montar(w, `s:${sem}:${w.id}`, s, agora));
  const resg = new Set(s.registro.missoesResgatadas ?? []);
  const cap = [...CAPITULO, ...extrasCapitulo].find((c) => !resg.has(`c:${c.id}`));
  if (cap) out.push(montar(cap, `c:${cap.id}`, s, agora));
  return out;
}

export function resgatarMissao(s: AppState, chave: string, agora = new Date()): { ok: true; state: AppState; texto: string } | { ok: false; erro: string } {
  const m = missoesAtivas(s, agora).find((x) => x.chave === chave);
  if (!m) return { ok: false, erro: 'Missão não encontrada.' };
  if (!m.concluida) return { ok: false, erro: 'Ainda não concluída.' };
  if (m.resgatada) return { ok: false, erro: 'Já resgatada.' };
  const r = m.recompensa;
  const partes: string[] = [];
  let st: AppState = { ...s, registro: { ...s.registro, missoesResgatadas: [...(s.registro.missoesResgatadas ?? []), chave] } };
  if (r.moedas) {
    st = {
      ...st,
      jogador: { ...st.jogador, moedas: st.jogador.moedas + r.moedas },
      transacoes: [...st.transacoes, { id: novoId(), em: agora.toISOString(), delta: r.moedas, motivo: `Missão: ${m.titulo}` }],
    };
    partes.push(`+${r.moedas} moedas`);
  }
  if (r.congelador) {
    const max = ECONOMIA.ofensiva.congeladorEstoqueMax;
    st = { ...st, jogador: { ...st.jogador, congeladores: Math.min(max, st.jogador.congeladores + r.congelador) } };
    partes.push(`+${r.congelador} congelador`);
  }
  if (r.item) {
    const inv = { ...(st.registro.inventario ?? {}) };
    inv[r.item] = (inv[r.item] ?? 0) + 1;
    st = { ...st, registro: { ...st.registro, inventario: inv } };
    partes.push(construcao(r.item)?.nome ?? r.item);
  }
  return { ok: true, state: st, texto: partes.join(' · ') };
}

// ---------- cartas (narrativa curta, sempre apontando para o estudo) ----------

export interface Carta { id: string; npc: Npc; titulo: string; texto: string }
export interface DefCarta extends Carta { quando: (s: AppState, agora: Date) => boolean }

const horas = (s: AppState) => s.sessoes.reduce((a, x) => a + x.duracaoMin, 0) / 60;
const nivel = (s: AppState) => nivelDeXp(s.jogador.xp).nivel;

const CARTAS: DefCarta[] = [
  { id: 'boas_vindas', npc: 'benedita', titulo: 'O sítio agora é seu',
    texto: 'Meu bem, deixei este pedaço de terra roxa pra você. Terra boa é igual estudo: dá fruto pra quem volta todo dia. Comece pelo ciclo e deixe a roça crescer junto.', quando: () => true },
  { id: 'zuleide_oi', npc: 'zuleide', titulo: 'Bilhete da professora',
    texto: 'Passei 6 anos estudando pro TRT. O que me aprovou? Questão todo dia e revisão sem dó. Registre suas questões no fim da sessão, que eu acompanho.', quando: (s) => s.sessoes.length >= 1 },
  { id: 'horas_10', npc: 'tiao', titulo: '10 horas de lida', texto: 'Dez horas de estrada, sô! Tropa que não para chega longe. Amanhã, de novo.', quando: (s) => horas(s) >= 10 },
  { id: 'nivel_5', npc: 'benedita', titulo: 'O roçado pegou', texto: 'Nível 5! Já dá pra ver a diferença na terra. Que tal aumentar um pouquinho o ciclo da matéria mais difícil?', quando: (s) => nivel(s) >= 5 },
  { id: 'ofensiva_7', npc: 'tiao', titulo: 'Uma semana inteira', texto: 'Sete dias sem falhar. Ganhou um congelador de presente pra um dia ruim. Guarda ele, viu?', quando: (s, d) => calcularOfensiva(s, d) >= 7 },
  { id: 'nivel_10', npc: 'benedita', titulo: 'Tempo de café', texto: 'Nível 10: o café já pode ir pra terra. Café demora, igual matéria pesada. Paciência e constância.', quando: (s) => nivel(s) >= 10 },
  { id: 'horas_50', npc: 'zuleide', titulo: '50 horas', texto: 'Cinquenta horas líquidas. Agora é hora de olhar onde você mais erra e voltar lá. Prova se ganha nos pontos fracos.', quando: (s) => horas(s) >= 50 },
  { id: 'cerrado', npc: 'benedita', titulo: 'Capítulo 2: Cerrado', texto: 'Você chegou ao Cerrado. Aqui a chuva some meses e o ipê floresce mesmo assim. Constância é isso: florir na seca.', quando: (s) => nivel(s) >= 15 },
  { id: 'horas_100', npc: 'ze', titulo: 'Correspondência especial', texto: 'Cem horas! O pessoal da vila tá comentando. Diz a Vó que gente assim não volta da prova de mão vazia.', quando: (s) => horas(s) >= 100 },
  { id: 'ofensiva_30', npc: 'tiao', titulo: 'Um mês de estrada', texto: 'Trinta dias seguidos. Isso já não é força de vontade, é hábito. Agora só cuidar pra não quebrar.', quando: (s, d) => calcularOfensiva(s, d) >= 30 },
  { id: 'pantanal', npc: 'benedita', titulo: 'Capítulo 3: Pantanal', texto: 'No Pantanal a água sobe e desce no tempo dela. Revisão é assim também: volta no tempo certo e o conteúdo fica.', quando: (s) => nivel(s) >= 25 },
  { id: 'horas_200', npc: 'zuleide', titulo: '200 horas', texto: 'Duzentas horas. Faça um simulado completo nas mesmas condições da prova. Treino de jogo é diferente de treino de academia.', quando: (s) => horas(s) >= 200 },
  { id: 'caatinga', npc: 'benedita', titulo: 'Capítulo 4: Caatinga', texto: 'A Caatinga ensina a guardar água pro tempo seco. Guarde também suas revisões: elas salvam na reta final.', quando: (s) => nivel(s) >= 35 },
  { id: 'amazonia', npc: 'benedita', titulo: 'Capítulo 5: Amazônia', texto: 'Chegou na Amazônia, meu bem. A floresta mais rica nasce de muita chuva miúda, todo dia. Falta pouco.', quando: (s) => nivel(s) >= 45 },
];

export function registrarCarta(c: DefCarta) { if (!CARTAS.some((x) => x.id === c.id)) CARTAS.push(c); }

export function cartasDisponiveis(s: AppState, agora = new Date()): (Carta & { lida: boolean })[] {
  const lidas = new Set(s.registro.cartasLidas ?? []);
  return CARTAS.filter((c) => c.quando(s, agora)).map(({ quando: _q, ...c }) => ({ ...c, lida: lidas.has(c.id) })).reverse();
}

export function marcarCartasLidas(s: AppState, ids: string[]): AppState {
  const atuais = new Set(s.registro.cartasLidas ?? []);
  if (ids.every((i) => atuais.has(i))) return s;
  ids.forEach((i) => atuais.add(i));
  return { ...s, registro: { ...s.registro, cartasLidas: [...atuais] } };
}

/** Número do selo da caixa de correio: cartas não lidas + missões prontas para resgatar. */
export function pendenciasCorreio(s: AppState, agora = new Date()): number {
  const cartas = cartasDisponiveis(s, agora).filter((c) => !c.lida).length;
  const missoes = missoesAtivas(s, agora).filter((m) => m.concluida && !m.resgatada).length;
  return cartas + missoes;
}
