// Controle da sessão de estudo (cronômetro) — junta domínio + plataforma.
import { atualizar, obter, salvarAgora } from './store';
import { estaPausada, fimPorPausaLonga, pausar, pomodorosCompletos, retomar, segundosAteProximoPomodoro, segundosLiquidos } from './domain/timer';
import { aplicarPenalidadeSaida, registrarSessao } from './domain/estado';
import type { ModoTimer, ResumoSessao, SessaoAtiva } from './domain/tipos';
import {
  FocoGuard, agendarNotificacao, cancelarNotificacoes, ehNativo, marcarSessaoAtiva,
  pedirPermissaoNotificacoes, rodarAtalho, vibrar,
} from './platform/nativo';

type Aviso = (texto: string) => void;
let avisar: Aviso = () => {};
export function definirAvisador(fn: Aviso) { avisar = fn; }

export async function iniciarSessao(o: { materiaId: string; assuntoId?: string; modo: ModoTimer; saidaAutorizada: boolean }) {
  const s = obter();
  if (s.sessaoAtiva) return;
  const ativa: SessaoAtiva = {
    inicio: new Date().toISOString(), pausas: [], modo: o.modo, materiaId: o.materiaId,
    assuntoId: o.assuntoId, saidaAutorizada: o.saidaAutorizada, penalidades: 0,
  };
  atualizar((st) => ({ ...st, sessaoAtiva: ativa }));
  await salvarAgora();
  await marcarSessaoAtiva(true);
  await pedirPermissaoNotificacoes();
  await reagendar();
  await FocoGuard.arm({ graceSeconds: s.ajustes.toleranciaSaidaSeg, warn: s.ajustes.avisarSaida && !o.saidaAutorizada });
  vibrar();
  if (s.ajustes.usarAtalhoFoco) await rodarAtalho(s.ajustes.atalhoOn);
}

export async function alternarPausa() {
  const a = obter().sessaoAtiva;
  if (!a) return;
  const nova = estaPausada(a) ? retomar(a) : pausar(a);
  atualizar((s) => ({ ...s, sessaoAtiva: nova }));
  await reagendar();
}

async function reagendar() {
  const s = obter();
  const a = s.sessaoAtiva;
  await cancelarNotificacoes();
  if (!a) return;
  if (estaPausada(a)) {
    const em = new Date(Date.now() + s.ajustes.pausaMin * 60_000);
    await agendarNotificacao('pausa', em, 'Fim da pausa ☕', 'Bora voltar? A fazenda está esperando.');
    return;
  }
  if (a.modo === 'pomodoro') {
    const seg = segundosAteProximoPomodoro(segundosLiquidos(a), s.ajustes);
    await agendarNotificacao('pomodoro', new Date(Date.now() + seg * 1000), 'Pomodoro concluído! 🍅', 'Hora de uma pausa curta. Seu milho agradece.');
  }
}

/** Encerra o cronômetro e devolve os dados para a tela de resumo (ainda não registra). */
export function dadosParaConcluir() {
  const s = obter();
  const a = s.sessaoAtiva;
  if (!a) return null;
  const seg = segundosLiquidos(a);
  return {
    materiaId: a.materiaId,
    assuntoId: a.assuntoId,
    inicio: new Date(a.inicio),
    minutos: Math.floor(seg / 60),
    pomodoros: a.modo === 'pomodoro' ? pomodorosCompletos(seg, s.ajustes) : 0,
    modo: a.modo,
    penalizada: a.penalidades > 0,
  };
}

async function finalizarPlataforma() {
  await cancelarNotificacoes();
  await marcarSessaoAtiva(false);
  try { await FocoGuard.disarm(); } catch { /* web */ }
  const s = obter();
  if (s.ajustes.usarAtalhoFoco) await rodarAtalho(s.ajustes.atalhoOff, 'fazenda://');
}

export async function confirmarConclusao(extra: { assuntoId?: string; questoes?: number; acertos?: number }): Promise<ResumoSessao | null> {
  const d = dadosParaConcluir();
  if (!d) return null;
  let resumo: ResumoSessao | null = null;
  atualizar((s) => {
    const r = registrarSessao({ ...s, sessaoAtiva: undefined }, {
      materiaId: d.materiaId, assuntoId: extra.assuntoId ?? d.assuntoId, inicio: d.inicio, duracaoMin: d.minutos,
      origem: 'cronometro', modo: d.modo, pomodoros: d.pomodoros, questoes: extra.questoes, acertos: extra.acertos,
      penalizada: d.penalizada,
    });
    resumo = r.resumo;
    return r.state;
  });
  await salvarAgora();
  await finalizarPlataforma();
  return resumo;
}

export async function cancelarSessao() {
  atualizar((s) => ({ ...s, sessaoAtiva: undefined }));
  await salvarAgora();
  await finalizarPlataforma();
}

/** Chamado a cada segundo pela UI: encerra pausas longas demais. */
export function verificarPausaLonga(): boolean {
  const s = obter();
  if (!s.sessaoAtiva) return false;
  const fim = fimPorPausaLonga(s.sessaoAtiva, s.ajustes);
  if (!fim) return false;
  atualizar((st) => ({ ...st, sessaoAtiva: st.sessaoAtiva && { ...st.sessaoAtiva, encerradaEm: fim.toISOString() } }));
  return true;
}

/** Processa uma ausência (saída do app) já medida. */
export function processarAusencia(awaySeconds: number, locked: boolean) {
  const s = obter();
  const a = s.sessaoAtiva;
  if (!a || estaPausada(a) || a.saidaAutorizada || a.encerradaEm) return;
  if (locked || awaySeconds <= s.ajustes.toleranciaSaidaSeg) return;
  if (!ehNativo && !s.ajustes.simularSaidaNoNavegador) return;

  const saiuEm = new Date(Date.now() - awaySeconds * 1000);
  atualizar((st) => {
    const r = aplicarPenalidadeSaida(st);
    let at = r.state.sessaoAtiva!;
    // o tempo fora não conta: vira uma pausa retroativa
    at = { ...at, pausas: [...at.pausas, { inicio: saiuEm.toISOString(), fim: new Date().toISOString() }] };
    if (st.ajustes.encerrarAoSair) at = { ...at, encerradaEm: saiuEm.toISOString() };
    avisar(
      st.ajustes.encerrarAoSair
        ? `Você saiu do app por ${Math.round(awaySeconds)} s. Sessão encerrada (modo rigoroso) e ${r.murchas} plantação(ões) murcharam. 🥀`
        : `Você saiu do app por ${Math.round(awaySeconds)} s. ${r.murchas} plantação(ões) murcharam e o tempo fora não contou. 🥀`,
    );
    return { ...r.state, sessaoAtiva: at };
  });
}

export async function checarRelatorioNativo() {
  if (!ehNativo) return;
  try {
    const r = await FocoGuard.report();
    if (r.hasAbsence) processarAusencia(r.awaySeconds, r.locked);
  } catch { /* plugin indisponível */ }
}

/**
 * iPhone: o relatório é PUXADO (report) quando o app volta ao primeiro plano — mais confiável
 * que eventos disparados enquanto o WebView ainda está acordando.
 * Navegador: usa o evento simulado por visibilitychange.
 */
export function ouvirAusencias() {
  if (!ehNativo) FocoGuard.addListener('returned', (d) => processarAusencia(d.awaySeconds, d.locked));
}
