// Tipos centrais do app. Tudo serializável em JSON (é o mesmo formato do backup).

export type Origem = 'cronometro' | 'manual';
export type ModoTimer = 'livre' | 'pomodoro';
export type StatusAssunto = 'nao_visto' | 'teoria' | 'questoes' | 'revisado';

export interface Materia {
  id: string;
  nome: string;
  cor: string;
  /** Minutos desta matéria em cada volta do ciclo de estudos. */
  metaCicloMin: number;
  ativa: boolean;
  ordem: number;
  /** Nº de questões desta matéria na prova (para o ciclo automático). */
  questoesProva?: number;
  /** Peso de cada questão na prova (padrão 1). */
  pesoProva?: number;
  /** 1 = fácil, 2 = média, 3 = difícil para você. */
  dificuldade?: 1 | 2 | 3;
}

export interface Assunto {
  id: string;
  materiaId: string;
  nome: string;
  status: StatusAssunto;
  /** Incidência na prova: 1 baixa, 2 média, 3 alta (padrão 2). */
  peso?: number;
  estudadoEm?: string;
  revisoesFeitas?: number;
}

export type Banca = string;
export type FormatoQuestao = 'certo_errado' | 'multipla';

export interface Concurso {
  id: string;
  nome: string;
  banca?: Banca;
  /** 'YYYY-MM-DD' */
  dataProva?: string;
  ativo: boolean;
}

export interface Revisao {
  id: string;
  assuntoId: string;
  materiaId: string;
  /** 0 = primeira revisão (D+1), 1 = D+7, ... */
  etapa: number;
  intervaloDias: number;
  /** 'YYYY-MM-DD' */
  devidaEm: string;
  feitaEm?: string;
  questoes?: number;
  acertos?: number;
  moedas?: number;
}

export interface BlocoQuestoes {
  id: string;
  sessaoId?: string;
  simuladoId?: string;
  em: string;
  materiaId: string;
  assuntoId?: string;
  banca?: Banca;
  formato?: FormatoQuestao;
  feitas: number;
  acertos: number;
  brancos?: number;
}

export type MotivoErro = 'conteudo' | 'interpretacao' | 'atencao' | 'pegadinha' | 'chute';

export interface ItemErro {
  id: string;
  materiaId: string;
  assuntoId?: string;
  banca?: Banca;
  enunciado: string;
  explicacao?: string;
  motivo: MotivoErro;
  criadoEm: string;
  caixa: number;
  /** 'YYYY-MM-DD' */
  proximaEm: string;
  resolvidoEm?: string;
  revisoes?: number;
}

export interface Simulado {
  id: string;
  em: string;
  nome: string;
  concursoId?: string;
  duracaoMin: number;
  porMateria: { materiaId: string; feitas: number; acertos: number; brancos?: number }[];
  notaCorte?: number;
}

export interface Sessao {
  id: string;
  materiaId: string;
  assuntoId?: string;
  /** ISO do início (hora local do aparelho no momento). */
  inicio: string;
  /** Minutos líquidos (sem pausas). */
  duracaoMin: number;
  origem: Origem;
  /** ISO de quando o registro foi criado (usado na regra de recuperação de ofensiva). */
  criadaEm: string;
  modo?: ModoTimer;
  pomodoros?: number;
  questoes?: number;
  acertos?: number;
  xp: number;
  moedas: number;
  penalizada?: boolean;
  /** Qualidade da sessão (cronômetro): tempo bruto, nº de pausas e de saídas do app. */
  brutoMin?: number;
  pausasQtd?: number;
  saidas?: number;
  banca?: Banca;
}

export interface Pausa {
  inicio: string;
  fim?: string;
}

export interface SessaoAtiva {
  inicio: string;
  pausas: Pausa[];
  modo: ModoTimer;
  materiaId: string;
  assuntoId?: string;
  saidaAutorizada: boolean;
  penalidades: number;
  /** Se o modo rigoroso encerrou a sessão, guarda o fim efetivo. */
  encerradaEm?: string;
}

export interface Transacao {
  id: string;
  em: string;
  delta: number;
  motivo: string;
}

export interface CulturaPlantada {
  id: string;
  minutos: number;
  murcha: boolean;
  plantadaEm: string;
}

export type TipoItem = 'canteiro' | 'construcao' | 'animal';

export interface ItemFazenda {
  id: string;
  tipo: TipoItem;
  /** id no catálogo (economia.json). Para canteiro: "canteiro". */
  ref: string;
  x: number;
  y: number;
  cultura?: CulturaPlantada;
  nivel?: number;
  /** Rotação (opcional; ausente = 0). Itens salvos antes desta versão continuam válidos. */
  rot?: number;
}

export interface Fazenda {
  lote: number;
  itens: ItemFazenda[];
}

export interface Jogador {
  xp: number;
  moedas: number;
  congeladores: number;
}

export interface Ajustes {
  metaDiariaMin: number;
  metaSemanalMin: number;
  pomodoroMin: number;
  pausaMin: number;
  toleranciaSaidaSeg: number;
  avisarSaida: boolean;
  /** false = só murcha a plantação; true = também encerra a sessão. */
  encerrarAoSair: boolean;
  /** Pausa maior que isso encerra a sessão automaticamente (no horário da pausa). */
  pausaMaxMin: number;
  usarAtalhoFoco: boolean;
  atalhoOn: string;
  atalhoOff: string;
  appsRedirecionar: string[];
  appsSaidaAutorizada: string[];
  simularSaidaNoNavegador: boolean;
  /** Sons da fazenda (desligado por padrão). Nunca tocam durante a sessão, exceto o fim do Pomodoro. */
  sons?: boolean;
  /** Durante a sessão: só o relógio, sem ver a fazenda. */
  sessaoTelaMinima?: boolean;
  /** Meta de acerto usada para pontos fracos (padrão 0,8). */
  alvoAcerto?: number;
}

export interface Registro {
  ultimoBackupExternoEm?: string;
  ultimoBackupAutoEm?: string;
  metasDiariasPagas: string[];
  metasSemanaisPagas: string[];
  diasCongelados: string[];
  marcosCongeladorGratis: string[];
  tentativas: { em: string; app: string }[];
  /** Chaves de missões já resgatadas (ex.: "d:2026-11-25:d_60min", "c:c_primeiro_rocado"). */
  missoesResgatadas?: string[];
  cartasLidas?: string[];
  /** Itens exclusivos ganhos em missões, ainda não colocados na fazenda. */
  inventario?: Record<string, number>;
  /** assuntoId → data do último bônus "ponto fraco melhorou". */
  bonusPontoFraco?: Record<string, string>;
  /** dia → moedas pagas por erros revisados/questões (limites diários). */
  errosPagosDia?: Record<string, number>;
}

export interface Ciclo {
  rodada: number;
  progresso: Record<string, number>;
  /** Minutos totais de uma volta (para o ciclo automático). */
  minutosPorVolta?: number;
  inicioRodadaEm?: string;
}

export interface AppState {
  schemaVersion: number;
  criadoEm: string;
  jogador: Jogador;
  materias: Materia[];
  assuntos: Assunto[];
  ciclo: Ciclo;
  sessoes: Sessao[];
  transacoes: Transacao[];
  fazenda: Fazenda;
  ajustes: Ajustes;
  registro: Registro;
  sessaoAtiva?: SessaoAtiva;
  concursos?: Concurso[];
  revisoes?: Revisao[];
  blocos?: BlocoQuestoes[];
  erros?: ItemErro[];
  simulados?: Simulado[];
}

export interface LinhaRecompensa {
  motivo: string;
  moedas: number;
}

export interface ResumoSessao {
  sessao: Sessao;
  xp: number;
  moedas: number;
  linhas: LinhaRecompensa[];
  nivelAntes: number;
  nivelDepois: number;
  culturasProntas: number;
}
