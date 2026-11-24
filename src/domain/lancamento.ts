import { ECONOMIA } from './economia';
import { chaveDia, inicioDoDia } from './datas';
import type { Sessao } from './tipos';

export interface Lancamento {
  materiaId: string;
  assuntoId?: string;
  inicio: Date;
  duracaoMin: number;
}

export type ErroLancamento =
  | 'MATERIA_OBRIGATORIA'
  | 'DATA_FUTURA'
  | 'TERMINA_NO_FUTURO'
  | 'DURACAO_INVALIDA'
  | 'LIMITE_MANUAL_DIA'
  | 'DIA_ESTOURADO';

export const MENSAGENS_ERRO: Record<ErroLancamento, string> = {
  MATERIA_OBRIGATORIA: 'Escolha uma matéria.',
  DATA_FUTURA: 'Não é possível lançar estudo em data futura.',
  TERMINA_NO_FUTURO: 'Esse estudo terminaria depois de agora. Ajuste o horário de início ou a duração.',
  DURACAO_INVALIDA: `A duração deve ficar entre ${ECONOMIA.lancamentoManual.duracaoMinMin} min e ${ECONOMIA.lancamentoManual.duracaoMaxMin / 60} h.`,
  LIMITE_MANUAL_DIA: `O limite de lançamentos manuais é ${ECONOMIA.lancamentoManual.maxMinutosManuaisPorDia / 60} h por dia.`,
  DIA_ESTOURADO: 'A soma de estudos desse dia passaria de 24 h.',
};

export interface ResultadoValidacao {
  erros: ErroLancamento[];
  avisos: string[];
}

/**
 * Valida um lançamento manual. Roda no formulário, ao salvar e ao importar backup.
 * Regra principal: só hoje ou datas passadas, e o fim não pode passar de "agora".
 */
export function validarLancamento(
  l: Lancamento,
  sessoes: Sessao[],
  agora: Date = new Date(),
  ignorarId?: string,
): ResultadoValidacao {
  const erros: ErroLancamento[] = [];
  const avisos: string[] = [];
  const cfg = ECONOMIA.lancamentoManual;

  if (!l.materiaId) erros.push('MATERIA_OBRIGATORIA');
  if (Number.isNaN(l.inicio.getTime())) {
    erros.push('DATA_FUTURA');
    return { erros, avisos };
  }
  if (inicioDoDia(l.inicio) > inicioDoDia(agora)) erros.push('DATA_FUTURA');

  const fim = new Date(l.inicio.getTime() + l.duracaoMin * 60_000);
  if (!erros.includes('DATA_FUTURA') && fim > agora) erros.push('TERMINA_NO_FUTURO');

  if (!Number.isFinite(l.duracaoMin) || l.duracaoMin < cfg.duracaoMinMin || l.duracaoMin > cfg.duracaoMaxMin) {
    erros.push('DURACAO_INVALIDA');
  }

  const dia = chaveDia(l.inicio);
  const doDia = sessoes.filter((s) => s.id !== ignorarId && chaveDia(s.inicio) === dia);
  const manuais = doDia.filter((s) => s.origem === 'manual').reduce((a, s) => a + s.duracaoMin, 0);
  const total = doDia.reduce((a, s) => a + s.duracaoMin, 0);
  if (manuais + l.duracaoMin > cfg.maxMinutosManuaisPorDia) erros.push('LIMITE_MANUAL_DIA');
  if (total + l.duracaoMin > 24 * 60) erros.push('DIA_ESTOURADO');

  const ini = l.inicio.getTime();
  const sobrepoe = doDia.some((s) => {
    const a = new Date(s.inicio).getTime();
    const b = a + s.duracaoMin * 60_000;
    return ini < b && fim.getTime() > a;
  });
  if (sobrepoe) avisos.push('Esse horário se sobrepõe a outra sessão registrada.');

  return { erros, avisos };
}
