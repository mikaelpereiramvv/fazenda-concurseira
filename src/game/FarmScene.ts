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

/** Margens da tela (px do canvas) ocupadas pela interface por cima da fazenda. */
export interface Margens { topo: number; baixo: number }

export function isoParaTela(x: number, y: number) {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

export function telaParaIso(px: number, py: number) {
  const a = px / (TILE_W / 2), b = py / (TILE_H / 2);
  return { x: Math.floor((a + b) / 2 + 0.5), y: Math.floor((b - a) / 2 + 0.5) };
}

/** Hash determinístico de célula (variação visual estável). */
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

interface Animal { img: Phaser.GameObjects.Image; sombra: Phaser.GameObjects.Image; gx: number; gy: number; timer?: Phaser.Time.TimerEvent }

export class FarmScene extends Phaser.Scene {
  private assets: AssetsRuntime = { atlas: null, frames: {}, faltando: [] };
  private estado: AppState | null = null;
  private camadaObjetos!: Phaser.GameObjects.Container;
  private chao: Phaser.GameObjects.Image[] = [];
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private sombras = new Map<string, Phaser.GameObjects.Image>();
  private animais = new Map<string, Animal>();
  private ervas: Phaser.GameObjects.Image[] = [];
  private qtdErvas = 0;
  private fantasma: Phaser.GameObjects.Graphics | null = null;
  private colocacao: Colocacao | null = null;
  private espessura = 60;
  private loteDesenhado = -1;
  private jaDesenhou = false;
  private modoSessao = false;
  private zoomBase = 0.5;
  private margens: Margens = { topo: 0, baixo: 0 };
  private usuarioMoveu = false;
  private vagalumes: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  cb: CallbacksCena = { aoTocarCelula: () => {} };

  constructor() { super('FarmScene'); }

  init(data: { assets: AssetsRuntime }) { this.assets = data.assets; }

  preload() {
    if (this.assets.atlas) this.load.multiatlas(ATLAS, this.assets.atlas, 'assets/atlas/');
  }

  create() {
    const g = this.assets.frames['tile_grama'];
    if (g) this.espessura = Math.max(20, g.h - TILE_H);
    this.criarTexturasProcedurais();
    this.camadaObjetos = this.add.container(0, 0);
    this.configurarToque();
    this.scale.on('resize', () => this.enquadrar(false));
    if (this.estado) this.desenhar(this.estado);
    this.time.addEvent({ delay: 60_000, loop: true, callback: () => this.atualizarNoite() });
    this.atualizarNoite();
  }

  // ---------- texturas ----------

  private temFrame(k: string) {
    return !!this.assets.frames[k] && this.textures.exists(ATLAS) && this.textures.get(ATLAS).has(k);
  }

  /** Sombra, partículas e erva daninha desenhadas em código (não precisam de arte). */
  private criarTexturasProcedurais() {
    const g = this.make.graphics({}, false);
    if (!this.textures.exists('fx_sombra_proc')) {
      for (let i = 6; i >= 1; i--) { g.fillStyle(0x2a1a0e, 0.05); g.fillEllipse(128, 40, 40 * i + 16, 13 * i + 6); }
      g.generateTexture('fx_sombra_proc', 256, 80); g.clear();
    }
    if (!this.textures.exists('fx_brilho_proc')) {
      g.fillStyle(0xfff3b0, 1); g.fillCircle(16, 16, 10); g.fillStyle(0xffffff, 1); g.fillCircle(16, 16, 5);
      g.generateTexture('fx_brilho_proc', 32, 32); g.clear();
    }
    if (!this.textures.exists('fx_folha_proc')) {
      g.fillStyle(0x6aa84f, 1); g.fillEllipse(16, 10, 26, 12); g.lineStyle(2, 0x2f6b3a, 1); g.strokeEllipse(16, 10, 26, 12);
      g.generateTexture('fx_folha_proc', 32, 20); g.clear();
    }
    if (!this.textures.exists('fx_poeira_proc')) {
      g.fillStyle(0xd9c3a0, 0.9); g.fillCircle(14, 14, 12);
      g.generateTexture('fx_poeira_proc', 28, 28); g.clear();
    }
    if (!this.textures.exists('fx_vagalume_proc')) {
      g.fillStyle(0xfff59d, 0.35); g.fillCircle(12, 12, 11); g.fillStyle(0xffffcc, 1); g.fillCircle(12, 12, 4);
      g.generateTexture('fx_vagalume_proc', 24, 24); g.clear();
    }
    if (!this.textures.exists('fx_erva_proc')) {
      // touceira de capim seco/daninha
      const lam = (x: number, y: number, dx: number, h: number, cor: number) => {
        g.fillStyle(cor, 1);
        g.fillTriangle(x - 6, y, x + 6, y, x + dx, y - h);
      };
      lam(40, 70, -18, 50, 0x7c8b2c); lam(50, 72, 2, 64, 0x8a9a34); lam(62, 70, 20, 46, 0x6d7a25);
      lam(32, 72, -26, 34, 0x9aa83e); lam(70, 72, 26, 36, 0x7c8b2c);
      g.lineStyle(2, 0x3b3a14, 0.8); g.strokeEllipse(51, 73, 60, 12);
      g.generateTexture('fx_erva_proc', 102, 80); g.clear();
    }
    g.destroy();
  }

  /** Placeholder elegante: caixote isométrico de madeira (construções) ou silhueta (animais). */
  private placeholder(k: string, w: number, h: number): string {
    const chave = `ph_${k}`;
    if (this.textures.exists(chave)) return chave;
    const prefixo = k.split('_')[0];
    const rt = this.make.renderTexture({ width: w, height: h }, false);
    const gr = this.make.graphics({}, false);
    const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
    if (prefixo === 'animal') {
      gr.fillStyle(0xe8d9bd, 1); gr.fillEllipse(w / 2, h * 0.62, w * 0.62, h * 0.42);
      gr.fillCircle(w * 0.3, h * 0.42, w * 0.16);
      gr.lineStyle(4, 0x4a2c1a, 1); gr.strokeEllipse(w / 2, h * 0.62, w * 0.62, h * 0.42); gr.strokeCircle(w * 0.3, h * 0.42, w * 0.16);
      rt.draw(gr);
      const ta = this.make.text({ text: '?', style: { fontSize: `${Math.round(w * 0.22)}px`, color: '#7d6656', fontFamily: 'sans-serif', fontStyle: 'bold' } }, false);
      rt.draw(ta, (w - ta.width) / 2, h * 0.62 - ta.height / 2);
      ta.destroy();
    } else {
      // caixote/placa de obra isométrico
      const cw = Math.min(w * 0.7, 300), ch = cw / 2, alt = cw * 0.38;
      const cx = w / 2, base = h - this.espessura * 0.6;
      const topo = [V(cx, base - ch - alt), V(cx + cw / 2, base - ch / 2 - alt), V(cx, base - alt), V(cx - cw / 2, base - ch / 2 - alt)];
      const esq = [V(cx - cw / 2, base - ch / 2 - alt), V(cx, base - alt), V(cx, base), V(cx - cw / 2, base - ch / 2)];
      const dir = [V(cx + cw / 2, base - ch / 2 - alt), V(cx, base - alt), V(cx, base), V(cx + cw / 2, base - ch / 2)];
      gr.fillStyle(0xd7a86e, 1); gr.fillPoints(topo, true);
      gr.fillStyle(0xb07c45, 1); gr.fillPoints(esq, true);
      gr.fillStyle(0x93622f, 1); gr.fillPoints(dir, true);
      gr.lineStyle(4, 0x4a2c1a, 1); gr.strokePoints(topo, true); gr.strokePoints(esq, true); gr.strokePoints(dir, true);
      // tábuas
      gr.lineStyle(2, 0x6b4421, 0.7);
      for (let i = 1; i < 3; i++) { gr.lineBetween(cx - cw / 2, base - ch / 2 - (alt * i) / 3, cx, base - (alt * i) / 3); gr.lineBetween(cx + cw / 2, base - ch / 2 - (alt * i) / 3, cx, base - (alt * i) / 3); }
      rt.draw(gr);
      const nome = k.replace(/^(bld|crop|tile)_/, '').replace(/_lv\d|_stage\d|_idle_\d+/g, '').replace(/_/g, ' ');
      const t = this.make.text({ text: nome, style: { fontSize: '26px', color: '#4a2c1a', fontFamily: 'sans-serif', fontStyle: 'bold', align: 'center', wordWrap: { width: cw * 0.6 } } }, false);
      rt.draw(t, cx - t.width / 2, base - ch / 2 - alt - t.height / 2);
      t.destroy();
    }
    rt.saveTexture(chave);
    gr.destroy(); rt.destroy();
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
    if (n !== this.loteDesenhado) { this.desenharChao(n); this.loteDesenhado = n; this.enquadrar(true); }
    this.atualizarChaoOcupado(s);
    const vivos = new Set<string>();
    const novosPorId = new Map<string, Phaser.GameObjects.Image>();
    const antigosPorId = new Map<string, Phaser.GameObjects.Image>();
    for (const [k, img] of this.sprites) antigosPorId.set(k.split('|')[0], img);

    let atraso = 0;
    for (const it of s.fazenda.itens) {
      if (it.tipo === 'animal') { this.garantirAnimal(it); continue; }
      const chave = `${it.id}|${this.chaveVisual(it)}`;
      vivos.add(chave);
      if (this.sprites.has(chave)) continue;
      const img = this.criarSprite(it);
      this.sprites.set(chave, img);
      this.camadaObjetos.add(img);
      novosPorId.set(it.id, img);
      if (!this.jaDesenhou) continue;
      const anterior = antigosPorId.get(it.id);
      if (anterior && anterior.active) {
        // mudou de estágio/posição: crossfade com quique, em sequência ("cresceu enquanto você estudava")
        this.transicao(anterior, img, atraso);
        atraso += 140;
      } else {
        this.pop(img);
      }
    }
    for (const [k, img] of this.sprites) {
      if (vivos.has(k)) continue;
      const id = k.split('|')[0];
      if (!novosPorId.has(id)) this.tweens.add({ targets: img, alpha: 0, scale: 0.85, duration: 200, onComplete: () => img.destroy() });
      this.sprites.delete(k);
    }
    // sombras sob construções
    const vivosSombra = new Set<string>();
    for (const it of s.fazenda.itens.filter((i) => i.tipo === 'construcao')) {
      const [w, h] = tamanhoItem(it);
      const chave = `${it.id}:${it.x},${it.y}:${w}x${h}`;
      vivosSombra.add(chave);
      if (this.sombras.has(chave)) continue;
      const centro = isoParaTela(it.x + (w - 1) / 2, it.y + (h - 1) / 2);
      const sh = this.add.image(centro.x, centro.y + TILE_H * 0.15, 'fx_sombra_proc').setScale(1.4 * w, 1.6 * h).setAlpha(0.8);
      sh.setDepth((it.x + w - 1 + it.y + h - 1) * 10 + 4);
      this.sombras.set(chave, sh);
      this.camadaObjetos.add(sh);
    }
    for (const [k, sh] of this.sombras) if (!vivosSombra.has(k)) { sh.destroy(); this.sombras.delete(k); }
    // animais removidos
    const idsAnimais = new Set(s.fazenda.itens.filter((i) => i.tipo === 'animal').map((i) => i.id));
    for (const [id, a] of this.animais) if (!idsAnimais.has(id)) { a.timer?.remove(); a.img.destroy(); a.sombra.destroy(); this.animais.delete(id); }

    this.desenharErvas(s);
    this.camadaObjetos.sort('depth');
    this.jaDesenhou = true;
  }

  private chaveVisual(it: ItemFazenda) {
    if (it.tipo === 'canteiro') return `c:${it.cultura?.id ?? '-'}:${estagioCultura(it) ?? '-'}:${it.x},${it.y}`;
    return `${it.ref}:${it.nivel ?? 1}:${it.x},${it.y}:r${it.rot ?? 0}`;
  }

  private desenharChao(n: number) {
    this.chao.forEach((c) => c.destroy());
    this.chao = [];
    for (let x = 0; x < n; x++)
      for (let y = 0; y < n; y++) {
        const v = hash(x, y);
        const variantes = ['tile_grama', 'tile_grama_v2', 'tile_grama_v3'].filter((k) => this.temFrame(k));
        const k = variantes.length > 1 ? variantes[Math.floor(v * variantes.length)] : 'tile_grama';
        const img = this.imagem(k, ['tile_grama'], [TILE_W, TILE_H + this.espessura]);
        const p = isoParaTela(x, y);
        img.setPosition(p.x, p.y + TILE_H / 2 + this.espessura);
        img.setDepth((x + y) * 10);
        // leve variação de tom para quebrar o "tabuleiro"
        const tons = [0xffffff, 0xf3fbe9, 0xfffaf0, 0xeef7e2];
        img.setTint(tons[Math.floor(v * tons.length)]);
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
        const alt = e === 'murcho' ? [] : [3, 2, 4, 1].filter((x) => x !== e).sort((a, b) => Math.abs(a - (e as number)) - Math.abs(b - (e as number))).map((x) => `${base}stage${x}`);
        img = this.imagem(k, alt);
        // pronto para colher: brilho suave pulsando
        if (e === 4) this.tweens.add({ targets: img, scaleY: 1.03, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
      const p = isoParaTela(it.x, it.y);
      img.setPosition(p.x, p.y + TILE_H / 2 + this.espessura);
      img.setDepth((it.x + it.y) * 10 + 1);
    } else {
      const rot = it.rot ?? 0;
      const CERCAS = ['bld_cerca_a', 'bld_cerca_b', 'bld_cerca_poste'];
      const mes = new Date().getMonth();
      const ipeFlorido = it.ref === 'ipe' && (mes === 7 || mes === 8);
      const k = it.ref === 'casa' ? `bld_casa_lv${it.nivel ?? 1}` : it.ref === 'cerca' ? CERCAS[rot % 3] : ipeFlorido ? 'bld_ipe_florido' : `bld_${it.ref}`;
      const alt = it.ref === 'casa' ? ['bld_casa_lv1'] : it.ref === 'cerca' ? ['bld_cerca_a'] : it.ref === 'ipe' ? ['bld_ipe'] : [];
      img = this.imagem(k, alt, [TILE_W * w, TILE_W * Math.max(w, h)]);
      if (it.ref !== 'cerca' && rot % 2 === 1) img.setFlipX(true);
      if (it.ref === 'cerca' && rot === 1 && !this.temFrame('bld_cerca_b')) img.setFlipX(true);
      const centro = isoParaTela(it.x + (w - 1) / 2, it.y + (h - 1) / 2);
      const base = isoParaTela(it.x + w - 0.5, it.y + h - 0.5);
      img.setPosition(centro.x, base.y + this.espessura * 0.6);
      img.setDepth((it.x + w - 1 + it.y + h - 1) * 10 + 5);
    }
    img.setData('item', it);
    img.setData('escala', img.scaleX);
    return img;
  }

  // ---------- efeitos ----------

  private pop(img: Phaser.GameObjects.Image) {
    const y0 = img.y;
    img.setScale(0.2).setAlpha(0).setY(y0 - 40);
    this.tweens.add({ targets: img, scale: 1, alpha: 1, y: y0, duration: 420, ease: 'Back.out' });
    this.poeira(img.x, y0, 8);
  }

  private transicao(velho: Phaser.GameObjects.Image, novo: Phaser.GameObjects.Image, atraso: number) {
    novo.setAlpha(0);
    this.tweens.add({ targets: velho, alpha: 0, duration: 260, delay: atraso, onComplete: () => velho.destroy() });
    this.tweens.add({
      targets: novo, alpha: 1, duration: 300, delay: atraso,
      onStart: () => {
        novo.setScale(1, 0.85);
        this.tweens.add({ targets: novo, scaleY: 1, duration: 420, ease: 'Back.out' });
        this.brilho(novo.x, novo.y - 120, 6);
      },
    });
  }

  private poeira(x: number, y: number, qtd: number) {
    const e = this.add.particles(x, y, 'fx_poeira_proc', {
      speed: { min: 60, max: 180 }, angle: { min: 180, max: 360 }, scale: { start: 1.2, end: 0 }, alpha: { start: 0.8, end: 0 },
      lifespan: 500, quantity: qtd, emitting: false,
    });
    e.setDepth(99999); this.camadaObjetos.add(e); e.explode(qtd);
    this.time.delayedCall(700, () => e.destroy());
  }

  private brilho(x: number, y: number, qtd: number) {
    const e = this.add.particles(x, y, 'fx_brilho_proc', {
      speed: { min: 80, max: 220 }, angle: { min: 200, max: 340 }, scale: { start: 1.6, end: 0 }, alpha: { start: 1, end: 0 },
      lifespan: 700, quantity: qtd, emitting: false, gravityY: 300,
    });
    e.setDepth(99999); this.camadaObjetos.add(e); e.explode(qtd);
    this.time.delayedCall(900, () => e.destroy());
  }

  /** Efeito de colheita: folhas, brilho e "+N" subindo. */
  efeitoColheita(x: number, y: number, texto: string) {
    if (!this.camadaObjetos) return;
    const p = isoParaTela(x, y);
    const folhas = this.add.particles(p.x, p.y - 40, 'fx_folha_proc', {
      speed: { min: 150, max: 360 }, angle: { min: 200, max: 340 }, rotate: { min: 0, max: 360 }, scale: { start: 2, end: 0.6 },
      alpha: { start: 1, end: 0 }, lifespan: 900, gravityY: 600, quantity: 14, emitting: false,
    });
    folhas.setDepth(99999); this.camadaObjetos.add(folhas); folhas.explode(14);
    this.brilho(p.x, p.y - 60, 10);
    const t = this.add.text(p.x, p.y - 140, texto, {
      fontFamily: 'sans-serif', fontStyle: 'bold', fontSize: '64px', color: '#fff7d6', stroke: '#4a2c1a', strokeThickness: 10,
    }).setOrigin(0.5).setDepth(100000);
    this.camadaObjetos.add(t);
    this.tweens.add({ targets: t, y: t.y - 160, alpha: { from: 1, to: 0 }, duration: 1300, ease: 'Cubic.out', onComplete: () => { t.destroy(); folhas.destroy(); } });
  }

  /** Pequeno "squash" ao tocar num objeto. */
  private apertar(it: ItemFazenda) {
    for (const [k, img] of this.sprites) {
      if (!k.startsWith(`${it.id}|`)) continue;
      this.tweens.add({ targets: img, scaleX: 1.06, scaleY: 0.92, duration: 80, yoyo: true, ease: 'Quad.out' });
    }
  }

  // ---------- animais ----------

  private garantirAnimal(it: ItemFazenda) {
    const existente = this.animais.get(it.id);
    if (existente) {
      existente.img.setFlipX((it.rot ?? 0) % 2 === 1);
      return;
    }
    const img = this.imagem(`animal_${it.ref}_idle_01`, [], [192, 192]);
    if ((it.rot ?? 0) % 2 === 1) img.setFlipX(true);
    const sombra = this.add.image(0, 0, 'fx_sombra_proc').setScale(img.width / 256 * 1.1, 0.9).setAlpha(0.9);
    const a: Animal = { img, sombra, gx: it.x, gy: it.y };
    this.posicionarAnimal(a, it.x, it.y);
    this.camadaObjetos.add([sombra, img]);
    this.tweens.add({ targets: img, scaleY: 0.96, duration: 900 + Math.random() * 400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.animais.set(it.id, a);
    if (this.jaDesenhou) this.pop(img);
    this.agendarPasseio(a);
  }

  private posicionarAnimal(a: Animal, gx: number, gy: number) {
    const p = isoParaTela(gx, gy);
    a.img.setPosition(p.x, p.y + TILE_H * 0.2);
    a.sombra.setPosition(p.x, p.y + TILE_H * 0.18);
    a.img.setDepth(Math.round((gx + gy) * 10) + 6);
    a.sombra.setDepth(Math.round((gx + gy) * 10) + 5.5);
  }

  private celulaLivreParaAnimal(x: number, y: number) {
    if (!this.estado) return false;
    const n = tamanhoLote(this.estado);
    if (x < 0 || y < 0 || x >= n || y >= n) return false;
    return !this.estado.fazenda.itens.some((i) => {
      if (i.tipo === 'animal') return false;
      const [w, h] = tamanhoItem(i);
      return x >= i.x && x < i.x + w && y >= i.y && y < i.y + h;
    });
  }

  private agendarPasseio(a: Animal) {
    a.timer?.remove();
    a.timer = this.time.delayedCall(2500 + Math.random() * 5500, () => this.passear(a));
  }

  private passear(a: Animal) {
    if (!a.img.active) return;
    if (this.modoSessao) { this.agendarPasseio(a); return; }
    const opcoes: [number, number][] = [];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      if (!dx && !dy) continue;
      const x = Math.round(a.gx) + dx, y = Math.round(a.gy) + dy;
      if (this.celulaLivreParaAnimal(x, y)) opcoes.push([x, y]);
    }
    // se estiver em cima de algo (comprado antes desta versão), procura sair
    if (!opcoes.length) { this.agendarPasseio(a); return; }
    const [tx, ty] = opcoes[Math.floor(Math.random() * opcoes.length)];
    const de = isoParaTela(a.gx, a.gy), para = isoParaTela(tx, ty);
    a.img.setFlipX(para.x > de.x);
    const dur = 1400 + Phaser.Math.Distance.Between(de.x, de.y, para.x, para.y) * 3;
    const prog = { t: 0 };
    const gx0 = a.gx, gy0 = a.gy;
    this.tweens.add({
      targets: prog, t: 1, duration: dur, ease: 'Sine.inOut',
      onUpdate: () => {
        a.gx = gx0 + (tx - gx0) * prog.t; a.gy = gy0 + (ty - gy0) * prog.t;
        this.posicionarAnimal(a, a.gx, a.gy);
        a.img.y -= Math.abs(Math.sin(prog.t * Math.PI * 6)) * 8; // passinhos
      },
      onComplete: () => { a.gx = tx; a.gy = ty; this.camadaObjetos.sort('depth'); this.agendarPasseio(a); },
    });
  }

  // ---------- erva daninha (revisão atrasada) ----------

  definirErvas(qtd: number) {
    this.qtdErvas = qtd;
    if (this.estado && this.camadaObjetos) this.desenharErvas(this.estado);
  }

  private desenharErvas(s: AppState) {
    this.ervas.forEach((e) => e.destroy());
    this.ervas = [];
    const canteiros = s.fazenda.itens.filter((i) => i.tipo === 'canteiro');
    for (let i = 0; i < Math.min(this.qtdErvas, canteiros.length); i++) {
      const c = canteiros[(i * 7) % canteiros.length];
      const p = isoParaTela(c.x, c.y);
      const e = this.add.image(p.x + 40 * ((i % 3) - 1), p.y + 10, 'fx_erva_proc').setOrigin(0.5, 1).setScale(1.3);
      e.setDepth((c.x + c.y) * 10 + 2);
      this.tweens.add({ targets: e, angle: { from: -3, to: 3 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.ervas.push(e);
      this.camadaObjetos.add(e);
    }
  }

  // ---------- modo sessão (contemplação) e noite ----------

  definirModoSessao(on: boolean) {
    if (this.modoSessao === on) return;
    this.modoSessao = on;
    for (const a of this.animais.values()) {
      this.tweens.killTweensOf(a.img);
      this.tweens.add({ targets: a.img, scaleY: on ? 0.94 : 0.96, duration: on ? 2200 : 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    this.usuarioMoveu = false;
    this.enquadrar(true);
  }

  private atualizarNoite() {
    const h = new Date().getHours();
    const noite = h >= 19 || h < 5;
    if (noite && !this.vagalumes && this.estado) {
      const n = tamanhoLote(this.estado);
      const c = isoParaTela(n / 2, n / 2);
      this.vagalumes = this.add.particles(c.x, c.y, 'fx_vagalume_proc', {
        x: { min: -n * TILE_W * 0.45, max: n * TILE_W * 0.45 }, y: { min: -n * TILE_H * 0.5, max: n * TILE_H * 0.3 },
        speedX: { min: -20, max: 20 }, speedY: { min: -30, max: 5 }, scale: { min: 1.2, max: 2.2 },
        alpha: { start: 0, end: 1, ease: 'Sine.inOut' }, lifespan: 3500, frequency: 380, quantity: 1, blendMode: 'ADD',
      });
      this.vagalumes.setDepth(99990);
      this.camadaObjetos.add(this.vagalumes);
    } else if (!noite && this.vagalumes) {
      this.vagalumes.destroy(); this.vagalumes = null;
    }
  }

  // ---------- câmera e toque ----------

  definirMargens(m: Margens) {
    this.margens = m;
    if (this.camadaObjetos) this.enquadrar(!this.usuarioMoveu);
  }

  /** Enquadra o terreno inteiro na área livre entre o HUD e o painel. */
  private enquadrar(resetZoom: boolean) {
    if (!this.estado) return;
    const cam = this.cameras.main;
    const n = tamanhoLote(this.estado);
    const largMundo = n * TILE_W;
    const altMundo = n * TILE_H + this.espessura + TILE_W * 0.9; // folga para a casa e árvores
    const areaH = Math.max(100, cam.height - this.margens.topo - this.margens.baixo);
    // largura manda no celular em pé; aceita cortar só as pontas do losango (onde não há nada)
    this.zoomBase = Math.min((cam.width * 1.12) / largMundo, areaH / altMundo);
    if (resetZoom || cam.zoom < this.zoomBase * 0.7 || cam.zoom > this.zoomBase * 3.2) cam.setZoom(this.zoomBase);
    const centro = isoParaTela((n - 1) / 2, (n - 1) / 2);
    const deslocTela = (this.margens.baixo - this.margens.topo) / 2;
    this.atualizarLimites();
    if (resetZoom) cam.centerOn(centro.x, centro.y - TILE_H * 0.15 + deslocTela / cam.zoom);
  }

  /** Limites da câmera: o centro da tela pode ir a qualquer ponto do terreno, nunca muito além dele. */
  private atualizarLimites() {
    if (!this.estado) return;
    const cam = this.cameras.main;
    const n = tamanhoLote(this.estado);
    const largMundo = n * TILE_W;
    const topoLote = -TILE_W * 1.2, baseLote = n * TILE_H + this.espessura;
    const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    cam.setBounds(-largMundo / 2 - vw / 2, topoLote - vh / 2, largMundo + vw, baseLote - topoLote + vh);
  }

  private configurarToque() {
    let arrastando = false;
    let ini = { x: 0, y: 0 };
    let distPinca = 0;
    this.input.addPointer(1);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { ini = { x: p.x, y: p.y }; arrastando = false; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.modoSessao) return;
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
        this.usuarioMoveu = true;
        const cam = this.cameras.main;
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!arrastando && !this.modoSessao) this.tocar(p);
      arrastando = false;
      distPinca = 0;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => { if (!this.modoSessao) this.zoom(dy > 0 ? 0.9 : 1.1); });
  }

  private zoom(f: number) {
    this.usuarioMoveu = true;
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * f, this.zoomBase * 0.75, this.zoomBase * 3));
    this.atualizarLimites();
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
    if (item && !this.colocacao) this.apertar(item);
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
