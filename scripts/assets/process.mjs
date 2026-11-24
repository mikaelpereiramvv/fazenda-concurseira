#!/usr/bin/env node
// Pipeline de assets do Gemini → jogo.
//
//   assets/raw/<chave>.(png|jpg|jpeg|webp)      imagem única (fundo branco)
//   assets/raw/sheets/<nome>.(png|jpg|...)      folha com vários itens (ex.: estágios lado a lado)
//
// Para cada imagem:
//   1. remove o fundo branco por "flood fill" a partir das bordas (o branco DENTRO do desenho fica);
//      sombras cinza-claras viram sombra preta semitransparente (color-to-alpha);
//   2. recorta no conteúdo;
//   3. redimensiona para o tamanho da categoria (assets/manifest.json → tamanhos);
//   4. empacota tudo num multiatlas do Phaser (public/assets/atlas/farm.json + farm-N.png).
//
// Uso: npm run assets            (processa tudo)
//      npm run assets -- --debug (salva também os PNG individuais em assets/.cache/out)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MaxRectsPacker } from 'maxrects-packer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RAW = path.join(ROOT, 'assets/raw');
const OUT_ATLAS = path.join(ROOT, 'public/assets/atlas');
const OUT_RUNTIME = path.join(ROOT, 'public/assets/assets.json');
const CACHE = path.join(ROOT, 'assets/.cache/out');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
const DEBUG = process.argv.includes('--debug');
const EXTS = ['.png', '.jpg', '.jpeg', '.webp'];
// valor em "assets" pode ser "bloco" ou { "tamanho": "bloco", "manterBrancoInterno": true }
const ASSETS = Object.fromEntries(
  Object.entries(manifest.assets).map(([k, v]) => [k, typeof v === 'string' ? { tamanho: v } : v]),
);

// ---------------- remoção de fundo ----------------

/** Pixel "parece fundo": claro e pouco saturado (branco, ruído de JPEG, sombra cinza). */
function pareceFundo(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mn >= 150 && mx - mn <= 28;
}

/**
 * Recebe RGBA bruto. Marca como fundo tudo que é "parece fundo" e está ligado às bordas.
 * Nas áreas de fundo aplica color-to-alpha a partir do branco.
 */
export function removerFundo(data, w, h, opcoes = {}) {
  const n = w * h;
  const fundo = new Uint8Array(n);
  const fila = new Int32Array(n);
  let ini = 0, fim = 0;
  const tentar = (i) => {
    if (fundo[i]) return;
    const o = i * 4;
    if (data[o + 3] < 10 || pareceFundo(data[o], data[o + 1], data[o + 2])) {
      fundo[i] = 1;
      fila[fim++] = i;
    }
  };
  for (let x = 0; x < w; x++) { tentar(x); tentar((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { tentar(y * w); tentar(y * w + w - 1); }
  while (ini < fim) {
    const i = fila[ini++];
    const x = i % w, y = (i / w) | 0;
    if (x > 0) tentar(i - 1);
    if (x < w - 1) tentar(i + 1);
    if (y > 0) tentar(i - w);
    if (y < h - 1) tentar(i + w);
  }
  // "buracos": regiões de branco PURO fechadas pelo desenho (entre tábuas da cerca, entre folhas).
  // Só branco quase puro (creme/bege das paredes é preservado). Desligue por asset com "manterBrancoInterno".
  if (!opcoes.manterBrancoInterno) {
    const puro = (o) => {
      const r = data[o], g = data[o + 1], b = data[o + 2];
      return Math.min(r, g, b) >= 236 && Math.max(r, g, b) - Math.min(r, g, b) <= 14;
    };
    const visto = new Uint8Array(n);
    const minBuraco = Math.max(24, Math.round(n * 0.00004));
    for (let s = 0; s < n; s++) {
      if (fundo[s] || visto[s] || !puro(s * 4)) continue;
      const regiao = [];
      ini = 0; fim = 0; fila[fim++] = s; visto[s] = 1;
      while (ini < fim) {
        const i = fila[ini++]; regiao.push(i);
        const x = i % w, y = (i / w) | 0;
        const viz = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
        for (const j of viz) {
          if (j < 0 || visto[j] || fundo[j]) continue;
          const o = j * 4;
          const mx = Math.max(data[o], data[o + 1], data[o + 2]), mn = Math.min(data[o], data[o + 1], data[o + 2]);
          if (mn >= 200 && mx - mn <= 22) { visto[j] = 1; fila[fim++] = j; }
        }
      }
      if (regiao.length >= minBuraco) for (const i of regiao) fundo[i] = 1;
    }
  }
  for (let i = 0; i < n; i++) {
    if (!fundo[i]) continue;
    const o = i * 4;
    const mn = Math.min(data[o], data[o + 1], data[o + 2]);
    let a = (255 - mn) / 255;
    if (a < 0.07) a = 0; // ruído de JPEG perto do branco
    a = Math.min(1, a * 1.15) * (data[o + 3] / 255);
    if (a === 0) { data[o + 3] = 0; continue; }
    // "unmultiply" contra branco: cinza claro vira preto translúcido (sombra suave)
    for (let c = 0; c < 3; c++) data[o + c] = Math.max(0, Math.min(255, Math.round((data[o + c] - 255 * (1 - a)) / a)));
    data[o + 3] = Math.round(a * 255);
  }
  return data;
}

function bbox(data, w, h, limiar = 12) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > limiar) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

async function carregarSemFundo(arquivo, opcoes = {}) {
  const { data, info } = await sharp(arquivo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  removerFundo(data, info.width, info.height, opcoes);
  return { data, w: info.width, h: info.height };
}

/** Componentes conectados (por alfa) grandes, em ordem de leitura; pequenos são agregados ao maior que os contém. */
function componentes(data, w, h, minFrac = 0.004) {
  const rot = new Int32Array(w * h).fill(-1);
  const comps = [];
  const fila = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (rot[s] !== -1 || data[s * 4 + 3] < 40) continue;
    const id = comps.length;
    let ini = 0, fim = 0, area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    rot[s] = id; fila[fim++] = s;
    while (ini < fim) {
      const i = fila[ini++]; area++;
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (rot[j] === -1 && data[j * 4 + 3] >= 40) { rot[j] = id; fila[fim++] = j; }
      }
    }
    comps.push({ area, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  const grandes = comps.filter((c) => c.area >= minFrac * w * h);
  for (const c of comps) {
    if (grandes.includes(c)) continue;
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    const dono = grandes.find((g) => cx >= g.x - g.w * 0.05 && cx <= g.x + g.w * 1.05 && cy >= g.y - g.h * 0.05 && cy <= g.y + g.h * 0.95);
    if (dono) {
      const nx1 = Math.max(dono.x + dono.w, c.x + c.w), ny1 = Math.max(dono.y + dono.h, c.y + c.h);
      dono.x = Math.min(dono.x, c.x); dono.y = Math.min(dono.y, c.y);
      dono.w = nx1 - dono.x; dono.h = ny1 - dono.y;
    }
  }
  // ordem de leitura: agrupa por linha (centro vertical) e depois x
  grandes.sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const linhas = [];
  for (const g of grandes) {
    const cy = g.y + g.h / 2;
    const l = linhas.find((L) => Math.abs(L.cy - cy) < g.h * 0.5);
    if (l) l.itens.push(g); else linhas.push({ cy, itens: [g] });
  }
  return linhas.flatMap((l) => l.itens.sort((a, b) => a.x - b.x));
}

async function recortar(img, r) {
  return sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } })
    .extract({ left: r.x, top: r.y, width: r.w, height: r.h })
    .png()
    .toBuffer();
}

/** Redimensiona para o tamanho da categoria, ancorado embaixo (ou no centro para ícones). */
async function ajustarTamanho(pngRecortado, cat) {
  const t = manifest.tamanhos[cat];
  const meta = await sharp(pngRecortado).metadata();
  let W = t.largura, H = t.altura;
  if (!H) H = Math.min(t.alturaMax, Math.round((meta.height * W) / meta.width));
  const escala = Math.min(W / meta.width, H / meta.height);
  const w = Math.max(1, Math.round(meta.width * escala)), h = Math.max(1, Math.round(meta.height * escala));
  const redim = await sharp(pngRecortado).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
  const left = Math.round((W - w) / 2);
  const top = t.ancora[1] >= 1 ? H - h : Math.round((H - h) / 2);
  const buf = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: redim, left, top }])
    .png()
    .toBuffer();
  return { buf, w: W, h: H, ancora: t.ancora };
}

function acharArquivo(baseSemExt) {
  for (const e of EXTS) {
    const p = path.join(RAW, baseSemExt + e);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ---------------- principal ----------------

async function main() {
  const prontos = new Map(); // chave -> { buf, w, h, ancora }
  const faltando = [];

  // 1) folhas
  for (const sh of manifest.sheets ?? []) {
    const arq = acharArquivo(sh.arquivo);
    if (!arq) continue;
    const img = await carregarSemFundo(arq);
    const comps = componentes(img.data, img.w, img.h);
    const usados = sh.chaves.filter(Boolean).length;
    if (comps.length < sh.chaves.length) {
      console.warn(`⚠ ${sh.arquivo}: esperava ${sh.chaves.length} itens, achei ${comps.length}. Usando os primeiros.`);
    }
    for (let i = 0; i < sh.chaves.length && i < comps.length; i++) {
      const k = sh.chaves[i];
      if (!k) continue;
      const cfg = ASSETS[k];
      if (!cfg) { console.warn(`⚠ chave ${k} não existe em assets`); continue; }
      prontos.set(k, await ajustarTamanho(await recortar(img, comps[i]), cfg.tamanho));
    }
    console.log(`✓ folha ${sh.arquivo}: ${comps.length} itens detectados, ${usados} usados`);
  }

  // 2) imagens individuais
  for (const [k, cfg] of Object.entries(ASSETS)) {
    if (prontos.has(k)) continue;
    const arq = acharArquivo(k);
    if (!arq) { faltando.push(k); continue; }
    const img = await carregarSemFundo(arq, cfg);
    const cat = cfg.tamanho;
    const r = bbox(img.data, img.w, img.h);
    if (!r) { console.warn(`⚠ ${k}: imagem vazia depois de remover o fundo`); continue; }
    prontos.set(k, await ajustarTamanho(await recortar(img, r), cat));
  }

  // 3) ícone do app (sem remover fundo: recorta o cartão e preenche os cantos)
  if (manifest.appIcon) {
    const arq = acharArquivo(manifest.appIcon.fonte);
    if (arq) {
      const { data, info } = await sharp(arq).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const copia = Buffer.from(data);
      removerFundo(copia, info.width, info.height);
      const r = bbox(copia, info.width, info.height, 200);
      // corta um pouco para dentro para eliminar os cantos arredondados brancos
      const m = Math.round(Math.min(r.w, r.h) * 0.045);
      const icon = await sharp(arq)
        .extract({ left: r.x + m, top: r.y + m, width: r.w - 2 * m, height: r.h - 2 * m })
        .resize(1024, 1024, { fit: 'cover' })
        .flatten({ background: manifest.appIcon.fundo })
        .png()
        .toBuffer();
      for (const s of manifest.appIcon.saidas) {
        const dest = path.join(ROOT, s);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, s.includes('512.png') ? await sharp(icon).resize(512, 512).png().toBuffer() : icon);
      }
      console.log('✓ ícone do app gerado');
    }
  }

  // ícones de interface também saem como PNG avulso (usados direto no HTML)
  const OUT_UI = path.join(ROOT, 'public/assets/ui');
  fs.rmSync(OUT_UI, { recursive: true, force: true });
  fs.mkdirSync(OUT_UI, { recursive: true });
  for (const [k, v] of prontos) if (ASSETS[k]?.tamanho === 'icone') fs.writeFileSync(path.join(OUT_UI, `${k}.png`), v.buf);

  if (DEBUG) {
    fs.mkdirSync(CACHE, { recursive: true });
    for (const [k, v] of prontos) fs.writeFileSync(path.join(CACHE, `${k}.png`), v.buf);
  }

  // 4) atlas
  const { nome, tamanhoMax, padding } = manifest.atlas;
  const packer = new MaxRectsPacker(tamanhoMax, tamanhoMax, padding, { smart: true, pot: false, square: false, allowRotation: false });
  packer.addArray([...prontos].map(([k, v]) => ({ width: v.w, height: v.h, data: { k, ...v } })));
  fs.rmSync(OUT_ATLAS, { recursive: true, force: true });
  fs.mkdirSync(OUT_ATLAS, { recursive: true });
  const textures = [];
  for (let b = 0; b < packer.bins.length; b++) {
    const bin = packer.bins[b];
    const W = Math.ceil(bin.width), H = Math.ceil(bin.height);
    const img = `${nome}-${b}.png`;
    await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(bin.rects.map((r) => ({ input: r.data.buf, left: r.x, top: r.y })))
      .png({ compressionLevel: 9, palette: true, quality: 92, effort: 8, dither: 0.6 })
      .toFile(path.join(OUT_ATLAS, img));
    textures.push({
      image: img,
      format: 'RGBA8888',
      size: { w: W, h: H },
      scale: 1,
      frames: bin.rects.map((r) => ({
        filename: r.data.k,
        rotated: false,
        trimmed: false,
        sourceSize: { w: r.width, h: r.height },
        spriteSourceSize: { x: 0, y: 0, w: r.width, h: r.height },
        frame: { x: r.x, y: r.y, w: r.width, h: r.height },
      })),
    });
  }
  fs.writeFileSync(path.join(OUT_ATLAS, `${nome}.json`), JSON.stringify({ textures }));

  const runtime = {
    gerado: new Date().toISOString(),
    atlas: prontos.size ? `assets/atlas/${nome}.json` : null,
    frames: Object.fromEntries([...prontos].map(([k, v]) => [k, { w: v.w, h: v.h, ancora: v.ancora }])),
    faltando,
  };
  fs.writeFileSync(OUT_RUNTIME, JSON.stringify(runtime, null, 1));
  console.log(`✓ atlas: ${prontos.size} sprites em ${packer.bins.length} textura(s) · faltando (placeholder): ${faltando.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
