#!/usr/bin/env python3
"""Renderiza modelos 3D (CC0) como sprites isométricos e grava em assets/raw.

Uso: python3 scripts/assets/render3d/render.py scripts/assets/render3d/jobs.json [--so chave1,chave2]
Precisa de: python playwright + Chrome. Serve a raiz do repositório num servidor local temporário.
Cada job: {"saida": "assets/raw/x.png", "pecas": [...], "base": "canteiro" (opcional), ...}
"""
import asyncio, base64, io, json, os, sys, threading, http.server, functools
from playwright.async_api import async_playwright
from PIL import Image, ImageFilter, ImageChops

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
PORTA = 8765

def servir():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=RAIZ)
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORTA), h)
    srv.RequestHandlerClass.log_message = lambda *a: None
    threading.Thread(target=srv.serve_forever, daemon=True).start()

def contorno(img, px=7, cor=(74, 44, 26)):
    """Contorno marrom-escuro na silhueta (estilo das ilustrações do Gemini)."""
    a = img.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    grosso = a.filter(ImageFilter.MaxFilter(px * 2 + 1))
    borda = Image.new('RGBA', img.size, cor + (0,))
    borda.putalpha(grosso)
    out = borda.copy()
    out.alpha_composite(img)
    return out

def recortar(img):
    bb = img.getbbox()
    return img.crop(bb) if bb else img

def compor_canteiro(planta, base_path, largura_rel):
    """Planta (RGBA, já recortada no enquadramento do grupo) sobre o bloco de terra do canteiro."""
    base = Image.open(base_path).convert('RGBA')
    W, H = base.size
    topo = base.getbbox()[1]
    centro_topo = topo + W // 4          # centro do losango 2:1 do topo do bloco
    alvo_w = int(W * largura_rel)
    esc = alvo_w / planta.width
    planta = planta.resize((alvo_w, max(1, int(planta.height * esc))), Image.LANCZOS)
    x = (W - planta.width) // 2
    y = centro_topo + int(W * 0.16) - planta.height
    pad_top = max(0, -y)
    tela = Image.new('RGBA', (W, H + pad_top), (0, 0, 0, 0))
    tela.alpha_composite(base, (0, pad_top))
    tela.alpha_composite(planta, (x, y + pad_top))
    return tela

async def main():
    jobs = json.load(open(sys.argv[1]))
    so = None
    if '--so' in sys.argv:
        so = set(sys.argv[sys.argv.index('--so') + 1].split(','))
    servir()
    async with async_playwright() as p:
        nav = await p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'),
                                      args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
        pg = await nav.new_page(viewport={'width': 1024, 'height': 1024})
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        await pg.goto(f'http://127.0.0.1:{PORTA}/scripts/assets/render3d/render.html')
        await pg.wait_for_function('window.pronto === true', timeout=30000)
        renders = []
        arq_gerados = os.path.join(RAIZ, 'assets/3d/gerados.json')
        gerados = json.load(open(arq_gerados)) if os.path.exists(arq_gerados) else {}
        for job in jobs:
            chave = os.path.splitext(os.path.basename(job['saida']))[0]
            if so and chave not in so:
                continue
            url = await pg.evaluate('(j) => window.render(j)', job)
            img = Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).convert('RGBA')
            pad = Image.new('RGBA', (img.width + 40, img.height + 40), (0, 0, 0, 0)); pad.alpha_composite(img, (20, 20)); img = pad
            img = contorno(img, job.get('contorno', 7))
            renders.append((job, img))
        # grupos (estágios de uma planta): mesmo recorte para todos, assim o crescimento aparece
        caixas = {}
        for job, img in renders:
            g = job.get('grupo')
            if not g: continue
            bb = img.getbbox()
            if not bb: continue
            c = caixas.get(g)
            caixas[g] = bb if not c else (min(c[0], bb[0]), min(c[1], bb[1]), max(c[2], bb[2]), max(c[3], bb[3]))
        for job, img in renders:
            g = job.get('grupo')
            img = img.crop(caixas[g]) if g in caixas else recortar(img)
            if job.get('base'):
                img = compor_canteiro(img, os.path.join(RAIZ, job['base']), job.get('largura', 0.72))
            destino = os.path.join(RAIZ, job['saida'])
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            img.save(destino)
            import hashlib; gerados[os.path.splitext(os.path.basename(job['saida']))[0]] = hashlib.sha1(open(destino, 'rb').read()).hexdigest()
            print('✓', job['saida'], img.size)
        json.dump(dict(sorted(gerados.items())), open(arq_gerados, 'w'), indent=1)
        if erros:
            print('ERROS:', erros)
        await nav.close()

asyncio.run(main())
