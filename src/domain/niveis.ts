import { ECONOMIA, type Economia } from './economia';

/** XP necessário para passar do nível n para n+1. */
export function xpParaProximo(n: number, eco: Economia = ECONOMIA): number {
  return eco.niveis.base + eco.niveis.incremento * (n - 1);
}

/** XP acumulado necessário para estar no nível L. */
export function xpTotalParaNivel(L: number, eco: Economia = ECONOMIA): number {
  const { base, incremento } = eco.niveis;
  const k = L - 1;
  return base * k + (incremento * k * (k - 1)) / 2;
}

export interface InfoNivel {
  nivel: number;
  xpNoNivel: number;
  xpDoNivel: number;
  progresso: number;
}

export function nivelDeXp(xp: number, eco: Economia = ECONOMIA): InfoNivel {
  let nivel = 1;
  while (nivel < eco.niveis.nivelMaximo && xp >= xpTotalParaNivel(nivel + 1, eco)) nivel++;
  const xpNoNivel = xp - xpTotalParaNivel(nivel, eco);
  const xpDoNivel = xpParaProximo(nivel, eco);
  return { nivel, xpNoNivel, xpDoNivel, progresso: Math.min(1, xpNoNivel / xpDoNivel) };
}

/** Moedas de bônus por subir de `de` para `para` (soma de moedasPorNivel × novo nível). */
export function bonusSubidaNivel(de: number, para: number, eco: Economia = ECONOMIA): number {
  let total = 0;
  for (let n = de + 1; n <= para; n++) total += eco.niveis.moedasPorNivel * n;
  return total;
}
