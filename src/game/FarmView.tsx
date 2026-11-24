import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { FarmScene, type AssetsRuntime, type CallbacksCena, type Colocacao } from './FarmScene';
import type { AppState } from '../domain/tipos';

interface Props {
  estado: AppState;
  colocacao: Colocacao | null;
  aoTocarCelula: CallbacksCena['aoTocarCelula'];
}

let assetsCache: Promise<AssetsRuntime> | null = null;
function carregarAssets(): Promise<AssetsRuntime> {
  assetsCache ??= fetch('assets/assets.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => j ?? { atlas: null, frames: {}, faltando: [] })
    .catch(() => ({ atlas: null, frames: {}, faltando: [] }));
  return assetsCache;
}

export function FarmView({ estado, colocacao, aoTocarCelula }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const cena = useRef<FarmScene | null>(null);
  const ultimoEstado = useRef(estado);
  ultimoEstado.current = estado;
  const cbRef = useRef(aoTocarCelula);
  cbRef.current = aoTocarCelula;

  useEffect(() => {
    let jogo: Phaser.Game | null = null;
    let obs: ResizeObserver | null = null;
    let cancelado = false;
    carregarAssets().then((assets) => {
      if (cancelado || !host.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const el = host.current;
      const scene = new FarmScene();
      scene.cb = { aoTocarCelula: (x, y, it) => cbRef.current(x, y, it) };
      cena.current = scene;
      jogo = new Phaser.Game({
        type: Phaser.AUTO,
        parent: el,
        backgroundColor: '#8FC9E8',
        transparent: false,
        scale: { mode: Phaser.Scale.NONE, width: el.clientWidth * dpr, height: el.clientHeight * dpr, zoom: 1 / dpr },
        render: { antialias: true, mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
        input: { activePointers: 3 },
        banner: false,
      });
      scene.atualizarEstado(ultimoEstado.current); // guardado até o create() desenhar
      jogo.scene.add('FarmScene', scene, true, { assets });
      obs = new ResizeObserver(() => {
        if (!jogo || !el.clientWidth) return;
        jogo.scale.resize(el.clientWidth * dpr, el.clientHeight * dpr);
        jogo.scale.setZoom(1 / dpr);
      });
      obs.observe(el);
    });
    return () => { cancelado = true; obs?.disconnect(); jogo?.destroy(true); cena.current = null; };
  }, []);

  useEffect(() => { cena.current?.atualizarEstado(estado); }, [estado]);
  useEffect(() => { cena.current?.definirColocacao(colocacao); }, [colocacao]);

  return <div ref={host} className="farm-canvas" />;
}
