import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Phaser from 'phaser';
import { FarmScene, type AssetsRuntime, type CallbacksCena, type Colocacao } from './FarmScene';
import type { AppState } from '../domain/tipos';

interface Props {
  estado: AppState;
  colocacao: Colocacao | null;
  aoTocarCelula: CallbacksCena['aoTocarCelula'];
  /** px CSS ocupados por cima (HUD) e por baixo (painel). */
  margens: { topo: number; baixo: number };
  modoSessao: boolean;
  ervas: number;
}

export interface FarmViewApi {
  efeitoColheita: (x: number, y: number, texto: string) => void;
}

let assetsCache: Promise<AssetsRuntime> | null = null;
function carregarAssets(): Promise<AssetsRuntime> {
  assetsCache ??= fetch('assets/assets.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => j ?? { atlas: null, frames: {}, faltando: [] })
    .catch(() => ({ atlas: null, frames: {}, faltando: [] }));
  return assetsCache;
}

export type Periodo = 'amanhecer' | 'dia' | 'entardecer' | 'noite';
export function periodoDoDia(d = new Date()): Periodo {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 7.5) return 'amanhecer';
  if (h >= 7.5 && h < 17) return 'dia';
  if (h >= 17 && h < 19) return 'entardecer';
  return 'noite';
}

export const FarmView = forwardRef<FarmViewApi, Props>(function FarmView({ estado, colocacao, aoTocarCelula, margens, modoSessao, ervas }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const cena = useRef<FarmScene | null>(null);
  const dprRef = useRef(1);
  const ultimoEstado = useRef(estado);
  ultimoEstado.current = estado;
  const margensRef = useRef(margens);
  margensRef.current = margens;
  const cbRef = useRef(aoTocarCelula);
  cbRef.current = aoTocarCelula;
  const [periodo, setPeriodo] = useState<Periodo>(periodoDoDia());

  useImperativeHandle(ref, () => ({
    efeitoColheita: (x, y, t) => cena.current?.efeitoColheita(x, y, t),
  }), []);

  useEffect(() => {
    const t = setInterval(() => setPeriodo(periodoDoDia()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let jogo: Phaser.Game | null = null;
    let obs: ResizeObserver | null = null;
    let cancelado = false;
    const vis = () => { if (!jogo) return; if (document.hidden) jogo.loop.sleep(); else jogo.loop.wake(); };
    carregarAssets().then((assets) => {
      if (cancelado || !host.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      dprRef.current = dpr;
      const el = host.current;
      const scene = new FarmScene();
      scene.cb = { aoTocarCelula: (x, y, it) => cbRef.current(x, y, it) };
      cena.current = scene;
      jogo = new Phaser.Game({
        type: Phaser.AUTO,
        parent: el,
        transparent: true,
        scale: { mode: Phaser.Scale.NONE, width: el.clientWidth * dpr, height: el.clientHeight * dpr, zoom: 1 / dpr },
        render: { antialias: true, mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
        input: { activePointers: 3 },
        banner: false,
      });
      scene.atualizarEstado(ultimoEstado.current);
      scene.definirMargens({ topo: margensRef.current.topo * dpr, baixo: margensRef.current.baixo * dpr });
      jogo.scene.add('FarmScene', scene, true, { assets });
      obs = new ResizeObserver(() => {
        if (!jogo || !el.clientWidth) return;
        jogo.scale.resize(el.clientWidth * dpr, el.clientHeight * dpr);
        jogo.scale.setZoom(1 / dpr);
      });
      obs.observe(el);
      // economiza bateria com o app em segundo plano
      document.addEventListener('visibilitychange', vis);
    });
    return () => {
      cancelado = true;
      document.removeEventListener('visibilitychange', vis);
      obs?.disconnect();
      jogo?.destroy(true);
      cena.current = null;
    };
  }, []);

  useEffect(() => { cena.current?.atualizarEstado(estado); }, [estado]);
  useEffect(() => { cena.current?.definirColocacao(colocacao); }, [colocacao]);
  useEffect(() => { cena.current?.definirModoSessao(modoSessao); }, [modoSessao]);
  useEffect(() => { cena.current?.definirErvas(ervas); }, [ervas]);
  useEffect(() => {
    const d = dprRef.current;
    cena.current?.definirMargens({ topo: margens.topo * d, baixo: margens.baixo * d });
  }, [margens.topo, margens.baixo]);

  const mes = new Date().getMonth();
  return (
    <div className={`cenario periodo-${periodo}`}>
      <div className="ceu" />
      <div className="sol" />
      <svg className="morros" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
        <path className="m1" d="M0 70 C60 30 110 40 160 60 C210 80 250 30 310 40 C350 46 380 60 400 55 L400 120 L0 120 Z" />
        <path className="m2" d="M0 90 C50 70 90 75 140 88 C200 104 250 70 300 78 C340 84 370 95 400 90 L400 120 L0 120 Z" />
        <g className="arvores">
          {[18, 52, 96, 141, 205, 262, 318, 372].map((x, i) => (
            <ellipse key={x} cx={x} cy={84 + (i % 3) * 4} rx={9 + (i % 2) * 4} ry={11 + (i % 3) * 2} />
          ))}
        </g>
      </svg>
      <div className="campo" />
      <div className="nuvem n1" /><div className="nuvem n2" /><div className="nuvem n3" />
      {periodo === 'noite' && <div className="estrelas" />}
      {mes === 5 && <div className="bandeirinhas" aria-hidden="true" />}
      <div ref={host} className="farm-canvas" />
      <div className="filtro-periodo" />
    </div>
  );
});
