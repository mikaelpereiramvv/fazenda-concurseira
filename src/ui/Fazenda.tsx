import { useEffect, useMemo, useRef, useState } from 'react';
import { FarmView, type FarmViewApi } from '../game/FarmView';
import type { Colocacao } from '../game/FarmScene';
import { atualizar } from '../store';
import { nivelDeXp } from '../domain/niveis';
import { calcularOfensiva } from '../domain/ofensiva';
import { proximaMateria } from '../domain/ciclo';
import { ECONOMIA, cultura } from '../domain/economia';
import {
  colher, colocarDoInventario, comprarCanteiro, comprarConstrucao, estagioCultura, girarItem, moverItem, plantar,
  proximaRotacao, rotacoesDe, tamanhoItem,
} from '../domain/fazenda';
import { pendenciasCorreio } from '../domain/missoes';
import { estaPausada, segundosAteProximoPomodoro, segundosLiquidos, pomodorosCompletos } from '../domain/timer';
import { formatarRelogio } from '../domain/datas';
import type { AppState, ItemFazenda, ModoTimer, ResumoSessao } from '../domain/tipos';
import {
  alternarPausa, cancelarSessao, confirmarConclusao, dadosParaConcluir, iniciarSessao, verificarPausaLonga,
} from '../sessao';
import { tocar } from '../platform/sons';
import { vibrar } from '../platform/nativo';
import { Folha, Icone, Moedas, SeletorBanca, formatoDaBanca, perguntar, useContagem } from './comum';
import { bancaPadrao } from './Hoje';
import { revisoesDoDia } from '../domain/revisoes';
import { proximaProva } from '../domain/desempenho';
import { Correio } from './Correio';

export type PedidoColocacao =
  | { tipo: 'construcao'; ref: string; w: number; h: number; rotulo: string; rot?: number; doInventario?: boolean }
  | { tipo: 'canteiro'; w: 1; h: 1; rotulo: string }
  | { tipo: 'mover'; id: string; w: number; h: number; rotulo: string };

interface Props {
  s: AppState;
  avisar: (t: string) => void;
  colocacao: PedidoColocacao | null;
  setColocacao: (c: PedidoColocacao | null) => void;
  irPara: (aba: 'estudos') => void;
  /** Quantas ervas daninhas mostrar (revisões atrasadas). */
  ervas?: number;
  /** Matéria/assunto pré-selecionados (vindo de "Estudar agora" numa revisão). */
  pre?: { materiaId: string; assuntoId?: string } | null;
}

/** Mede a altura de um elemento (para a câmera não esconder o terreno atrás da interface). */
function useAltura<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [h, setH] = useState(0);
  const obs = useRef<ResizeObserver | null>(null);
  const ref = (el: T | null) => {
    obs.current?.disconnect();
    if (!el) { setH(0); return; }
    obs.current = new ResizeObserver(() => setH(el.getBoundingClientRect().bottom > 0 ? el.offsetHeight : 0));
    obs.current.observe(el);
    setH(el.offsetHeight);
  };
  return [ref, h];
}

export function TelaFazenda({ s, avisar, colocacao, setColocacao, irPara, ervas = 0, pre = null }: Props) {
  const nivel = nivelDeXp(s.jogador.xp);
  const ofensiva = calcularOfensiva(s);
  const [canteiroSel, setCanteiroSel] = useState<ItemFazenda | null>(null);
  const [itemSel, setItemSel] = useState<ItemFazenda | null>(null);
  const [resumo, setResumo] = useState<ResumoSessao | null>(null);
  const [correio, setCorreio] = useState(false);
  const farm = useRef<FarmViewApi>(null);
  const [refHud, hHud] = useAltura<HTMLDivElement>();
  const [refPainel, hPainel] = useAltura<HTMLDivElement>();
  const emSessao = !!s.sessaoAtiva;
  const pend = pendenciasCorreio(s);
  const sons = s.ajustes.sons;

  // moedas do HUD: contagem animada + pulso quando sobem
  const moedasVis = useContagem(s.jogador.moedas, 700);
  const [pulso, setPulso] = useState(false);
  const moedasAnt = useRef(s.jogador.moedas);
  useEffect(() => {
    if (s.jogador.moedas > moedasAnt.current) { setPulso(true); setTimeout(() => setPulso(false), 650); }
    moedasAnt.current = s.jogador.moedas;
  }, [s.jogador.moedas]);

  const aoTocar = (x: number, y: number, item?: ItemFazenda) => {
    if (s.sessaoAtiva) return;
    tocar('clique', sons);
    if (colocacao) {
      const r = colocacao.tipo === 'canteiro' ? comprarCanteiro(s, x, y)
        : colocacao.tipo === 'mover' ? moverItem(s, colocacao.id, x, y)
        : colocacao.doInventario ? colocarDoInventario(s, colocacao.ref, x, y, colocacao.rot ?? 0)
        : comprarConstrucao(s, colocacao.ref, x, y, colocacao.rot ?? 0);
      if (!r.ok) return avisar(r.erro);
      atualizar(() => r.state);
      avisar(colocacao.tipo === 'mover' ? 'Movido!' : `${colocacao.rotulo} colocado! 🎉`);
      const repetir = colocacao.tipo === 'construcao' && !colocacao.doInventario && colocacao.ref === 'cerca';
      if (!repetir) setColocacao(null);
      return;
    }
    if (!item) return;
    if (item.tipo === 'canteiro') {
      if (item.cultura && (item.cultura.murcha || estagioCultura(item) === 4)) {
        const antes = s.jogador.moedas;
        const r = colher(s, item.id);
        if (!r.ok) return avisar(r.erro);
        atualizar(() => r.state);
        const ganho = r.state.jogador.moedas - antes;
        if (ganho > 0) {
          farm.current?.efeitoColheita(item.x, item.y, `+${ganho}`);
          tocar('colheita', sons);
          vibrar();
        }
        return;
      }
      setCanteiroSel(item);
      return;
    }
    setItemSel(item);
  };

  const colocacaoCena: Colocacao | null = useMemo(() => {
    if (!colocacao) return null;
    const [w, h] = colocacao.tipo === 'construcao' ? tamanhoItem({ tipo: 'construcao', ref: colocacao.ref, rot: colocacao.rot }) : [colocacao.w, colocacao.h];
    return { w, h, rotulo: colocacao.rotulo };
  }, [colocacao]);

  const girarColocacao = () => {
    if (colocacao?.tipo !== 'construcao') return;
    setColocacao({ ...colocacao, rot: proximaRotacao(colocacao.ref, colocacao.rot ?? 0) });
  };

  const margens = useMemo(
    () => (emSessao ? { topo: 0, baixo: 0 } : { topo: hHud + 18, baixo: hPainel + 16 }),
    [emSessao, hHud, hPainel],
  );

  return (
    <div className="tela-fazenda">
      <FarmView ref={farm} estado={s} colocacao={colocacaoCena} aoTocarCelula={aoTocar} margens={margens} modoSessao={emSessao} ervas={ervas} />
      {!emSessao && (
        <div className="hud" ref={refHud}>
          <div className="pilula nivel">
            <div className="linha" style={{ justifyContent: 'space-between' }}>
              <span><Icone k="ui_xp" /> Nível {nivel.nivel}</span>
              <span style={{ color: 'var(--suave)', fontWeight: 600, flex: 'none' }}>{nivel.xpNoNivel}/{nivel.xpDoNivel} XP</span>
            </div>
            <div className="barra"><div style={{ width: `${nivel.progresso * 100}%` }} /></div>
          </div>
          <div className={`pilula ${pulso ? 'pulsar' : ''}`}><Moedas v={Math.round(moedasVis)} /></div>
          <div className="pilula"><Icone k="ui_ofensiva" />{ofensiva}</div>
          <button className="pilula correio-btn" aria-label="Correio da fazenda" onClick={() => setCorreio(true)}>
            ✉️{pend > 0 && <span className="selo">{pend}</span>}
          </button>
        </div>
      )}

      {colocacao ? (
        <div className="aviso-colocar" ref={refPainel}>
          <span style={{ flex: 1 }}>
            Toque no terreno para colocar: {colocacao.rotulo}
            {colocacao.tipo === 'construcao' && rotacoesDe(colocacao.ref) > 1 && <small style={{ display: 'block', fontWeight: 500 }}>Posição {(colocacao.rot ?? 0) + 1} de {rotacoesDe(colocacao.ref)}</small>}
          </span>
          {colocacao.tipo === 'construcao' && <button className="btn" style={{ flex: 'none' }} onClick={girarColocacao}>↻ Girar</button>}
          <button className="btn" style={{ flex: 'none' }} onClick={() => setColocacao(null)}>Concluir</button>
        </div>
      ) : !emSessao ? (
        <div className="painel-wrap" ref={refPainel}><PainelIniciar s={s} irPara={irPara} pre={pre} /></div>
      ) : null}

      {emSessao && <SessaoEmAndamento s={s} avisar={avisar} aoConcluir={(r) => { setResumo(r); tocar(r.nivelDepois > r.nivelAntes ? 'nivel' : 'moeda', sons); }} />}
      {resumo && <ResumoFinal resumo={resumo} aoFechar={() => setResumo(null)} />}
      {correio && <Correio s={s} avisar={avisar} aoFechar={() => setCorreio(false)} colocar={(c) => { setCorreio(false); setColocacao(c); }} />}

      {canteiroSel && (
        <Folha titulo={canteiroSel.cultura ? 'Crescendo…' : 'O que plantar?'} aoFechar={() => setCanteiroSel(null)}>
          {canteiroSel.cultura ? (
            <InfoCultura item={canteiroSel} />
          ) : (
            <div className="itens-loja">
              {ECONOMIA.culturas.map((c) => {
                const travado = nivel.nivel < c.nivel;
                return (
                  <button key={c.id} className={`item-loja ${travado ? 'travado' : ''}`} style={{ border: 0, textAlign: 'left' }}
                    onClick={() => {
                      const r = plantar(s, canteiroSel.id, c.id);
                      if (!r.ok) return avisar(r.erro);
                      atualizar(() => r.state);
                      setCanteiroSel(null);
                      tocar('clique', sons);
                      avisar(`${c.nome} plantado! Cresce em ${c.minutos} min de estudo. 🌱`);
                    }}>
                    <span className="nome">{travado && <Icone k="ui_cadeado" />} {c.nome}</span>
                    <span className="desc">{travado ? `Nível ${c.nivel}` : `${c.minutos} min de estudo → vende por ${c.venda}`}</span>
                    <Moedas v={c.semente} />
                  </button>
                );
              })}
            </div>
          )}
        </Folha>
      )}

      {itemSel && (
        <Folha titulo={ECONOMIA.construcoes.find((c) => c.id === itemSel.ref)?.nome ?? ECONOMIA.animais.find((a) => a.id === itemSel.ref)?.nome ?? 'Item'} aoFechar={() => setItemSel(null)}>
          <div className="linha">
            <button className="btn grande" onClick={() => {
              const r = girarItem(s, itemSel.id);
              if (!r.ok) return avisar(r.erro);
              atualizar(() => r.state);
              setItemSel(r.state.fazenda.itens.find((i) => i.id === itemSel.id) ?? null);
            }}>↻ Girar</button>
            <button className="btn grande" onClick={() => {
              const [w, h] = tamanhoItem(itemSel);
              setColocacao({ tipo: 'mover', id: itemSel.id, w, h, rotulo: 'novo lugar' });
              setItemSel(null);
            }}>Mover</button>
          </div>
        </Folha>
      )}
    </div>
  );
}

function InfoCultura({ item }: { item: ItemFazenda }) {
  const c = cultura(item.cultura!.id)!;
  const falta = Math.max(0, c.minutos - item.cultura!.minutos);
  return (
    <div className="cartao">
      <b>{c.nome}</b>
      <div className="barra" style={{ margin: '10px 0' }}><div style={{ width: `${(item.cultura!.minutos / c.minutos) * 100}%` }} /></div>
      <div style={{ color: 'var(--suave)', fontSize: 14 }}>
        Faltam <b>{falta} min</b> de estudo para colher. As plantações crescem só quando você estuda. 📚
      </div>
    </div>
  );
}

function PainelIniciar({ s, irPara, pre }: { s: AppState; irPara: (a: 'estudos') => void; pre: { materiaId: string; assuntoId?: string } | null }) {
  const sugerida = proximaMateria(s);
  const ativas = s.materias.filter((m) => m.ativa);
  const [materiaId, setMateriaId] = useState(pre?.materiaId ?? sugerida?.id ?? '');
  const [assuntoId, setAssuntoId] = useState(pre?.assuntoId ?? '');
  const [modo, setModo] = useState<ModoTimer>('pomodoro');
  const [saida, setSaida] = useState(false);
  useEffect(() => { if (pre) { setMateriaId(pre.materiaId); setAssuntoId(pre.assuntoId ?? ''); } }, [pre]);
  useEffect(() => {
    if (!s.materias.some((m) => m.id === materiaId)) setMateriaId(sugerida?.id ?? '');
  }, [sugerida?.id, s.materias, materiaId]);
  const assuntos = s.assuntos.filter((a) => a.materiaId === materiaId);
  const revs = revisoesDoDia(s);
  const revDoAssunto = assuntoId ? revs.find((r) => r.assuntoId === assuntoId) : undefined;
  const prova = proximaProva(s);

  if (ativas.length === 0) {
    return (
      <div className="painel-estudo">
        <div style={{ marginBottom: 10 }}>Bem-vindo(a) à sua fazenda! 🌾 Cadastre suas matérias para começar o ciclo de estudos.</div>
        <button className="btn primario grande" onClick={() => irPara('estudos')}>Cadastrar matérias</button>
      </div>
    );
  }
  return (
    <div className="painel-estudo">
      <div className="faixa-hoje">
        {prova && <span>📅 {prova.nome} em <b>{prova.dias}</b> dia{prova.dias === 1 ? '' : 's'}</span>}
        {revs.length > 0 && <button onClick={() => irPara('estudos')}>🔁 <b>{revs.length}</b> revisão(ões) hoje</button>}
        {!prova && !revs.length && sugerida && <span>Próxima do ciclo: <b>{sugerida.nome}</b></span>}
      </div>
      <div className="linha" style={{ marginBottom: 8 }}>
        <select className="btn" style={{ flex: 2, textAlign: 'left' }} value={materiaId} onChange={(e) => { setMateriaId(e.target.value); setAssuntoId(''); }}>
          {ativas.map((m) => <option key={m.id} value={m.id}>{m.id === sugerida?.id ? '★ ' : ''}{m.nome}</option>)}
        </select>
        <div className="segmentos" style={{ flex: 2 }}>
          <button className={modo === 'pomodoro' ? 'ativo' : ''} onClick={() => setModo('pomodoro')}>🍅 {s.ajustes.pomodoroMin}′</button>
          <button className={modo === 'livre' ? 'ativo' : ''} onClick={() => setModo('livre')}>Livre</button>
        </div>
      </div>
      {assuntos.length > 0 && (
        <select className="btn" style={{ width: '100%', textAlign: 'left', marginBottom: 8, fontWeight: 500 }} value={assuntoId} onChange={(e) => setAssuntoId(e.target.value)}>
          <option value="">Assunto (opcional)</option>
          {assuntos.map((a) => <option key={a.id} value={a.id}>{revs.some((r) => r.assuntoId === a.id) ? '🔁 ' : ''}{a.nome}</option>)}
        </select>
      )}
      <label className="chave" style={{ paddingTop: 0 }}>
        <span>Vou estudar em outro app<small>PDF, Anki ou questões: sair do app não pune</small></span>
        <input type="checkbox" className="toggle" checked={saida} onChange={(e) => setSaida(e.target.checked)} />
      </label>
      <button className="btn primario grande" disabled={!materiaId}
        onClick={() => iniciarSessao({ materiaId, assuntoId: assuntoId || undefined, modo, saidaAutorizada: saida })}>
        {revDoAssunto ? 'Estudar (conta como revisão)' : 'Estudar'}
      </button>
    </div>
  );
}

function SessaoEmAndamento({ s, avisar, aoConcluir }: { s: AppState; avisar: (t: string) => void; aoConcluir: (r: ResumoSessao) => void }) {
  const a = s.sessaoAtiva!;
  const [, tique] = useState(0);
  const [concluindo, setConcluindo] = useState(false);
  useEffect(() => {
    const t = setInterval(() => {
      if (verificarPausaLonga()) avisar('Pausa longa demais: sessão encerrada no início da pausa.');
      tique((x) => x + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [avisar]);

  const seg = segundosLiquidos(a);
  const pausada = estaPausada(a);
  // a "arara" anuncia o fim de cada Pomodoro (único som permitido durante a sessão)
  const pomos = a.modo === 'pomodoro' ? pomodorosCompletos(seg, s.ajustes) : 0;
  const pomosAnt = useRef(pomos);
  useEffect(() => {
    if (pomos > pomosAnt.current) tocar('fim', s.ajustes.sons);
    pomosAnt.current = pomos;
  }, [pomos, s.ajustes.sons]);
  const materia = s.materias.find((m) => m.id === a.materiaId);
  const encerrada = !!a.encerradaEm;

  return (
    <div className={`sessao ${pausada ? 'pausada' : ''} ${s.ajustes.sessaoTelaMinima ? 'minima' : ''}`}>
      <div className="materia">{materia?.nome ?? 'Estudo'}</div>
      <div className="relogio">{formatarRelogio(seg)}</div>
      <div className="sub">
        {encerrada ? 'Sessão encerrada — salve para receber as recompensas'
          : pausada ? 'Pausado'
          : a.modo === 'pomodoro'
            ? `🍅 ${pomodorosCompletos(seg, s.ajustes)} completos · próximo em ${formatarRelogio(segundosAteProximoPomodoro(seg, s.ajustes))}`
            : 'Modo livre'}
      </div>
      {a.saidaAutorizada && <div className="sub">Saída autorizada para apps de estudo</div>}
      {a.penalidades > 0 && <div className="penalidade">🥀 {a.penalidades} saída(s) do app nesta sessão</div>}
      <div className="acoes">
        {!encerrada && <button className="btn" onClick={alternarPausa}>{pausada ? 'Retomar' : 'Pausar'}</button>}
        <button className="btn verde" onClick={() => setConcluindo(true)}>Concluir</button>
      </div>
      <button className="btn fantasma" style={{ marginTop: 14, color: 'var(--creme)', borderColor: 'rgba(255,255,255,.2)' }}
        onClick={async () => {
          if (seg >= 600 && !(await perguntar('Descartar esta sessão? O tempo não será registrado.', 'Descartar'))) return;
          cancelarSessao();
        }}>
        Descartar
      </button>
      {concluindo && (
        <ConcluirSessao s={s} aoCancelar={() => setConcluindo(false)} aoSalvar={async (extra) => {
          const r = await confirmarConclusao(extra);
          setConcluindo(false);
          if (r) aoConcluir(r);
        }} />
      )}
    </div>
  );
}

function ConcluirSessao({ s, aoCancelar, aoSalvar }: {
  s: AppState; aoCancelar: () => void;
  aoSalvar: (e: { assuntoId?: string; questoes?: number; acertos?: number; banca?: string; formato?: 'certo_errado' | 'multipla' }) => void;
}) {
  const d = dadosParaConcluir();
  const assuntos = s.assuntos.filter((x) => x.materiaId === d?.materiaId);
  const [assuntoId, setAssuntoId] = useState<string>(d?.assuntoId ?? '');
  const [banca, setBanca] = useState(bancaPadrao(s));
  const [questoes, setQuestoes] = useState('');
  const [acertos, setAcertos] = useState('');
  const q = parseInt(questoes) || 0, ac = Math.min(parseInt(acertos) || 0, q);
  return (
    <Folha titulo={`Concluir: ${d?.minutos ?? 0} min líquidos`} aoFechar={aoCancelar}>
      <div style={{ color: 'var(--texto)' }}>
        {assuntos.length > 0 && (
          <label className="campo">Assunto (opcional)
            <select value={assuntoId} onChange={(e) => setAssuntoId(e.target.value)}>
              <option value="">—</option>
              {assuntos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </label>
        )}
        <div className="linha">
          <label className="campo">Questões feitas<input inputMode="numeric" value={questoes} onChange={(e) => setQuestoes(e.target.value.replace(/\D/g, ''))} placeholder="0" /></label>
          <label className="campo">Acertos<input inputMode="numeric" value={acertos} onChange={(e) => setAcertos(e.target.value.replace(/\D/g, ''))} placeholder="0" /></label>
        </div>
        {q > 0 && <SeletorBanca valor={banca} aoMudar={setBanca} />}
        {q > 0 && d && q > Math.floor((d.minutos * 60) / ECONOMIA.estudo.segMinPorQuestao) && (
          <p style={{ fontSize: 13, color: '#8a5a00' }}>Mais de 1 questão a cada {ECONOMIA.estudo.segMinPorQuestao} s: tudo entra nas métricas, mas só {Math.floor((d.minutos * 60) / ECONOMIA.estudo.segMinPorQuestao)} rendem moedas.</p>
        )}
        {d && d.minutos < ECONOMIA.moedas.sessaoMinimaParaMoedasMin && (
          <p style={{ fontSize: 13, color: 'var(--suave)' }}>Sessões com menos de {ECONOMIA.moedas.sessaoMinimaParaMoedasMin} min contam XP, mas não dão moedas por minuto.</p>
        )}
        <button className="btn primario grande" onClick={() => aoSalvar({ assuntoId: assuntoId || undefined, questoes: q || undefined, acertos: q ? ac : undefined, banca: q && banca ? banca : undefined, formato: q ? formatoDaBanca(banca) : undefined })}>
          Salvar e colher recompensas
        </button>
      </div>
    </Folha>
  );
}

export function ResumoFinal({ resumo, aoFechar }: { resumo: ResumoSessao; aoFechar: () => void }) {
  const subiu = resumo.nivelDepois > resumo.nivelAntes;
  const meta = resumo.linhas.some((l) => l.motivo.startsWith('Meta'));
  const xp = useContagem(resumo.xp, 900, 0);
  const moedas = useContagem(resumo.moedas, 1100, 0);
  const [visiveis, setVisiveis] = useState(0);
  useEffect(() => {
    if (visiveis >= resumo.linhas.length) return;
    const t = setTimeout(() => setVisiveis((v) => v + 1), 180);
    return () => clearTimeout(t);
  }, [visiveis, resumo.linhas.length]);
  return (
    <Folha titulo={subiu ? `Nível ${resumo.nivelDepois}! 🎉` : 'Sessão registrada! 🌾'} aoFechar={aoFechar}>
      {(subiu || meta) && <Confete />}
      <div className="resumo-topo">
        <div><div className="grande-num">+{Math.round(xp)}</div><div className="r">XP</div></div>
        <div><div className="grande-num ouro">+{Math.round(moedas)}</div><div className="r">moedas</div></div>
      </div>
      {meta && <div className="carimbo">Meta do dia ✔</div>}
      <div className="cartao">
        {resumo.linhas.slice(0, visiveis).map((l, i) => <div key={i} className="recompensa entrar"><span>{l.motivo}</span><b>+{l.moedas}</b></div>)}
        {resumo.linhas.length === 0 && <div style={{ color: 'var(--suave)', fontSize: 14 }}>Sessões curtas contam XP; moedas a partir de {ECONOMIA.moedas.sessaoMinimaParaMoedasMin} min.</div>}
      </div>
      {resumo.culturasProntas > 0 && <p>🌽 {resumo.culturasProntas} plantação(ões) prontas para colher!</p>}
      <button className="btn primario grande" onClick={aoFechar}>Ver a fazenda</button>
    </Folha>
  );
}

function Confete() {
  const pecas = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.6, dur: 1.6 + Math.random() * 1.2,
    cor: ['#e74c3c', '#f2c230', '#27ae60', '#2980b9', '#e67e22'][i % 5], rot: Math.random() * 360,
  })), []);
  return (
    <div className="confete" aria-hidden="true">
      {pecas.map((p, i) => <i key={i} style={{ left: `${p.left}%`, background: p.cor, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, transform: `rotate(${p.rot}deg)` }} />)}
    </div>
  );
}
