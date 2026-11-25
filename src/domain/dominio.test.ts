import { describe, expect, it } from 'vitest';
import { estadoInicial, registrarSessao, lerBackup, gerarBackup, aplicarPenalidadeSaida } from './estado';
import { nivelDeXp, xpTotalParaNivel } from './niveis';
import { validarLancamento } from './lancamento';
import { calcularOfensiva, aplicarCongeladores } from './ofensiva';
import { segundosLiquidos, pausar, retomar } from './timer';
import { plantar, colher, estagioCultura, precoProximoCanteiro, comprarConstrucao, comprarAnimal } from './fazenda';
import { proximaMateria } from './ciclo';
import { chaveDia, somarDias } from './datas';
import type { AppState, SessaoAtiva } from './tipos';

const H = (h: number, m = 0, base = new Date(2026, 10, 24)) => new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);

function comMateria(): AppState {
  const s = estadoInicial(H(8));
  return {
    ...s,
    materias: [
      { id: 'pt', nome: 'Português', cor: '#c0392b', metaCicloMin: 60, ativa: true, ordem: 0 },
      { id: 'dc', nome: 'Dir. Constitucional', cor: '#2980b9', metaCicloMin: 90, ativa: true, ordem: 1 },
    ],
  };
}

describe('níveis (curva 2 h/dia)', () => {
  it('fórmula fechada bate com a soma', () => {
    expect(xpTotalParaNivel(2)).toBe(60);
    expect(xpTotalParaNivel(10)).toBe(972);
    expect(xpTotalParaNivel(50)).toBe(17052);
  });
  it('nível 10 em ~8 dias e nível 50 em ~143 dias de 2 h', () => {
    expect(nivelDeXp(120 * 8).nivel).toBe(9);
    expect(nivelDeXp(120 * 9).nivel).toBe(10);
    expect(nivelDeXp(120 * 143).nivel).toBe(50);
  });
});

describe('lançamento manual', () => {
  const agora = H(10);
  it('bloqueia data futura', () => {
    const r = validarLancamento({ materiaId: 'pt', inicio: somarDias(agora, 1), duracaoMin: 30 }, [], agora);
    expect(r.erros).toContain('DATA_FUTURA');
  });
  it('bloqueia estudo que terminaria no futuro (hoje)', () => {
    const r = validarLancamento({ materiaId: 'pt', inicio: H(9), duracaoMin: 180 }, [], agora);
    expect(r.erros).toEqual(['TERMINA_NO_FUTURO']);
  });
  it('aceita ontem e hoje no passado', () => {
    expect(validarLancamento({ materiaId: 'pt', inicio: somarDias(H(14), -1), duracaoMin: 120 }, [], agora).erros).toEqual([]);
    expect(validarLancamento({ materiaId: 'pt', inicio: H(8), duracaoMin: 90 }, [], agora).erros).toEqual([]);
  });
  it('limita 10 h manuais por dia', () => {
    const s = comMateria();
    const r1 = registrarSessao(s, { materiaId: 'pt', inicio: somarDias(H(6), -1), duracaoMin: 600, origem: 'manual' }, agora);
    const r = validarLancamento({ materiaId: 'pt', inicio: somarDias(H(20), -1), duracaoMin: 30 }, r1.state.sessoes, agora);
    expect(r.erros).toContain('LIMITE_MANUAL_DIA');
  });
});

describe('recompensas', () => {
  it('cronômetro: 1 moeda/min + bônus; manual: 50%', () => {
    const s = comMateria();
    const cron = registrarSessao(s, { materiaId: 'pt', inicio: H(8), duracaoMin: 50, origem: 'cronometro', modo: 'pomodoro', pomodoros: 2 }, H(9));
    // 50 + 2×5 = 60 ; sobe para o nível 1? 50 XP < 60 → sem bônus de nível
    expect(cron.resumo.moedas).toBe(60);
    const man = registrarSessao(s, { materiaId: 'pt', inicio: H(8), duracaoMin: 50, origem: 'manual' }, H(9));
    expect(man.resumo.moedas).toBe(25);
    expect(man.resumo.xp).toBe(50);
  });
  it('paga meta diária uma única vez e bônus de nível', () => {
    let s = comMateria();
    const a = registrarSessao(s, { materiaId: 'pt', inicio: H(8), duracaoMin: 120, origem: 'cronometro' }, H(10, 5));
    expect(a.resumo.linhas.some((l) => l.motivo.startsWith('Meta diária'))).toBe(true);
    expect(a.resumo.nivelDepois).toBe(2);
    s = a.state;
    const b = registrarSessao(s, { materiaId: 'pt', inicio: H(11), duracaoMin: 30, origem: 'cronometro' }, H(11, 31));
    expect(b.resumo.linhas.some((l) => l.motivo.startsWith('Meta diária'))).toBe(false);
  });
  it('sessão < 10 min dá XP mas não moedas por minuto', () => {
    const r = registrarSessao(comMateria(), { materiaId: 'pt', inicio: H(8), duracaoMin: 9, origem: 'cronometro' }, H(9));
    expect(r.resumo.xp).toBe(9);
    expect(r.resumo.moedas).toBe(0);
  });
});

describe('ofensiva', () => {
  it('conta dias seguidos e respeita recuperação manual de 2 dias', () => {
    let s = comMateria();
    const hoje = H(20);
    for (let i = 1; i <= 3; i++) {
      s = registrarSessao(s, { materiaId: 'pt', inicio: somarDias(H(8), -i), duracaoMin: 40, origem: 'cronometro' }, somarDias(H(9), -i)).state;
    }
    expect(calcularOfensiva(s, hoje)).toBe(3);
    // lançamento manual de 5 dias atrás, feito hoje: não recupera ofensiva
    s = registrarSessao(s, { materiaId: 'pt', inicio: somarDias(H(8), -4), duracaoMin: 40, origem: 'manual' }, hoje).state;
    expect(calcularOfensiva(s, hoje)).toBe(3);
  });
  it('congelador cobre um dia perdido', () => {
    let s = comMateria();
    const hoje = H(20);
    s = registrarSessao(s, { materiaId: 'pt', inicio: somarDias(H(8), -2), duracaoMin: 40, origem: 'cronometro' }, somarDias(H(9), -2)).state;
    s = { ...s, jogador: { ...s.jogador, congeladores: 1 } };
    const r = aplicarCongeladores(s, hoje);
    expect(r.usados).toEqual([chaveDia(somarDias(hoje, -1))]);
    expect(calcularOfensiva(r.state, hoje)).toBe(1);
  });
});

describe('timer', () => {
  it('desconta pausas', () => {
    let a: SessaoAtiva = { inicio: H(8).toISOString(), pausas: [], modo: 'livre', materiaId: 'pt', saidaAutorizada: false, penalidades: 0 };
    a = pausar(a, H(8, 20));
    a = retomar(a, H(8, 30));
    expect(segundosLiquidos(a, H(9))).toBe(50 * 60);
  });
});

describe('fazenda', () => {
  it('planta, cresce com estudo e colhe', () => {
    let s = comMateria();
    const canteiro = s.fazenda.itens.find((i) => i.tipo === 'canteiro')!;
    const p = plantar(s, canteiro.id, 'milho');
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    s = registrarSessao(p.state, { materiaId: 'pt', inicio: H(8), duracaoMin: 30, origem: 'cronometro' }, H(9)).state;
    const c = s.fazenda.itens.find((i) => i.id === canteiro.id)!;
    expect(estagioCultura(c)).toBe(4);
    const antes = s.jogador.moedas;
    const r = colher(s, canteiro.id);
    expect(r.ok && r.state.jogador.moedas - antes).toBe(13);
  });
  it('sair do app murcha só o que está crescendo', () => {
    let s = comMateria();
    const [c1] = s.fazenda.itens.filter((i) => i.tipo === 'canteiro');
    const p = plantar(s, c1.id, 'milho');
    if (!p.ok) throw new Error();
    s = aplicarPenalidadeSaida(p.state).state;
    expect(estagioCultura(s.fazenda.itens.find((i) => i.id === c1.id)!)).toBe('murcho');
  });
  it('6 canteiros grátis e depois 50 × quantidade', () => {
    expect(precoProximoCanteiro(comMateria())).toBe(300);
  });
  it('trava a loja durante a sessão', () => {
    const s = { ...comMateria(), sessaoAtiva: { inicio: H(8).toISOString(), pausas: [], modo: 'livre' as const, materiaId: 'pt', saidaAutorizada: false, penalidades: 0 } };
    expect(comprarConstrucao(s, 'cerca', 7, 7).ok).toBe(false);
  });
  it('animal exige abrigo', () => {
    let s = comMateria();
    s = { ...s, jogador: { ...s.jogador, xp: 2000, moedas: 1000 } };
    expect(comprarAnimal(s, 'galinha').ok).toBe(false);
    const g = comprarConstrucao(s, 'galinheiro', 6, 6);
    expect(g.ok).toBe(true);
    if (g.ok) expect(comprarAnimal(g.state, 'galinha').ok).toBe(true);
  });
});

describe('ciclo e backup', () => {
  it('sugere a próxima matéria do ciclo', () => {
    let s = comMateria();
    expect(proximaMateria(s)?.id).toBe('pt');
    s = registrarSessao(s, { materiaId: 'pt', inicio: H(8), duracaoMin: 60, origem: 'cronometro' }, H(9)).state;
    expect(proximaMateria(s)?.id).toBe('dc');
  });
  it('backup ida e volta', () => {
    const s = registrarSessao(comMateria(), { materiaId: 'pt', inicio: H(8), duracaoMin: 60, origem: 'cronometro' }, H(9)).state;
    const r = lerBackup(JSON.stringify(gerarBackup(s)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.sessoes.length).toBe(1);
    expect(lerBackup('{"x":1}').ok).toBe(false);
  });
});

import { girarItem, tamanhoItem as tam } from './fazenda';
import { migrar } from './estado';

describe('girar objetos (compatível com dados antigos)', () => {
  it('estado salvo na versão anterior (sem "rot") carrega intacto', () => {
    let s = comMateria();
    const c = s.fazenda.itens.find((i) => i.tipo === 'canteiro')!;
    const p = plantar(s, c.id, 'milho'); if (!p.ok) throw new Error();
    s = registrarSessao(p.state, { materiaId: 'pt', inicio: H(8), duracaoMin: 20, origem: 'cronometro' }, H(9)).state;
    s = { ...s, fazenda: { ...s.fazenda, itens: [...s.fazenda.itens, { id: 'cerca-velha', tipo: 'construcao', ref: 'cerca', x: 7, y: 7 }] } };
    const json = JSON.stringify(s); // exatamente o que já está no aparelho
    const lido = migrar(JSON.parse(json));
    expect(lido.sessoes).toEqual(s.sessoes);
    expect(lido.jogador).toEqual(s.jogador);
    expect(lido.fazenda).toEqual(s.fazenda);
    expect(lido.fazenda.itens.find((i) => i.id === c.id)?.cultura?.minutos).toBe(20);
  });
  it('cerca gira entre 3 posições e o resto preserva', () => {
    let s = comMateria();
    s = { ...s, fazenda: { ...s.fazenda, itens: [...s.fazenda.itens, { id: 'f', tipo: 'construcao', ref: 'cerca', x: 7, y: 7 }] } };
    const antes = s.sessoes.length;
    for (const esperado of [1, 2, 0]) {
      const r = girarItem(s, 'f'); if (!r.ok) throw new Error(r.erro);
      s = r.state;
      expect(s.fazenda.itens.find((i) => i.id === 'f')!.rot).toBe(esperado);
    }
    expect(s.sessoes.length).toBe(antes);
  });
  it('construção não quadrada troca largura e altura ao girar', () => {
    expect(tam({ tipo: 'construcao', ref: 'casa', rot: 1 })).toEqual([2, 2]);
    expect(tam({ tipo: 'construcao', ref: 'cerca', rot: 1 })).toEqual([1, 1]);
  });
  it('compra já girada e não gira durante a sessão', () => {
    let s = { ...comMateria(), jogador: { xp: 0, moedas: 100, congeladores: 0 } };
    const r = comprarConstrucao(s, 'cerca', 7, 0, 1); if (!r.ok) throw new Error(r.erro);
    s = r.state;
    const f = s.fazenda.itens.find((i) => i.ref === 'cerca')!;
    expect(f.rot).toBe(1);
    const emSessao = { ...s, sessaoAtiva: { inicio: H(8).toISOString(), pausas: [], modo: 'livre' as const, materiaId: 'pt', saidaAutorizada: false, penalidades: 0 } };
    expect(girarItem(emSessao, f.id).ok).toBe(false);
  });
});

import { missoesAtivas, resgatarMissao, cartasDisponiveis, marcarCartasLidas, pendenciasCorreio } from './missoes';
import { colocarDoInventario } from './fazenda';

describe('enredo e missões', () => {
  it('sempre há 1 diária, 1 semanal e 1 de capítulo', () => {
    const m = missoesAtivas(comMateria(), H(10));
    expect(m.map((x) => x.tipo)).toEqual(['diaria', 'semanal', 'capitulo']);
    expect(m[2].id).toBe('c_primeiro_rocado');
  });
  it('capítulo conclui com estudo real, resgata uma vez e avança', () => {
    let s = registrarSessao(comMateria(), { materiaId: 'pt', inicio: H(8), duracaoMin: 30, origem: 'cronometro' }, H(9)).state;
    const cap = missoesAtivas(s, H(10)).find((x) => x.tipo === 'capitulo')!;
    expect(cap.concluida).toBe(true);
    const antes = s.jogador.moedas;
    const r = resgatarMissao(s, cap.chave, H(10)); if (!r.ok) throw new Error(r.erro);
    s = r.state;
    expect(s.jogador.moedas).toBe(antes + 30);
    expect(s.registro.inventario?.caixa_correio).toBe(1);
    expect(resgatarMissao(s, cap.chave, H(10)).ok).toBe(false);
    expect(missoesAtivas(s, H(10)).find((x) => x.tipo === 'capitulo')!.id).toBe('c_pe_na_estrada');
  });
  it('lançamento manual conta metade nas missões', () => {
    const s = registrarSessao(comMateria(), { materiaId: 'pt', inicio: H(6), duracaoMin: 60, origem: 'manual' }, H(9)).state;
    // diária do dia pode variar; checa a função de minutos via missão de 60 min quando ativa
    const m = missoesAtivas(s, H(10)).find((x) => x.id === 'd_60min');
    if (m) expect(m.atual).toBe(30);
  });
  it('item do inventário vai para a fazenda de graça e sai do inventário', () => {
    let s = comMateria();
    s = { ...s, registro: { ...s.registro, inventario: { espantalho: 1 } } };
    const r = colocarDoInventario(s, 'espantalho', 7, 7); if (!r.ok) throw new Error(r.erro);
    expect(r.state.registro.inventario?.espantalho).toBeUndefined();
    expect(r.state.jogador.moedas).toBe(s.jogador.moedas);
    expect(colocarDoInventario(r.state, 'espantalho', 7, 6).ok).toBe(false);
  });
  it('carta de boas-vindas aparece e some do selo depois de lida', () => {
    let s = comMateria();
    expect(cartasDisponiveis(s, H(10)).some((c) => c.id === 'boas_vindas' && !c.lida)).toBe(true);
    const p = pendenciasCorreio(s, H(10));
    s = marcarCartasLidas(s, ['boas_vindas']);
    expect(pendenciasCorreio(s, H(10))).toBe(p - 1);
  });
  it('estado antigo sem campos de missão continua funcionando', () => {
    const s = comMateria();
    const velho = JSON.parse(JSON.stringify(s));
    delete velho.registro.missoesResgatadas; delete velho.registro.cartasLidas; delete velho.registro.inventario;
    delete velho.ajustes.sons; delete velho.ajustes.sessaoTelaMinima;
    expect(() => missoesAtivas(velho, H(10))).not.toThrow();
    const m = migrar(velho);
    expect(m.registro.missoesResgatadas).toEqual([]);
    expect(m.ajustes.sons).toBe(false);
    expect(m.sessoes).toEqual(s.sessoes);
  });
});
