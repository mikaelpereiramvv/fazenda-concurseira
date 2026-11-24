import Phaser from 'phaser';
import type { AppState, ItemFazenda } from '../domain/tipos';
import { estagioCultura, tamanhoItem, tamanhoLote } from '../domain/fazenda';

// Projeção isométrica 2:1 no espaço de pixels das texturas (@3x).
export const TILE_W = 384;
export const TILE_H = 192;
const ATLAS = 'farm';

export interface InfoFrame { w: number; h: number; ancora: [number, number] }
export interface AssetsRuntime { atlas: string | null; frames: Record<string, InfoFrame>; faltando: string[] }

export interface CallbacksCena {
  aoTocarCelula: (x: number, y: number, item?: ItemFazenda) => void;
}

export interface Colocacao { w: number; h: number; rotulo: string }

const CORES_PLACEHOLDER: Record<string, number> = {
  tile: 0x6aa84f, crop: 0x8bc34a, canteiro: 0x7a2e1e, bld: 0xc9a27e, animal: 0xf2c230, ui: 0x999999,
};

export function isoParaTela(x: number, y: number) {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

export function telaParaIso(px: number, py: number) {
  const a = px / (TILE_W / 2), b = py / (TILE_H / 2);
  return { x: Math.floor((a + b) / 2 + 0.5), y: Math.floor((b - a) / 2 + 0.5) };
}

export class FarmScene extends Phaser.Scene {
  private assets: AssetsRuntime = { atlas: null, frames: {}, faltando: [] };
  private estado: AppState | null = null;
  private camadaObjetos!: Phaser.GameObjects.Container;
  private chao: Phaser.GameObjects.Image[] = [];
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private fantasma: Phaser.GameObjects.Graphics | null = null;
  private colocacao: Colocacao | null = null;
  private espessura = 60;
  private loteDesenhado = -1;
  cb: CallbacksCena = { aoTocarCelula: () => {} };

  constructor() { super('FarmScene'); }

  init(data: { assets: AssetsRuntime }) { this.assets = data.assets; }

  preload() {
    if (this.assets.atlas) this.load.multiatlas(ATLAS, this.assets.atlas, 'assets/atlas/');
  }

  create() {
    const g = this.assets.frames['tile_grama'];
    if (g) this.espessura = Math.max(20, g.h - TILE_H);
    this.camadaObjetos = this.add.container(0, 0);
    this.configurarCamera();
    this.configurarToque();
    if (this.estado) this.desenhar(this.estado);
  }

  // ---------- texturas ----------

  private temFrame(k: string) {
    return !!this.assets.frames[k] && this.textures.exists(ATLAS) && this.textures.get(ATLAS).has(k);
  }

  /** Placeholder: losango ou caixa colorida com o nome do asset. */
  private placeholder(k: string, w: number, h: number): string {
    const chave = `ph_${k}`;
    if (this.textures.exists(chave)) return chave;
    const prefixo = k.split('_')[0];
    const cor = CORES_PLACEHOLDER[prefixo] ?? 0xb0b0b0;
    const rt = this.make.renderTexture({ width: w, height: h }, false);
    const gr = this.make.graphics({}, false);
    gr.fillStyle(cor, 0.9);
    if (prefixo === 'animal') {
      gr.fillCircle(w / 2, h / 2, w * 0.4);
      gr.lineStyle(4, 0x4a2c1a, 1);
      gr.strokeCircle(w / 2, h / 2, w * 0.4);
      rt.draw(gr);
      const ta = this.make.text({ text: k.split('_')[1], style: { fontSize: '34px', color: '#4a2c1a', fontFamily: 'sans-serif', fontStyle: 'bold' } }, false);
      rt.draw(ta, (w - ta.width) / 2, (h - ta.height) / 2);
      rt.saveTexture(chave);
      gr.destroy(); ta.destroy(); rt.destroy();
      return chave;
    }
    const topo = h - TILE_H - this.espessura;
    gr.fillPoints([
      new Phaser.Math.Vector2(w / 2, topo), new Phaser.Math.Vector2(w, topo + TILE_H / 2),
      new Phaser.Math.Vector2(w / 2, topo + TILE_H), new Phaser.Math.Vector2(0, topo + TILE_H / 2),
    ], true);
    gr.lineStyle(4, 0x4a2c1a, 1);
    gr.strokePoints([
      new Phaser.Math.Vector2(w / 2, topo), new Phaser.Math.Vector2(w, topo + TILE_H / 2),
      new Phaser.Math.Vector2(w / 2, topo + TILE_H), new Phaser.Math.Vector2(0, topo + TILE_H / 2),
    ], true);
    rt.draw(gr);
    const t = this.make.text({ text: k.replace(/_/g, ' '), style: { fontSize: '30px', color: '#ffffff', fontFamily: 'sans-serif', align: 'center', wordWrap: { width: w - 20 } } }, false);
    rt.draw(t, (w - t.width) / 2, topo + TILE_H / 2 - t.height / 2);
    rt.saveTexture(chave);
    gr.destroy(); t.destroy(); rt.destroy();
    return chave;
  }

  /** Cria imagem do frame do atlas ou um placeholder do tamanho certo. */
  private imagem(k: string, alternativas: string[] = [], tamanho: [number, number] = [TILE_W, TILE_H + 60]) {
    for (const c of [k, ...alternativas]) {
      if (this.temFrame(c)) {
        const img = this.add.image(0, 0, ATLAS, c);
        const f = this.assets.frames[c];
        img.setOrigin(f.ancora[0], f.ancora[1]);
        return img;
      }
    }
    const img = this.add.image(0, 0, this.placeholder(k, tamanho[0], tamanho[1]));
    img.setOrigin(0.5, 1);
    return img;
  }

  // ---------- desenho ----------

  atualizarEstado(s: AppState) {
    this.estado = s;
    if (this.camadaObjetos && this.sys?.isActive?.()) this.desenhar(s);
  }

  private desenhar(s: AppState) {
    const n = tamanhoLote(s);
    if (n !== this.loteDesenhado) { this.desenharChao(s, n); this.loteDesenhado = n; this.centralizar(n); }
    this.atualizarChaoOcupado(s);
    const vivos = new Set<string>();
    for (const it of s.fazenda.itens) {
      const chave = `${it.id}|${this.chaveVisual(it)}`;
      vivos.add(chave);
      if (!this.sprites.has(chave)) {
        const img = this.criarSprite(it);
        this.sprites.set(chave, img);
        this.camadaObjetos.add(img);
      }
    }
    for (const [k, img] of this.sprites) if (!vivos.has(k)) { img.destroy(); this.sprites.delete(k); }
    this.camadaObjetos.sort('depth');
  }

  private chaveVisual(it: ItemFazenda) {
    if (it.tipo === 'canteiro') return `c:${it.cultura?.id ?? '-'}:${estagioCultura(it) ?? '-'}:${it.x},${it.y}`;
    return `${it.ref}:${it.nivel ?? 1}:${it.x},${it.y}`;
  }

  private desenharChao(s: AppState, n: number) {
    this.chao.forEach((c) => c.destroy());
    this.chao = [];
    void s;
    for (let x = 0; x < n; x++)
      for (let y = 0; y < n; y++) {
        const img = this.imagem('tile_grama', [], [TILE_W, TILE_H + this.espessura]);
        const p = isoParaTela(x, y);
        img.setPosition(p.x, p.y + TILE_H / 2 + this.espessura);
        img.setDepth((x + y) * 10);
        img.setData('celula', [x, y]);
        this.chao.push(img);
        this.camadaObjetos.add(img);
      }
  }

  /** Esconde a grama embaixo de canteiros (o canteiro já é um bloco de terra). */
  private atualizarChaoOcupado(s: AppState) {
    const ocupadas = new Set(s.fazenda.itens.filter((i) => i.tipo === 'canteiro').map((i) => `${i.x},${i.y}`));
    for (const c of this.chao) {
      const [x, y] = c.getData('celula') as [number, number];
      c.setVisible(!ocupadas.has(`${x},${y}`));
    }
  }

  private criarSprite(it: ItemFazenda): Phaser.GameObjects.Image {
    const [w, h] = tamanhoItem(it);
    let img: Phaser.GameObjects.Image;
    if (it.tipo === 'canteiro') {
      const e = estagioCultura(it);
      if (!it.cultura || e === null) img = this.imagem('canteiro_vazio', ['tile_terra_arada']);
      else {
        const base = `crop_${it.cultura.id}_`;
        const k = e === 'murcho' ? `${base}murcho` : `${base}stage${e}`;
        // estágio faltando: usa o vizinho mais próximo que existir
        const alt = e === 'murcho' ? [] : [3, 2, 4, 1].filter((x) => x !== e).sort((a, b) => Math.abs(a - (e as number)) - Math.abs(b - (e as number))).map((x) => `${base}stage${x}`);
        img = this.imagem(k, alt);
      }
      const p = isoParaTela(it.x, it.y);
      img.setPosition(p.x, p.y + TILE_H / 2 + this.espessura);
      img.setDepth((it.x + it.y) * 10 + 1);
    } else if (it.tipo === 'construcao') {
      const k = it.ref === 'casa' ? `bld_casa_lv${it.nivel ?? 1}` : it.ref === 'cerca' ? 'bld_cerca_a' : `bld_${it.ref}`;
      const alt = it.ref === 'casa' ? ['bld_casa_lv1'] : [];
      img = this.imagem(k, alt, [TILE_W * w, TILE_W * Math.max(w, h)]);
      const centro = isoParaTela(it.x + (w - 1) / 2, it.y + (h - 1) / 2);
      const base = isoParaTela(it.x + w - 0.5, it.y + h - 0.5);
      img.setPosition(centro.x, base.y + this.espessura * 0.6);
      img.setDepth((it.x + w - 1 + it.y + h - 1) * 10 + 5);
    } else {
      img = this.imagem(`animal_${it.ref}_idle_01`, [], [192, 192]);
      const p = isoParaTela(it.x, it.y);
      img.setPosition(p.x, p.y + TILE_H * 0.2);
      img.setDepth((it.x + it.y) * 10 + 6);
      this.tweens.add({ targets: img, scaleY: 0.96, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    img.setData('item', it);
    return img;
  }

  // ---------- câmera e toque ----------

  private configurarCamera() {
    const cam = this.cameras.main;
    cam.setBackgroundColor('#8FC9E8');
    cam.setZoom(0.5);
  }

  private centralizar(n: number) {
    const centro = isoParaTela(n / 2, n / 2);
    this.cameras.main.centerOn(centro.x, centro.y + TILE_H / 2);
  }

  private configurarToque() {
    let arrastando = false;
    let ini = { x: 0, y: 0 };
    let distPinca = 0;
    this.input.addPointer(1);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { ini = { x: p.x, y: p.y }; arrastando = false; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const p1 = this.input.pointer1, p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (distPinca > 0) this.zoom(d / distPinca);
        distPinca = d;
        arrastando = true;
        return;
      }
      distPinca = 0;
      if (!p.isDown) { this.moverFantasma(p); return; }
      if (Phaser.Math.Distance.Between(ini.x, ini.y, p.x, p.y) > 10) arrastando = true;
      if (arrastando) {
        const cam = this.cameras.main;
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!arrastando) this.tocar(p);
      arrastando = false;
      distPinca = 0;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoom(dy > 0 ? 0.9 : 1.1));
  }

  private zoom(f: number) {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * f, 0.2, 1.4));
  }

  private celulaDoPonteiro(p: Phaser.Input.Pointer) {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    return telaParaIso(w.x, w.y);
  }

  private tocar(p: Phaser.Input.Pointer) {
    if (!this.estado) return;
    const c = this.celulaDoPonteiro(p);
    const n = tamanhoLote(this.estado);
    if (c.x < 0 || c.y < 0 || c.x >= n || c.y >= n) return;
    if (this.colocacao) this.moverFantasma(p);
    const item = this.estado.fazenda.itens.find((i) => {
      if (i.tipo === 'animal') return false;
      const [w, h] = tamanhoItem(i);
      return c.x >= i.x && c.x < i.x + w && c.y >= i.y && c.y < i.y + h;
    });
    this.cb.aoTocarCelula(c.x, c.y, item);
  }

  // ---------- modo colocar ----------

  definirColocacao(c: Colocacao | null) {
    this.colocacao = c;
    this.fantasma?.destroy();
    this.fantasma = null;
    if (c && this.camadaObjetos) {
      this.fantasma = this.add.graphics();
      this.fantasma.setDepth(100000);
      this.camadaObjetos.add(this.fantasma);
      const n = this.estado ? tamanhoLote(this.estado) : 8;
      this.desenharFantasma(Math.floor(n / 2), Math.floor(n / 2));
    }
  }

  private moverFantasma(p: Phaser.Input.Pointer) {
    if (!this.colocacao || !this.fantasma) return;
    const c = this.celulaDoPonteiro(p);
    this.desenharFantasma(c.x, c.y);
  }

  private desenharFantasma(x: number, y: number) {
    if (!this.fantasma || !this.colocacao) return;
    const g = this.fantasma;
    g.clear();
    g.fillStyle(0xf2c230, 0.45);
    g.lineStyle(6, 0xf2c230, 1);
    const { w, h } = this.colocacao;
    const pts = [isoParaTela(x - 0.5, y - 0.5), isoParaTela(x + w - 0.5, y - 0.5), isoParaTela(x + w - 0.5, y + h - 0.5), isoParaTela(x - 0.5, y + h - 0.5)]
      .map((q) => new Phaser.Math.Vector2(q.x, q.y));
    g.fillPoints(pts, true);
    g.strokePoints(pts, true);
  }
}
