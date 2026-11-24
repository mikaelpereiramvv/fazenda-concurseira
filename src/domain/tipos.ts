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
}

export interface Assunto {
  id: string;
  materiaId: string;
  nome: string;
  status: StatusAssunto;
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
}

export interface Registro {
  ultimoBackupExternoEm?: string;
  ultimoBackupAutoEm?: string;
  metasDiariasPagas: string[];
  metasSemanaisPagas: string[];
  diasCongelados: string[];
  marcosCongeladorGratis: string[];
  tentativas: { em: string; app: string }[];
}

export interface Ciclo {
  rodada: number;
  progresso: Record<string, number>;
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
