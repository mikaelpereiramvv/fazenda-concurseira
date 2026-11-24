import bruto from '../config/economia.json';

export interface Cultura { id: string; nome: string; nivel: number; semente: number; minutos: number; venda: number }
export interface Animal {
  id: string; nome: string; nivel: number; preco: number; requer?: string;
  capacidadePorAbrigo?: number; bonusMetaDiaria?: number; max?: number; descricao: string;
}
export interface Construcao {
  id: string; nome: string; nivel: number; preco: number; tamanho: [number, number];
  unica?: boolean; inicial?: boolean; upgrades?: number[]; categoria?: 'decoracao';
  chao?: boolean; bonusVenda?: Record<string, number>; descricao: string;
}
export interface Lote { lote: number; tamanho: number; preco: number; nivel?: number }

export interface Economia {
  versao: number;
  niveis: { base: number; incremento: number; moedasPorNivel: number; nivelMaximo: number };
  moedas: {
    porMinutoCronometro: number; porMinutoManual: number; sessaoMinimaParaMoedasMin: number;
    bonusPomodoroCompleto: number; bonusSessao60Min: number; metaDiaria: number; metaSemanal: number;
    porAcerto: number; maxAcertosPagosPorDia: number;
  };
  ofensiva: {
    minutosMinimosNoDia: number; recuperacaoManualMaxDias: number;
    multiplicadores: { dias: number; bonus: number }[];
    congeladorPreco: number; congeladorEstoqueMax: number; congeladorGratisACadaDias: number;
  };
  lancamentoManual: { duracaoMinMin: number; duracaoMaxMin: number; maxMinutosManuaisPorDia: number };
  plantacao: { crescimentoManualFator: number };
  terreno: { canteirosIniciais: number; precoCanteiroPorExistente: number; lotes: Lote[] };
  biomas: { id: string; nome: string; nivel: number }[];
  culturas: Cultura[];
  animais: Animal[];
  construcoes: Construcao[];
}

export const ECONOMIA = bruto as unknown as Economia;

export const cultura = (id: string) => ECONOMIA.culturas.find((c) => c.id === id);
export const animal = (id: string) => ECONOMIA.animais.find((a) => a.id === id);
export const construcao = (id: string) => ECONOMIA.construcoes.find((c) => c.id === id);
export const lote = (n: number) => ECONOMIA.terreno.lotes.find((l) => l.lote === n);
