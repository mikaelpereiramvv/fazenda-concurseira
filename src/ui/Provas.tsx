import { useState } from 'react';
import { atualizar } from '../store';
import { chaveDia, deChaveDia, diffDias, novoId } from '../domain/datas';
import type { AppState, Concurso } from '../domain/tipos';
import { BANCAS, perguntar } from './comum';

export function Provas({ s }: { s: AppState }) {
  const lista = s.concursos ?? [];
  const [novoNome, setNovoNome] = useState('');
  const set = (id: string, patch: Partial<Concurso>) =>
    atualizar((st) => ({ ...st, concursos: (st.concursos ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  return (
    <>
      <p style={{ marginTop: 0, fontSize: 14, color: 'var(--suave)' }}>
        Com a data da prova, o app mostra a contagem regressiva e calcula o ritmo necessário para fechar o edital (reservando as 2 últimas semanas para revisão). A banca vira o padrão ao registrar questões.
      </p>
      {lista.map((c) => {
        const dias = c.dataProva ? diffDias(new Date(), deChaveDia(c.dataProva)) : null;
        return (
          <div key={c.id} className="cartao" style={{ opacity: c.ativo ? 1 : 0.6 }}>
            <div className="linha" style={{ alignItems: 'baseline' }}>
              <input className="titulo-input" value={c.nome} onChange={(e) => set(c.id, { nome: e.target.value })} />
              <b style={{ flex: 'none', color: 'var(--terra)' }}>{dias === null ? 'sem data' : dias < 0 ? 'já foi' : `${dias} dias`}</b>
            </div>
            <div className="linha">
              <label className="campo">Data da prova<input type="date" min={chaveDia(new Date())} value={c.dataProva ?? ''} onChange={(e) => set(c.id, { dataProva: e.target.value || undefined })} /></label>
              <label className="campo">Banca
                <select value={c.banca ?? ''} onChange={(e) => set(c.id, { banca: e.target.value || undefined })}>
                  <option value="">—</option>
                  {BANCAS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
            </div>
            <div className="linha">
              <label className="chave" style={{ flex: 2, padding: 0, border: 0 }}><span>Ativo</span><input type="checkbox" className="toggle" checked={c.ativo} onChange={(e) => set(c.id, { ativo: e.target.checked })} /></label>
              <button className="btn fantasma" style={{ flex: 'none', padding: '6px 10px', fontSize: 13 }} onClick={async () => {
                if (await perguntar(`Remover ${c.nome}?`, 'Remover')) atualizar((st) => ({ ...st, concursos: (st.concursos ?? []).filter((x) => x.id !== c.id) }));
              }}>Remover</button>
            </div>
          </div>
        );
      })}
      <form className="linha" onSubmit={(e) => {
        e.preventDefault();
        if (!novoNome.trim()) return;
        atualizar((st) => ({ ...st, concursos: [...(st.concursos ?? []), { id: novoId(), nome: novoNome.trim(), ativo: true }] }));
        setNovoNome('');
      }}>
        <input className="btn" style={{ flex: 3, background: '#fff', textAlign: 'left', fontWeight: 400 }} placeholder="Outro concurso" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
        <button className="btn verde" style={{ flex: 'none' }}>Adicionar</button>
      </form>
    </>
  );
}
