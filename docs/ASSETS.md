# Pipeline de assets (Gemini → jogo)

```bash
npm run assets           # processa tudo e gera public/assets/atlas/farm.json + farm-N.png
npm run assets -- --debug  # também salva cada sprite em assets/.cache/out para conferir
```

## Onde colocar as imagens

- **Uma imagem por item:** `assets/raw/<chave>.jpg` (ou `.png`/`.webp`). A chave vem de `assets/manifest.json`, por exemplo `crop_milho_stage2.jpg` ou `bld_casa_lv1.png`.
- **Folha com vários itens** (ex.: os 5 estágios do café lado a lado): `assets/raw/sheets/<nome>.jpg` + uma entrada em `sheets` no manifest com as chaves **em ordem de leitura** (esquerda→direita, cima→baixo). Use `null` para pular um item. Os rótulos de texto abaixo dos itens são ignorados automaticamente.

## O que o script faz

1. **Remove o fundo branco** por preenchimento a partir das bordas. O branco *dentro* do desenho (olhos, paredes creme) é mantido; buracos de branco puro fechados pelo desenho (entre as tábuas da cerca, entre as folhas) viram transparentes. Para manter o branco interno de um item, use no manifest: `"chave": { "tamanho": "animal_p", "manterBrancoInterno": true }` (ex.: uma galinha branca).
2. **Sombras cinza** viram sombra preta semitransparente.
3. **Recorta e redimensiona** para a categoria, ancorando na base:

| Categoria | Tamanho (px @3x) | Uso |
| --- | --- | --- |
| `bloco` | 384 de largura, altura proporcional (máx. 576) | tiles, canteiros, plantações (bloco de terra isométrico) |
| `obj1` | 384 × 384 | construções 1×1, cerca |
| `obj2` | 768 × 768 | construções 2×2 (casa, lago, curral) |
| `animal_p` / `animal_m` / `animal_g` | 192 / 288 / 384 | animais |
| `icone` | 96 × 96 | interface (também sai avulso em `public/assets/ui`) |

4. **Gera o multiatlas** do Phaser (2048×2048, PNG com paleta: ~1,5 MB para 36 sprites).
5. **Ícone do app**: `assets/raw/app_icon.jpg` → 1024×1024 sem transparência para o Xcode + 512 para o PWA.

Chaves sem imagem viram **placeholders** coloridos com o nome do asset. Estágios de plantação faltando usam o estágio mais próximo que existir.

## Pedidos ao Gemini que funcionam melhor

- **Uma imagem por pedido**, 1024×1024, fundo **branco puro**, sem texto, sem moldura e sem sombra no chão (a sombra fica cinza clara e o script a converte, mas o resultado é mais limpo sem ela).
- **Plantações:** sempre o mesmo bloco de terra roxa **quadrado** visto em isométrico 2:1. Os primeiros estágios do feijão vieram com o bloco retangular; vale pedir de novo com "base quadrada idêntica ao estágio 4".
- **Folhas com vários itens** funcionam, mas cada item fica pequeno. A folha do café (512 px para 5 itens) ficou serrilhada; peça cada estágio separado em 1024.
- **Ícones de interface:** os cartões creme ficaram bonitos e foram mantidos. A folha veio com rótulos trocados ("Ofensiva" e "Relógio" em cadeados); o script usa a ordem do manifest, não os rótulos.

## Status atual (24/11/2026)

Prontos: 6 tiles e canteiro, milho (1–4 + murcho), feijão (1–4 + murcho), mandioca (1–4 + murcho), café (1–4 + murcho, baixa resolução), casa nível 1, cerca (2 direções + poste), 5 ícones e o ícone do app.

Faltando (placeholder): abóbora, banana, cana, laranja e açaí; casa níveis 2–4; galinheiro, ipê (verde e florido), lago, casa de farinha, curral, paiol, terreiro; todos os animais.
