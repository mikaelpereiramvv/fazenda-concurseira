import { useEffect, useState } from 'react';
import type { AssetsRuntime } from './FarmScene';

let assetsCache: Promise<AssetsRuntime> | null = null;
export function carregarAssets(): Promise<AssetsRuntime> {
  assetsCache ??= fetch('assets/assets.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => j ?? { atlas: null, frames: {}, faltando: [] })
    .catch(() => ({ atlas: null, frames: {}, faltando: [] }));
  return assetsCache;
}

/** Sprites que têm imagem de verdade. null = ainda carregando ou sem atlas (aí não filtra nada). */
export function useSprites(): Set<string> | null {
  const [s, setS] = useState<Set<string> | null>(null);
  useEffect(() => {
    let vivo = true;
    carregarAssets().then((a) => { if (vivo && a.atlas) setS(new Set(Object.keys(a.frames))); });
    return () => { vivo = false; };
  }, []);
  return s;
}

const ESTAGIOS = ['stage1', 'stage2', 'stage3', 'stage4'];
const CHAVE_CONSTRUCAO: Record<string, string> = { cerca: 'bld_cerca_a', casa: 'bld_casa_lv1' };

/** Só aparece na loja o que já tem imagem: nada de caixote no lugar do item. */
export const temConstrucao = (sp: Set<string> | null, id: string) => !sp || sp.has(CHAVE_CONSTRUCAO[id] ?? `bld_${id}`);
export const temAnimal = (sp: Set<string> | null, id: string) => !sp || sp.has(`animal_${id}_idle_01`);
export const temCultura = (sp: Set<string> | null, id: string) => !sp || ESTAGIOS.every((e) => sp.has(`crop_${id}_${e}`));
