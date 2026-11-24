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
