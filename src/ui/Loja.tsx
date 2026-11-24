import { useState } from 'react';
import { atualizar } from '../store';
import { ECONOMIA, lote } from '../domain/economia';
import { nivelDeXp } from '../domain/niveis';
import { comprarAnimal, comprarCongelador, expandirLote, melhorarCasa, precoProximoCanteiro, vagasAnimal } from '../domain/fazenda';
import type { AppState } from '../domain/tipos';
import type { PedidoColocacao } from './Fazenda';
import { Icone, Moedas } from './comum';

type Secao = 'construcoes' | 'animais' | 'decoracao' | 'terreno' | 'plantacoes';

export function TelaLoja({ s, avisar, colocar }: { s: AppState; avisar: (t: string) => void; colocar: (c: PedidoColocacao) => void }) {
  const [secao, setSecao] = useState<Secao>('construcoes');
  const nivel = nivelDeXp(s.jogador.xp).nivel;
  const travadaSessao = !!s.sessaoAtiva;

  const comprar = (fn: () => ReturnType<typeof comprarAnimal>) => {
    const r = fn();
    if (!r.ok) return avisar(r.erro);
    atualizar(() => r.state);
    avisar(r.mensagem ?? 'Comprado! 🎉');
  };

  return (
    <div className="pagina">
      <div className="linha" style={{ alignItems: 'baseline' }}>
        <h1>Loja</h1>
        <div className="pilula" style={{ flex: 'none' }}><Moedas v={s.jogador.moedas} /></div>
      </div>
      {travadaSessao && <div className="cartao">🔒 A loja fica fechada durante a sessão de estudo.</div>}
      <div className="segmentos" style={{ marginBottom: 14, overflowX: 'auto' }}>
        {([['construcoes', 'Construções'], ['animais', 'Animais'], ['decoracao', 'Decoração'], ['terreno', 'Terreno'], ['plantacoes', 'Sementes']] as const).map(([k, r]) => (
          <button key={k} className={secao === k ? 'ativo' : ''} onClick={() => setSecao(k)}>{r}</button>
        ))}
      </div>

      {(secao === 'construcoes' || secao === 'decoracao') && (
        <div className="itens-loja">
          {ECONOMIA.construcoes.filter((c) => !c.inicial && (secao === 'decoracao' ? c.categoria === 'decoracao' : c.categoria !== 'decoracao')).map((c) => {
            const travado = nivel < c.nivel;
            return (
              <div key={c.id} className={`item-loja ${travado ? 'travado' : ''}`}>
                <span className="nome">{travado && <Icone k="ui_cadeado" />} {c.nome}</span>
                <span className="desc">{travado ? `Libera no nível ${c.nivel}` : c.descricao} · {c.tamanho.join('×')}</span>
                <div className="linha">
                  <Moedas v={c.preco} />
                  <button className="btn primario" style={{ flex: 'none', padding: '8px 12px' }} disabled={travado || travadaSessao || s.jogador.moedas < c.preco}
                    onClick={() => colocar({ tipo: 'construcao', ref: c.id, w: c.tamanho[0], h: c.tamanho[1], rotulo: c.nome })}>Colocar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {secao === 'animais' && (
        <div className="itens-loja">
          {ECONOMIA.animais.map((a) => {
            const v = vagasAnimal(s, a.id);
            const travado = nivel < a.nivel;
            const qtd = s.fazenda.itens.filter((i) => i.ref === a.id).length;
            return (
              <div key={a.id} className={`item-loja ${travado ? 'travado' : ''}`}>
                <span className="nome">{travado && <Icone k="ui_cadeado" />} {a.nome}{qtd ? ` (${qtd})` : ''}</span>
                <span className="desc">{v.podeComprar ? a.descricao : v.motivo}</span>
                <div className="linha">
                  <Moedas v={a.preco} />
                  <button className="btn primario" style={{ flex: 'none', padding: '8px 12px' }} disabled={!v.podeComprar || travadaSessao}
                    onClick={() => comprar(() => comprarAnimal(s, a.id))}>Comprar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {secao === 'terreno' && <SecaoTerreno s={s} nivel={nivel} comprar={comprar} colocar={colocar} travada={travadaSessao} />}

      {secao === 'plantacoes' && (
        <div className="cartao">
          <p style={{ marginTop: 0 }}>Toque num canteiro vazio na fazenda para plantar. As culturas crescem só com <b>minutos de estudo</b>.</p>
          {ECONOMIA.culturas.map((c) => (
            <div key={c.id} className="lista-item" style={{ opacity: nivel < c.nivel ? 0.5 : 1 }}>
              <span style={{ flex: 2 }}>{nivel < c.nivel && <Icone k="ui_cadeado" />} {c.nome}</span>
              <span style={{ fontSize: 13, color: 'var(--suave)' }}>{c.minutos} min · nível {c.nivel}</span>
              <span style={{ fontSize: 13 }}>{c.semente} → <b>{c.venda}</b></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SecaoTerreno({ s, nivel, comprar, colocar, travada }: {
  s: AppState; nivel: number; travada: boolean;
  comprar: (fn: () => ReturnType<typeof comprarAnimal>) => void; colocar: (c: PedidoColocacao) => void;
}) {
  const precoCanteiro = precoProximoCanteiro(s);
  const prox = lote(s.fazenda.lote + 1);
  const casa = s.fazenda.itens.find((i) => i.ref === 'casa');
  const upgrades = ECONOMIA.construcoes.find((c) => c.id === 'casa')?.upgrades ?? [];
  const precoCasa = upgrades[(casa?.nivel ?? 1) - 1];
  const o = ECONOMIA.ofensiva;
  return (
    <div className="itens-loja">
      <div className="item-loja">
        <span className="nome">Novo canteiro</span>
        <span className="desc">{s.fazenda.itens.filter((i) => i.tipo === 'canteiro').length} canteiros hoje</span>
        <div className="linha"><Moedas v={precoCanteiro} />
          <button className="btn primario" style={{ flex: 'none', padding: '8px 12px' }} disabled={travada || s.jogador.moedas < precoCanteiro}
            onClick={() => colocar({ tipo: 'canteiro', w: 1, h: 1, rotulo: 'Canteiro' })}>Colocar</button>
        </div>
      </div>
      {prox && (
        <div className={`item-loja ${prox.nivel && nivel < prox.nivel ? 'travado' : ''}`}>
          <span className="nome">Terreno {prox.tamanho}×{prox.tamanho}</span>
          <span className="desc">{prox.nivel && nivel < prox.nivel ? `Libera no nível ${prox.nivel}` : 'Mais espaço para a fazenda crescer'}</span>
          <div className="linha"><Moedas v={prox.preco} />
            <button className="btn primario" style={{ flex: 'none', padding: '8px 12px' }} disabled={travada} onClick={() => comprar(() => expandirLote(s))}>Comprar</button>
          </div>
        </div>
      )}
      {precoCasa !== undefined && (
        <div className="item-loja">
          <span className="nome">Reformar a casa</span>
          <span className="desc">Nível {(casa?.nivel ?? 1) + 1} · +1 canteiro grátis</span>
          <div className="linha"><Moedas v={precoCasa} />
            <button className="btn primario" style={{ flex: 'none', padding: '8px 12px' }} disabled={travada} onClick={() => comprar(() => melhorarCasa(s))}>Reformar</button>
          </div>
        </div>
      )}
      <div className="item-loja">
        <span className="nome">🧊 Congelador de ofensiva</span>
        <span className="desc">Protege 1 dia sem estudo. Você tem {s.jogador.congeladores}/{o.congeladorEstoqueMax}. Ganha 1 grátis a cada {o.congeladorGratisACadaDias} dias de ofensiva.</span>
        <div className="linha"><Moedas v={o.congeladorPreco} />
          <button className="btn primario" style={{ flex: 'none', padding: '8px 12px' }} onClick={() => comprar(() => comprarCongelador(s))}>Comprar</button>
        </div>
      </div>
    </div>
  );
}
