import { useState } from 'react';
import { atualizar } from '../store';
import { excluirSimulado, notaSimulado, registrarSimulado, simuladosDe } from '../domain/simulados';
import { chaveDia } from '../domain/datas';
import type { AppState } from '../domain/tipos';
import { Folha, pct, perguntar } from './comum';

export function Simulados({ s, avisar }: { s: AppState; avisar: (t: string) => void }) {
  const lista = [...simuladosDe(s)].sort((a, b) => a.em.localeCompare(b.em));
  const [novo, setNovo] = useState(false);
  const max = Math.max(0.01, ...lista.map((x) => notaSimulado(x).pct));
  return (
    <>
      <p style={{ marginTop: 0, fontSize: 14, color: 'var(--suave)' }}>Faça simulados nas condições da prova (tempo e horário) e registre o resultado por matéria. Entram nas métricas de acerto.</p>
      <button className="btn primario grande" style={{ marginBottom: 12 }} onClick={() => setNovo(true)}>+ Registrar simulado</button>
      {lista.length > 0 && (
        <div className="cartao">
          <b>Evolução</b>
          <div className="evolucao">
            {lista.map((x) => {
              const n = notaSimulado(x);
              const corte = x.notaCorte;
              return (
                <div key={x.id} className="coluna" title={`${x.nome}: ${pct(n.pct)}`}>
                  <span className="valor">{pct(n.pct)}</span>
                  <div className="barra-v" style={{ height: `${(n.pct / max) * 100}%`, background: corte !== undefined && n.pct >= corte ? 'var(--mata)' : 'var(--terra-2)' }} />
                  <span className="rot">{new Date(x.em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {[...lista].reverse().map((x) => {
        const n = notaSimulado(x);
        return (
          <div key={x.id} className="cartao">
            <div className="linha" style={{ justifyContent: 'space-between' }}>
              <b>{x.nome}</b>
              <b style={{ flex: 'none', color: x.notaCorte !== undefined ? (n.pct >= x.notaCorte ? 'var(--mata)' : 'var(--perigo)') : undefined }}>{pct(n.pct, 1)}</b>
            </div>
            <div style={{ fontSize: 12, color: 'var(--suave)' }}>
              {new Date(x.em).toLocaleDateString('pt-BR')} · {n.acertos}/{n.feitas} questões{x.notaCorte !== undefined ? ` · corte ${pct(x.notaCorte)}` : ''}{x.concursoId ? ` · ${s.concursos?.find((c) => c.id === x.concursoId)?.nome ?? ''}` : ''}
            </div>
            {x.porMateria.map((m) => (
              <div key={m.materiaId} className="linha" style={{ fontSize: 13, marginTop: 4 }}>
                <span>{s.materias.find((mm) => mm.id === m.materiaId)?.nome ?? '—'}</span>
                <span style={{ textAlign: 'right' }}>{m.acertos}/{m.feitas} · {pct(m.feitas ? m.acertos / m.feitas : null)}</span>
              </div>
            ))}
            <button className="btn fantasma" style={{ marginTop: 8, padding: '6px 10px', fontSize: 13 }} onClick={async () => {
              if (await perguntar(`Excluir ${x.nome}?`, 'Excluir')) atualizar((st) => excluirSimulado(st, x.id));
            }}>Excluir</button>
          </div>
        );
      })}
      {novo && <NovoSimulado s={s} aoFechar={() => setNovo(false)} avisar={avisar} />}
    </>
  );
}

function NovoSimulado({ s, aoFechar, avisar }: { s: AppState; aoFechar: () => void; avisar: (t: string) => void }) {
  const hoje = chaveDia(new Date());
  const [nome, setNome] = useState(`Simulado ${simuladosDe(s).length + 1}`);
  const [data, setData] = useState(hoje);
  const [duracao, setDuracao] = useState('240');
  const [corte, setCorte] = useState('');
  const [concursoId, setConcursoId] = useState((s.concursos ?? []).find((c) => c.ativo)?.id ?? '');
  const [linhas, setLinhas] = useState<Record<string, { f: string; a: string }>>({});
  const set = (id: string, k: 'f' | 'a', v: string) => setLinhas((l) => ({ ...l, [id]: { f: l[id]?.f ?? '', a: l[id]?.a ?? '', [k]: v.replace(/\D/g, '') } }));
  return (
    <Folha titulo="Registrar simulado" aoFechar={aoFechar}>
      <label className="campo">Nome<input value={nome} onChange={(e) => setNome(e.target.value)} /></label>
      <div className="linha">
        <label className="campo">Data<input type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value > hoje ? hoje : e.target.value)} /></label>
        <label className="campo">Duração (min)<input inputMode="numeric" value={duracao} onChange={(e) => setDuracao(e.target.value.replace(/\D/g, ''))} /></label>
      </div>
      <div className="linha">
        <label className="campo">Concurso
          <select value={concursoId} onChange={(e) => setConcursoId(e.target.value)}>
            <option value="">—</option>
            {(s.concursos ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label className="campo">Nota de corte (%)<input inputMode="numeric" value={corte} onChange={(e) => setCorte(e.target.value.replace(/\D/g, ''))} placeholder="opcional" /></label>
      </div>
      <div className="campo">Resultado por matéria (feitas / acertos)</div>
      {s.materias.map((m) => (
        <div key={m.id} className="linha" style={{ marginBottom: 6 }}>
          <span style={{ flex: 2, fontSize: 14 }}>{m.nome}</span>
          <input className="mini-input" inputMode="numeric" placeholder="feitas" value={linhas[m.id]?.f ?? ''} onChange={(e) => set(m.id, 'f', e.target.value)} />
          <input className="mini-input" inputMode="numeric" placeholder="acertos" value={linhas[m.id]?.a ?? ''} onChange={(e) => set(m.id, 'a', e.target.value)} />
        </div>
      ))}
      <button className="btn primario grande" style={{ marginTop: 8 }} onClick={() => {
        const r = registrarSimulado(s, {
          nome, em: new Date(`${data}T12:00`).toISOString(), duracaoMin: parseInt(duracao) || 0,
          concursoId: concursoId || undefined, notaCorte: corte ? Math.min(100, parseInt(corte)) / 100 : undefined,
          porMateria: s.materias.map((m) => ({ materiaId: m.id, feitas: parseInt(linhas[m.id]?.f ?? '') || 0, acertos: parseInt(linhas[m.id]?.a ?? '') || 0 })),
        });
        if (!r.ok) return avisar(r.erro);
        atualizar(() => r.state);
        avisar('Simulado registrado! 📝');
        aoFechar();
      }}>Salvar simulado</button>
    </Folha>
  );
}
