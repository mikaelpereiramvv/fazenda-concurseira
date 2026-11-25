import { ECONOMIA, animal, construcao, cultura, lote } from './economia';
import { novoId } from './datas';
import { nivelDeXp } from './niveis';
import type { AppState, ItemFazenda } from './tipos';

export type Falha = { ok: false; erro: string };
export type Sucesso = { ok: true; state: AppState; mensagem?: string };
export type Resultado = Sucesso | Falha;

const falha = (erro: string): Falha => ({ ok: false, erro });

export function tamanhoLote(state: AppState): number {
  return lote(state.fazenda.lote)?.tamanho ?? 8;
}

export function tamanhoItem(item: Pick<ItemFazenda, 'tipo' | 'ref' | 'rot'>): [number, number] {
  if (item.tipo === 'construcao') {
    const [w, h] = construcao(item.ref)?.tamanho ?? [1, 1];
    return (item.rot ?? 0) % 2 === 1 ? [h, w] : [w, h];
  }
  return [1, 1];
}

/** Quantas rotações um item tem. A cerca tem 3 (duas direções + poste); o resto, 2 (normal e espelhado). */
export function rotacoesDe(ref: string): number {
  return ref === 'cerca' ? 3 : 2;
}

export function proximaRotacao(ref: string, rot = 0): number {
  return (rot + 1) % rotacoesDe(ref);
}

export function girarItem(state: AppState, id: string): Resultado {
  const b = bloqueadoDuranteSessao(state); if (b) return b;
  const it = state.fazenda.itens.find((i) => i.id === id);
  if (!it || it.tipo === 'canteiro') return falha('Esse item não gira.');
  const rot = proximaRotacao(it.ref, it.rot ?? 0);
  const [w, h] = tamanhoItem({ ...it, rot });
  if (it.tipo === 'construcao' && !areaLivre(state, it.x, it.y, w, h, id)) return falha('Não há espaço para girar aqui.');
  const itens = state.fazenda.itens.map((i) => (i.id === id ? { ...i, rot } : i));
  return { ok: true, state: { ...state, fazenda: { ...state.fazenda, itens } } };
}

function ocupa(item: ItemFazenda, x: number, y: number): boolean {
  const [w, h] = tamanhoItem(item);
  return x >= item.x && x < item.x + w && y >= item.y && y < item.y + h;
}

export function itemEm(state: AppState, x: number, y: number): ItemFazenda | undefined {
  // animais andam livres; não bloqueiam o grid
  return state.fazenda.itens.find((i) => i.tipo !== 'animal' && ocupa(i, x, y));
}

export function areaLivre(state: AppState, x: number, y: number, w: number, h: number, ignorarId?: string): boolean {
  const n = tamanhoLote(state);
  if (x < 0 || y < 0 || x + w > n || y + h > n) return false;
  for (let i = x; i < x + w; i++)
    for (let j = y; j < y + h; j++) {
      const it = itemEm(state, i, j);
      if (it && it.id !== ignorarId) {
        const c = it.tipo === 'construcao' ? construcao(it.ref) : undefined;
        if (!c?.chao) return false;
      }
    }
  return true;
}

function cobrar(state: AppState, valor: number, motivo: string): AppState | null {
  if (state.jogador.moedas < valor) return null;
  return {
    ...state,
    jogador: { ...state.jogador, moedas: state.jogador.moedas - valor },
    transacoes: [...state.transacoes, { id: novoId(), em: new Date().toISOString(), delta: -valor, motivo }],
  };
}

function creditar(state: AppState, valor: number, motivo: string): AppState {
  return {
    ...state,
    jogador: { ...state.jogador, moedas: state.jogador.moedas + valor },
    transacoes: [...state.transacoes, { id: novoId(), em: new Date().toISOString(), delta: valor, motivo }],
  };
}

const nivelAtual = (s: AppState) => nivelDeXp(s.jogador.xp).nivel;
const contar = (s: AppState, tipo: string, ref: string) => s.fazenda.itens.filter((i) => i.tipo === tipo && i.ref === ref).length;

export function bloqueadoDuranteSessao(state: AppState): Falha | null {
  return state.sessaoAtiva ? falha('A fazenda fica trancada durante a sessão de estudo. Foco! 📚') : null;
}

// ---------- Canteiros e culturas ----------

export function precoProximoCanteiro(state: AppState): number {
  const atuais = contar(state, 'canteiro', 'canteiro');
  const casa = state.fazenda.itens.find((i) => i.ref === 'casa');
  const gratis = ECONOMIA.terreno.canteirosIniciais + ((casa?.nivel ?? 1) - 1);
  return atuais < gratis ? 0 : ECONOMIA.terreno.precoCanteiroPorExistente * atuais;
}

export function comprarCanteiro(state: AppState, x: number, y: number): Resultado {
  const b = bloqueadoDuranteSessao(state); if (b) return b;
  if (!areaLivre(state, x, y, 1, 1)) return falha('Esse espaço não está livre.');
  const preco = precoProximoCanteiro(state);
  const pago = cobrar(state, preco, 'Novo canteiro');
  if (!pago) return falha(`Faltam moedas (${preco}).`);
  const item: ItemFazenda = { id: novoId(), tipo: 'canteiro', ref: 'canteiro', x, y };
  return { ok: true, state: { ...pago, fazenda: { ...pago.fazenda, itens: [...pago.fazenda.itens, item] } } };
}

export function plantar(state: AppState, canteiroId: string, culturaId: string): Resultado {
  const b = bloqueadoDuranteSessao(state); if (b) return b;
  const c = cultura(culturaId);
  if (!c) return falha('Cultura desconhecida.');
  if (nivelAtual(state) < c.nivel) return falha(`${c.nome} libera no nível ${c.nivel}.`);
  const alvo = state.fazenda.itens.find((i) => i.id === canteiroId && i.tipo === 'canteiro');
  if (!alvo) return falha('Canteiro não encontrado.');
  if (alvo.cultura) return falha('Esse canteiro já está ocupado.');
  const pago = cobrar(state, c.semente, `Semente de ${c.nome.toLowerCase()}`);
  if (!pago) return falha(`Faltam moedas (${c.semente}).`);
  const itens = pago.fazenda.itens.map((i) =>
    i.id === canteiroId ? { ...i, cultura: { id: c.id, minutos: 0, murcha: false, plantadaEm: new Date().toISOString() } } : i,
  );
  return { ok: true, state: { ...pago, fazenda: { ...pago.fazenda, itens } } };
}

/** Estágio visual 1–4 (4 = pronta) ou 'murcho'. */
export function estagioCultura(item: ItemFazenda): 1 | 2 | 3 | 4 | 'murcho' | null {
  if (!item.cultura) return null;
  if (item.cultura.murcha) return 'murcho';
  const c = cultura(item.cultura.id);
  if (!c) return null;
  const f = item.cultura.minutos / c.minutos;
  if (f >= 1) return 4;
  if (f >= 0.6) return 3;
  if (f >= 0.25) return 2;
  return 1;
}

export function bonusVenda(state: AppState, culturaId: string): number {
  let b = 0;
  for (const it of state.fazenda.itens) {
    if (it.tipo !== 'construcao') continue;
    b += construcao(it.ref)?.bonusVenda?.[culturaId] ?? 0;
  }
  return b;
}

export function colher(state: AppState, canteiroId: string): Resultado {
  const b = bloqueadoDuranteSessao(state); if (b) return b;
  const alvo = state.fazenda.itens.find((i) => i.id === canteiroId);
  if (!alvo?.cultura) return falha('Nada para colher.');
  const c = cultura(alvo.cultura.id)!;
  const limpar = (s: AppState): AppState => ({
    ...s,
    fazenda: { ...s.fazenda, itens: s.fazenda.itens.map((i) => (i.id === canteiroId ? { ...i, cultura: undefined } : i)) },
  });
  if (alvo.cultura.murcha) return { ok: true, state: limpar(state), mensagem: 'Canteiro limpo.' };
  if (estagioCultura(alvo) !== 4) return falha('Ainda não está pronto. Estude mais um pouco! 🌱');
  const valor = Math.round(c.venda * (1 + bonusVenda(state, c.id)));
  return { ok: true, state: creditar(limpar(state), valor, `Colheita de ${c.nome.toLowerCase()}`), mensagem: `+${valor} moedas` };
}

/** Soma minutos de estudo em todas as culturas vivas. */
export function crescerCulturas(state: AppState, minutos: number): { state: AppState; prontas: number } {
  let prontas = 0;
  const itens = state.fazenda.itens.map((i) => {
    if (!i.cultura || i.cultura.murcha) return i;
    const c = cultura(i.cultura.id);
    if (!c) return i;
    const antes = i.cultura.minutos;
    const depois = Math.min(c.minutos, antes + minutos);
    if (antes < c.minutos && depois >= c.minutos) prontas++;
    return { ...i, cultura: { ...i.cultura, minutos: depois } };
  });
  return { state: { ...state, fazenda: { ...state.fazenda, itens } }, prontas };
}

/** Punição por sair do app: culturas em crescimento murcham (as prontas são preservadas). */
export function murcharCulturas(state: AppState): { state: AppState; murchas: number } {
  let murchas = 0;
  const itens = state.fazenda.itens.map((i) => {
    if (!i.cultura || i.cultura.murcha) return i;
    const c = cultura(i.cultura.id);
    if (c && i.cultura.minutos >= c.minutos) return i;
    murchas++;
    return { ...i, cultura: { ...i.cultura, murcha: true } };
  });
  return { state: { ...state, fazenda: { ...state.fazenda, itens } }, murchas };
}

// ---------- Loja: construções e animais ----------

export function comprarConstrucao(state: AppState, ref: string, x: number, y: number, rot = 0): Resultado {
  const b = bloqueadoDuranteSessao(state); if (b) return b;
  const c = construcao(ref);
  if (!c) return falha('Item desconhecido.');
  if (nivelAtual(state) < c.nivel) return falha(`${c.nome} libera no nível ${c.nivel}.`);
  if (c.unica && contar(state, 'construcao', ref) > 0) return falha(`Você já tem ${c.nome.toLowerCase()}.`);
  const [cw, ch] = tamanhoItem({ tipo: 'construcao', ref, rot });
  if (!areaLivre(state, x, y, cw, ch)) return falha('Não cabe aí.');
  const pago = cobrar(state, c.preco, c.nome);
  if (!pago) return falha(`Faltam moedas (${c.preco}).`);
  const item: ItemFazenda = { id: novoId(), tipo: 'construcao', ref, x, y, nivel: 1, ...(rot ? { rot } : {}) };
  return { ok: true, state: { ...pago, fazenda: { ...pago.fazenda, itens: [...pago.fazenda.itens, item] } } };
}

export function vagasAnimal(state: AppState, ref: string): { podeComprar: boolean; motivo?: string } {
  const a = animal(ref);
  if (!a) return { podeComprar: false, motivo: 'Animal desconhecido.' };
  if (nivelAtual(state) < a.nivel) return { podeComprar: false, motivo: `Libera no nível ${a.nivel}.` };
  const atuais = contar(state, 'animal', ref);
  if (a.max && atuais >= a.max) return { podeComprar: false, motivo: 'Você já tem esse animal.' };
  if (a.requer) {
    const abrigos = contar(state, 'construcao', a.requer);
    const nome = construcao(a.requer)?.nome ?? a.requer;
    if (abrigos === 0) return { podeComprar: false, motivo: `Precisa de: ${nome}.` };
    if (atuais >= abrigos * (a.capacidadePorAbrigo ?? 99)) return { podeComprar: false, motivo: `Sem vaga. Compre outro(a) ${nome.toLowerCase()}.` };
  }
  return { podeComprar: true };
}

export function comprarAnimal(state: AppState, ref: string): Resultado {
  const b = bloqueadoDuranteSessao(state); if (b) return b;
  const a = animal(ref)!;
  const v = vagasAnimal(state, ref);
  if (!v.podeComprar) return falha(v.motivo!);
  const pago = cobrar(state, a.preco, a.nome);
  if (!pago) return falha(`Faltam moedas (${a.preco}).`);
  const abrigo = a.requer ? state.fazenda.itens.find((i) => i.ref === a.requer) : undefined;
  const n = tamanhoLote(state);
  const item: ItemFazenda = {
    id: novoId(), tipo: 'animal', ref,
    x: abrigo ? abrigo.x : Math.floor(n / 2), y: abrigo ? abrigo.y + 1 : Math.floor(n / 2),
  };
  return { ok: true, state: { ...pago, fazenda: { ...pago.fazenda, itens: [...pago.fazenda.itens, item] } } };
}

export function moverItem(state: AppState, id: string, x: number, y: number): Resultado {
  const b = bloqueadoDuranteSessao(state); if (b) return b;
  const it = state.fazenda.itens.find((i) => i.id === id);
  if (!it) return falha('Item não encontrado.');
  const [w, h] = tamanhoItem(it);
  if (it.tipo !== 'animal' && !areaLivre(state, x, y, w, h, id)) return falha('Não cabe aí.');
  const itens = state.fazenda.itens.map((i) => (i.id === id ? { ...i, x, y } : i));
  return { ok: true, state: { ...state, fazenda: { ...state.fazenda, itens } } };
}

export function expandirLote(state: AppState): Resultado {
  const b = bloqueadoDuranteSessao(state); if (b) return b;
  const prox = lote(state.fazenda.lote + 1);
  if (!prox) return falha('Você já tem o maior terreno.');
  if (prox.nivel && nivelAtual(state) < prox.nivel) return falha(`Libera no nível ${prox.nivel}.`);
  const pago = cobrar(state, prox.preco, `Terreno ${prox.tamanho}×${prox.tamanho}`);
  if (!pago) return falha(`Faltam moedas (${prox.preco}).`);
  return { ok: true, state: { ...pago, fazenda: { ...pago.fazenda, lote: prox.lote } } };
}

export function comprarCongelador(state: AppState): Resultado {
  const o = ECONOMIA.ofensiva;
  if (state.jogador.congeladores >= o.congeladorEstoqueMax) return falha(`Máximo de ${o.congeladorEstoqueMax} em estoque.`);
  const pago = cobrar(state, o.congeladorPreco, 'Congelador de ofensiva');
  if (!pago) return falha(`Faltam moedas (${o.congeladorPreco}).`);
  return { ok: true, state: { ...pago, jogador: { ...pago.jogador, congeladores: pago.jogador.congeladores + 1 } } };
}

export function melhorarCasa(state: AppState): Resultado {
  const b = bloqueadoDuranteSessao(state); if (b) return b;
  const casa = state.fazenda.itens.find((i) => i.ref === 'casa');
  const cfg = construcao('casa');
  if (!casa || !cfg?.upgrades) return falha('Casa não encontrada.');
  const nivel = casa.nivel ?? 1;
  const preco = cfg.upgrades[nivel - 1];
  if (preco === undefined) return falha('A casa já está no nível máximo.');
  const pago = cobrar(state, preco, `Reforma da casa (nível ${nivel + 1})`);
  if (!pago) return falha(`Faltam moedas (${preco}).`);
  const itens = pago.fazenda.itens.map((i) => (i.id === casa.id ? { ...i, nivel: nivel + 1 } : i));
  return { ok: true, state: { ...pago, fazenda: { ...pago.fazenda, itens } }, mensagem: 'Casa reformada! +1 canteiro grátis disponível.' };
}

export { creditar };
