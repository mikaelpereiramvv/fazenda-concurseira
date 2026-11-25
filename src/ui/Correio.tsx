import { useEffect, useState } from 'react';
import { atualizar } from '../store';
import { NPCS, cartasDisponiveis, marcarCartasLidas, missoesAtivas, resgatarMissao } from '../domain/missoes';
import { construcao } from '../domain/economia';
import type { AppState } from '../domain/tipos';
import type { PedidoColocacao } from './Fazenda';
import { Folha } from './comum';

type Aba = 'missoes' | 'cartas' | 'itens';

export function Correio({ s, avisar, aoFechar, colocar }: {
  s: AppState; avisar: (t: string) => void; aoFechar: () => void; colocar: (c: PedidoColocacao) => void;
}) {
  const missoes = missoesAtivas(s);
  const cartas = cartasDisponiveis(s);
  const inventario = Object.entries(s.registro.inventario ?? {}).filter(([, n]) => n > 0);
  const naoLidas = cartas.filter((c) => !c.lida);
  const [aba, setAba] = useState<Aba>(naoLidas.length && !missoes.some((m) => m.concluida && !m.resgatada) ? 'cartas' : 'missoes');

  // abrir a aba de cartas marca todas como lidas
  useEffect(() => {
    if (aba === 'cartas' && naoLidas.length) {
      const ids = naoLidas.map((c) => c.id);
      const t = setTimeout(() => atualizar((st) => marcarCartasLidas(st, ids)), 400);
      return () => clearTimeout(t);
    }
  }, [aba, naoLidas]);

  const rotulo = { diaria: 'Hoje', semanal: 'Esta semana', capitulo: 'Capítulo' } as const;

  return (
    <Folha titulo="Correio da fazenda" aoFechar={aoFechar}>
      <div className="segmentos" style={{ marginBottom: 12 }}>
        <button className={aba === 'missoes' ? 'ativo' : ''} onClick={() => setAba('missoes')}>Missões</button>
        <button className={aba === 'cartas' ? 'ativo' : ''} onClick={() => setAba('cartas')}>Cartas{naoLidas.length ? ` (${naoLidas.length})` : ''}</button>
        <button className={aba === 'itens' ? 'ativo' : ''} onClick={() => setAba('itens')}>Itens{inventario.length ? ` (${inventario.length})` : ''}</button>
      </div>

      {aba === 'missoes' && (
        <>
          <p style={{ fontSize: 13, color: 'var(--suave)', marginTop: 0 }}>Missões só contam estudo de verdade. Lançamentos manuais valem metade.</p>
          {missoes.map((m) => {
            const npc = NPCS[m.npc];
            const r = m.recompensa;
            const premio = [r.moedas && `🪙 ${r.moedas}`, r.congelador && `🧊 ${r.congelador}`, r.item && `🎁 ${construcao(r.item)?.nome ?? r.item}`].filter(Boolean).join(' · ');
            return (
              <div key={m.chave} className={`cartao missao ${m.resgatada ? 'feita' : ''}`}>
                <div className="linha" style={{ alignItems: 'flex-start' }}>
                  <span className="npc" style={{ flex: 'none' }}>{npc.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--suave)', fontWeight: 700 }}>{rotulo[m.tipo]} · {npc.nome}</div>
                    <b>{m.titulo}</b>
                    <div style={{ fontSize: 14, color: 'var(--suave)' }}>{m.descricao}</div>
                    <div className="barra" style={{ margin: '8px 0 4px' }}><div style={{ width: `${(m.atual / m.meta) * 100}%`, background: m.concluida ? 'var(--ipe)' : undefined }} /></div>
                    <div className="linha" style={{ fontSize: 13 }}>
                      <span>{m.atual}/{m.meta}</span>
                      <span style={{ textAlign: 'right' }}>{premio}</span>
                    </div>
                  </div>
                </div>
                {m.concluida && !m.resgatada && (
                  <button className="btn primario grande" style={{ marginTop: 10 }} onClick={() => {
                    const res = resgatarMissao(s, m.chave);
                    if (!res.ok) return avisar(res.erro);
                    atualizar(() => res.state);
                    avisar(`Recompensa: ${res.texto} 🎉`);
                  }}>Resgatar</button>
                )}
                {m.resgatada && <div className="carimbo pequeno">Feito ✔</div>}
              </div>
            );
          })}
        </>
      )}

      {aba === 'cartas' && cartas.map((c) => (
        <div key={c.id} className={`cartao carta ${c.lida ? '' : 'nova'}`}>
          <div className="linha" style={{ alignItems: 'flex-start' }}>
            <span className="npc" style={{ flex: 'none' }}>{NPCS[c.npc].emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--suave)', fontWeight: 700 }}>{NPCS[c.npc].nome}</div>
              <b>{c.titulo}</b>
              <p className="texto-carta">{c.texto}</p>
            </div>
          </div>
        </div>
      ))}

      {aba === 'itens' && (
        inventario.length === 0
          ? <div className="vazio">Itens exclusivos de missões aparecem aqui para você colocar na fazenda.</div>
          : (
            <div className="itens-loja">
              {inventario.map(([ref, n]) => {
                const c = construcao(ref);
                return (
                  <div key={ref} className="item-loja">
                    <span className="nome">🎁 {c?.nome ?? ref}{n > 1 ? ` ×${n}` : ''}</span>
                    <span className="desc">{c?.descricao}</span>
                    <button className="btn primario" disabled={!!s.sessaoAtiva} onClick={() => colocar({
                      tipo: 'construcao', ref, w: c?.tamanho[0] ?? 1, h: c?.tamanho[1] ?? 1, rotulo: c?.nome ?? ref, doInventario: true,
                    })}>Colocar</button>
                  </div>
                );
              })}
            </div>
          )
      )}
    </Folha>
  );
}
