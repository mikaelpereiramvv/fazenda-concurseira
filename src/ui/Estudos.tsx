import { useState } from 'react';
import { atualizar } from '../store';
import { itensCiclo, progressoCiclo } from '../domain/ciclo';
import { formatarDuracao, novoId } from '../domain/datas';
import type { AppState, Materia, StatusAssunto } from '../domain/tipos';
import { CORES_MATERIA, Folha, perguntar } from './comum';

const STATUS: Record<StatusAssunto, string> = { nao_visto: 'Não visto', teoria: 'Teoria', questoes: 'Questões', revisado: 'Revisado' };

export function TelaEstudos({ s }: { s: AppState }) {
  const itens = itensCiclo(s);
  const [editando, setEditando] = useState<Materia | 'nova' | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [novoAssunto, setNovoAssunto] = useState('');
  const ordenadas = [...s.materias].sort((a, b) => a.ordem - b.ordem);

  const mover = (id: string, d: -1 | 1) => atualizar((st) => {
    const lista = [...st.materias].sort((a, b) => a.ordem - b.ordem);
    const i = lista.findIndex((m) => m.id === id);
    const j = i + d;
    if (j < 0 || j >= lista.length) return st;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    return { ...st, materias: lista.map((m, k) => ({ ...m, ordem: k })) };
  });

  return (
    <div className="pagina">
      <h1>Estudos</h1>

      <h2>Ciclo de estudos · volta {s.ciclo.rodada}</h2>
      <div className="cartao">
        {itens.length === 0 ? <div className="vazio">Cadastre matérias com um tempo por volta para montar seu ciclo.</div> : (
          <>
            <div className="barra" style={{ marginBottom: 12 }}><div style={{ width: `${progressoCiclo(s) * 100}%`, background: 'var(--ipe)' }} /></div>
            {itens.map((i) => (
              <div key={i.materia.id} className="lista-item">
                <span className="bolinha" style={{ background: i.materia.cor }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span>{i.fracao >= 1 ? '✅ ' : ''}{i.materia.nome}</span>
                    <span style={{ color: 'var(--suave)' }}>{formatarDuracao(Math.min(i.feitoMin, i.metaMin))} / {formatarDuracao(i.metaMin)}</span>
                  </div>
                  <div className="barra" style={{ marginTop: 4 }}><div style={{ width: `${i.fracao * 100}%`, background: i.materia.cor }} /></div>
                </div>
              </div>
            ))}
            <p style={{ fontSize: 12, color: 'var(--suave)', margin: '8px 0 0' }}>A volta fecha quando todas as matérias batem o tempo. O app sugere a próxima ao abrir o timer.</p>
          </>
        )}
      </div>

      <div className="linha" style={{ alignItems: 'baseline' }}>
        <h2>Matérias e edital</h2>
        <button className="btn primario" style={{ flex: 'none' }} onClick={() => setEditando('nova')}>+ Matéria</button>
      </div>
      {ordenadas.map((m, idx) => {
        const assuntos = s.assuntos.filter((a) => a.materiaId === m.id);
        const cobertos = assuntos.filter((a) => a.status !== 'nao_visto').length;
        return (
          <div key={m.id} className="cartao" style={{ opacity: m.ativa ? 1 : 0.6 }}>
            <div className="linha">
              <span className="bolinha" style={{ background: m.cor, flex: 'none' }} />
              <div style={{ flex: 4 }} onClick={() => setAberta(aberta === m.id ? null : m.id)}>
                <b>{m.nome}</b>
                <div style={{ fontSize: 12, color: 'var(--suave)' }}>
                  {formatarDuracao(m.metaCicloMin)} por volta · edital {assuntos.length ? `${Math.round((cobertos / assuntos.length) * 100)}%` : '—'}
                </div>
              </div>
              <button className="btn" style={{ flex: 'none', padding: '6px 9px' }} disabled={idx === 0} onClick={() => mover(m.id, -1)}>↑</button>
              <button className="btn" style={{ flex: 'none', padding: '6px 9px' }} disabled={idx === ordenadas.length - 1} onClick={() => mover(m.id, 1)}>↓</button>
              <button className="btn" style={{ flex: 'none', padding: '6px 9px' }} onClick={() => setEditando(m)}>✎</button>
            </div>
            {aberta === m.id && (
              <div style={{ marginTop: 10 }}>
                {assuntos.map((a) => (
                  <div key={a.id} className="lista-item">
                    <span style={{ flex: 3, fontSize: 14 }}>{a.nome}</span>
                    <select className="btn" style={{ flex: 2, padding: '6px 8px', fontSize: 13 }} value={a.status}
                      onChange={(e) => atualizar((st) => ({ ...st, assuntos: st.assuntos.map((x) => x.id === a.id ? { ...x, status: e.target.value as StatusAssunto } : x) }))}>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button className="btn" style={{ flex: 'none', padding: '6px 9px' }} onClick={() => atualizar((st) => ({ ...st, assuntos: st.assuntos.filter((x) => x.id !== a.id) }))}>✕</button>
                  </div>
                ))}
                <form className="linha" style={{ marginTop: 8 }} onSubmit={(e) => {
                  e.preventDefault();
                  const nomes = novoAssunto.split('\n').map((x) => x.trim()).filter(Boolean);
                  if (!nomes.length) return;
                  atualizar((st) => ({ ...st, assuntos: [...st.assuntos, ...nomes.map((nome) => ({ id: novoId(), materiaId: m.id, nome, status: 'nao_visto' as const }))] }));
                  setNovoAssunto('');
                }}>
                  <input className="btn" style={{ flex: 3, background: '#fff', textAlign: 'left', fontWeight: 400 }} placeholder="Novo assunto do edital" value={novoAssunto} onChange={(e) => setNovoAssunto(e.target.value)} />
                  <button className="btn verde" style={{ flex: 'none' }}>Adicionar</button>
                </form>
              </div>
            )}
          </div>
        );
      })}
      {editando && <EditarMateria s={s} m={editando === 'nova' ? null : editando} aoFechar={() => setEditando(null)} />}
    </div>
  );
}

function EditarMateria({ s, m, aoFechar }: { s: AppState; m: Materia | null; aoFechar: () => void }) {
  const [nome, setNome] = useState(m?.nome ?? '');
  const [cor, setCor] = useState(m?.cor ?? CORES_MATERIA[s.materias.length % CORES_MATERIA.length]);
  const [meta, setMeta] = useState(String(m?.metaCicloMin ?? 60));
  const [ativa, setAtiva] = useState(m?.ativa ?? true);
  const [assuntosTexto, setAssuntosTexto] = useState('');
  return (
    <Folha titulo={m ? 'Editar matéria' : 'Nova matéria'} aoFechar={aoFechar}>
      <label className="campo">Nome<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Direito Constitucional" /></label>
      <label className="campo">Minutos por volta do ciclo<input inputMode="numeric" value={meta} onChange={(e) => setMeta(e.target.value.replace(/\D/g, ''))} /></label>
      <div className="campo">Cor
        <div className="linha" style={{ flexWrap: 'wrap' }}>
          {CORES_MATERIA.map((c) => <button key={c} onClick={() => setCor(c)} style={{ flex: 'none', width: 32, height: 32, borderRadius: 16, border: c === cor ? '3px solid var(--cafe)' : '0', background: c }} />)}
        </div>
      </div>
      {!m && (
        <label className="campo">Assuntos do edital (um por linha, opcional)
          <textarea rows={4} value={assuntosTexto} onChange={(e) => setAssuntosTexto(e.target.value)} placeholder={'Princípios fundamentais\nDireitos e garantias\nOrganização do Estado'} />
        </label>
      )}
      <label className="chave"><span>Ativa no ciclo</span><input type="checkbox" className="toggle" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} /></label>
      <div className="linha" style={{ marginTop: 12 }}>
        {m && <button className="btn perigo" onClick={async () => {
          if (!(await perguntar(`Excluir ${m.nome}? As sessões continuam no histórico.`, 'Excluir'))) return;
          atualizar((st) => ({ ...st, materias: st.materias.filter((x) => x.id !== m.id), assuntos: st.assuntos.filter((a) => a.materiaId !== m.id) }));
          aoFechar();
        }}>Excluir</button>}
        <button className="btn primario" disabled={!nome.trim()} onClick={() => {
          const metaN = Math.max(0, parseInt(meta) || 0);
          if (m) atualizar((st) => ({ ...st, materias: st.materias.map((x) => x.id === m.id ? { ...x, nome: nome.trim(), cor, metaCicloMin: metaN, ativa } : x) }));
          else {
            const id = novoId();
            const assuntos = assuntosTexto.split('\n').map((x) => x.trim()).filter(Boolean).map((n) => ({ id: novoId(), materiaId: id, nome: n, status: 'nao_visto' as const }));
            atualizar((st) => ({ ...st, materias: [...st.materias, { id, nome: nome.trim(), cor, metaCicloMin: metaN, ativa, ordem: st.materias.length }], assuntos: [...st.assuntos, ...assuntos] }));
          }
          aoFechar();
        }}>Salvar</button>
      </div>
    </Folha>
  );
}
