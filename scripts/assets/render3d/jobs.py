#!/usr/bin/env python3
"""Gera jobs.json: o que renderizar a partir de assets/3d e para qual chave do manifest.

Regra: só preenche chaves que AINDA NÃO têm arte em assets/raw (nunca substitui ilustração existente),
a menos que rode com --forcar.
"""
import json, os, sys, glob
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
U = '../../../assets/3d/'
FORCAR = '--forcar' in sys.argv

GERADOS = os.path.join(RAIZ, 'assets/3d/gerados.json')
gerados = json.load(open(GERADOS)) if os.path.exists(GERADOS) else {}

def _sha(caminho):
    import hashlib
    return hashlib.sha1(open(caminho, 'rb').read()).hexdigest()

def existe_arte(chave):
    """Há ilustração feita à mão (Gemini/ChatGPT) para a chave? Só conta como 3D se o arquivo
    ainda for byte a byte o que o renderizador gravou."""
    cam = os.path.join(RAIZ, 'assets/raw', chave + '.png')
    if chave in gerados and os.path.exists(cam) and _sha(cam) == gerados[chave]:
        return False
    return any(os.path.splitext(os.path.basename(f))[0].lower().split('.')[0] == chave.lower()
               for f in glob.glob(os.path.join(RAIZ, 'assets/raw/*')))

AMARELO_IPE = '#f2c230'
VERDES = [['#4c8c2b', AMARELO_IPE], ['#6ab04c', AMARELO_IPE], ['#3e7a24', '#e0a91e'], ['#8bc34a', '#ffd54a'], ['#5aa02c', AMARELO_IPE]]
VERMELHO_MADEIRA = [['#b5231c', '#9b6a3e'], ['#c0392b', '#9b6a3e'], ['#a62b20', '#8a5a33'], ['#d03a2c', '#a8743f']]

def grade(url, n=2, passo=0.9):
    return {'url': url, 'grade': n, 'passo': passo}

# (chave_base, modelo, n×n pés por canteiro, espaçamento relativo, largura no bloco)
CULTURAS = [
    ('cana', 'quaternius_crops/Bamboo', 4, 0.45, 0.80),
    ('acai', 'quaternius_crops/PalmTree', 2, 0.62, 0.84),
    ('laranja', 'quaternius_crops/Orange', 2, 0.72, 0.88),
    ('abobora', 'quaternius_crops/Pumpkin', 2, 0.62, 0.88),
    ('tomate', 'quaternius_crops/Tomato', 3, 0.48, 0.84),
    ('melancia', 'quaternius_crops/Watermelon', 2, 0.66, 0.88),
]

jobs = []
for chave, modelo, n, passo, larg in CULTURAS:
    final = [grade(f'{U}{modelo}_4.obj', n, passo)]
    for st in (1, 2, 3, 4):
        jobs.append({'saida': f'assets/raw/crop_{chave}_stage{st}.png', 'grupo': chave, 'base': 'assets/.cache/out/canteiro_vazio.png',
                     'largura': larg, 'pecas': [grade(f'{U}{modelo}_{st}.obj', n, passo)], 'enquadrar': final})
    jobs.append({'saida': f'assets/raw/crop_{chave}_murcho.png', 'grupo': chave, 'base': 'assets/.cache/out/canteiro_vazio.png',
                 'largura': larg, 'pecas': [grade(f'{U}{modelo}_3.obj', n, passo)], 'enquadrar': final, 'murcho': True})

OBJETOS = [
    ('bld_paiol', 'quaternius_farm/SmallBarn.obj', {'recolorir': VERMELHO_MADEIRA, 'tolRecolor': 0.45}),
    ('bld_poco', 'quaternius_farm/Well.obj', {'recolorir': VERMELHO_MADEIRA, 'tolRecolor': 0.45}),
    ('bld_moinho', 'quaternius_farm/Windmill.obj', {}),
    ('bld_caixa_dagua', 'quaternius_farm/WaterTower.obj', {'recolorir': VERMELHO_MADEIRA, 'tolRecolor': 0.45}),
    ('bld_silo', 'quaternius_farm/Silo.obj', {'recolorir': VERMELHO_MADEIRA, 'tolRecolor': 0.45}),
    ('bld_ipe', 'kaykit_forest/Tree_1_A_Color1.gltf', {}),
    ('bld_ipe_florido', 'kaykit_forest/Tree_1_A_Color1.gltf', {'amarelar': True}),
    ('bld_jabuticabeira', 'kaykit_forest/Tree_3_A_Color1.gltf', {'escurecer': True}),
    ('bld_mangueira', 'kaykit_forest/Tree_2_A_Color1.gltf', {}),
    ('bld_arbusto', 'kaykit_forest/Bush_1_A_Color1.gltf', {}),
    ('bld_moita', 'kaykit_forest/Bush_2_A_Color1.gltf', {}),
    ('bld_pedra', 'kaykit_forest/Rock_1_A_Color1.gltf', {}),
    ('bld_pedras', 'kaykit_forest/Rock_3_A_Color1.gltf', {}),
]
for chave, modelo, extra in OBJETOS:
    jobs.append({'saida': f'assets/raw/{chave}.png', 'pecas': [{'url': U + modelo}], **extra})

antes = len(jobs)
if not FORCAR:
    jobs = [j for j in jobs if not existe_arte(os.path.splitext(os.path.basename(j['saida']))[0])]
json.dump(jobs, open(os.path.join(os.path.dirname(__file__), 'jobs.json'), 'w'), indent=1, ensure_ascii=False)
print(f'{len(jobs)} jobs ({antes - len(jobs)} pulados porque já têm arte)')
