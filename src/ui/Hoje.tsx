import { useState } from 'react';
import { atualizar } from '../store';
import { adiarRevisao, errosDoDia, revisarAvulso, revisoesDoDia } from '../domain/revisoes';
import { proximaProva } from '../domain/desempenho';
import { proximaMateria } from '../domain/ciclo';
import { totais } from '../domain/estatisticas';
import { deChaveDia, diffDias, formatarDuracao } from '../domain/datas';
import type { AppState } from '../domain/tipos';
import { Folha, SeletorBanca, formatoDaBanca } from './comum';

export interface AcoesHoje {
  estudar: (materiaId: string, assuntoId?: string) => void;
  irPara: (secao: 'erros' | 'provas') => void;
}

export function bancaPadrao(s: AppState): string {
  return proximaProva(s)?.banca ?? (s.concursos ?? []).find((c) => c.ativo && c.banca)?.banca ?? '';
}

export function PainelHoje({ s, avisar, acoes }: { s: AppState; avisar: (t: string) => void; acoes: AcoesHoje }) {
  const revs = revisoesDoDia(s);
  const erros = errosDoDia(s);
  const prox = proximaMateria(s);
  const t = totais(s.sessoes);
  const provas = (s.concursos ?? []).filter((c) => c.ativo);
  const [revisando, setRevisando] = useState<string | null>(null);
  const nomeA = (id: string) => s.assuntos.find((a) => a.id === id)?.nome ?? 'Assunto';
  const nomeM = (id: string) => s.materias.find((m) => m.id === id);

  return (
    <>
      <div className="grade-provas">
        {provas.map((c) => {
          const dias = c.dataProva ? diffDias(new Date(), deChaveDia(c.dataProva)) : null;
          return (
            <button key={c.id} className="mini prova" onClick={() => acoes.irPara('provas')}>
              <div className="v">{dias === null ? '—' : dias < 0 ? '✓' : dias}</div>
              <div className="r">{c.nome}{dias === null ? ' · sem data' : dias < 0 ? ' · já foi' : dias === 1 ? ' · dia' : ' · dias'}</div>
            </button>
          );
        })}
      </div>

      <div className="cartao">
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <b>Meta de hoje</b>
          <span style={{ flex: 'none', color: 'var(--suave)' }}>{formatarDuracao(t.hoje)} / {formatarDuracao(s.ajustes.metaDiariaMin)}</span>
        </div>
        <div className="barra" style={{ marginTop: 8 }}><div style={{ width: `${Math.min(1, t.hoje / s.ajustes.metaDiariaMin) * 100}%` }} /></div>
        {prox && (
          <button className="btn primario grande" style={{ marginTop: 12 }} onClick={() => acoes.estudar(prox.id)}>
            Estudar {prox.nome} (próxima do ciclo)
          </button>
        )}
      </div>

      <h2>🔁 Revisões de hoje {revs.length ? `(${revs.length})` : ''}</h2>
      <div className="cartao">
        {revs.length === 0 && <div className="vazio" style={{ padding: 8 }}>Nada vencido. Cada assunto que você estudar ganha revisões em 1, 7, 30, 60 e 120 dias.</div>}
        {revs.map((r) => {
          const m = nomeM(r.materiaId);
          return (
            <div key={r.id} className="lista-item" style={{ alignItems: 'flex-start' }}>
              <span className="bolinha" style={{ background: m?.cor ?? '#999', marginTop: 6 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{nomeA(r.assuntoId)}</div>
                <div style={{ fontSize: 12, color: r.atrasoDias > 3 ? 'var(--perigo)' : 'var(--suave)' }}>
                  {m?.nome} · {r.etapa + 1}ª revisão · {r.atrasoDias === 0 ? 'vence hoje' : `${r.atrasoDias} dia(s) de atraso`}{r.atrasoDias > 3 ? ' · 🌿 mato no canteiro' : ''}
                </div>
                <div className="linha" style={{ marginTop: 8, gap: 6 }}>
                  <button className="btn verde" style={{ padding: '8px 6px', fontSize: 14 }} onClick={() => acoes.estudar(r.materiaId, r.assuntoId)}>Estudar agora</button>
                  <button className="btn" style={{ padding: '8px 6px', fontSize: 14 }} onClick={() => setRevisando(r.id)}>Revisei</button>
                  <button className="btn fantasma" style={{ padding: '8px 6px', fontSize: 14, flex: 'none' }} onClick={() => { atualizar((st) => adiarRevisao(st, r.id, 1)); avisar('Adiada para amanhã.'); }}>Adiar</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {erros.length > 0 && (
        <div className="cartao linha">
          <span>📕 <b>{erros.length}</b> erro(s) para revisar no caderno</span>
          <button className="btn primario" style={{ flex: 'none' }} onClick={() => acoes.irPara('erros')}>Revisar</button>
        </div>
      )}

      {revisando && <FormRevisei s={s} revisaoId={revisando} avisar={avisar} aoFechar={() => setRevisando(null)} />}
    </>
  );
}

function FormRevisei({ s, revisaoId, avisar, aoFechar }: { s: AppState; revisaoId: string; avisar: (t: string) => void; aoFechar: () => void }) {
  const [questoes, setQuestoes] = useState('');
  const [acertos, setAcertos] = useState('');
  const [banca, setBanca] = useState(bancaPadrao(s));
  const q = parseInt(questoes) || 0;
  const salvar = (soLeitura: boolean) => {
    const r = revisarAvulso(s, revisaoId, soLeitura ? {} : { questoes: q, acertos: Math.min(q, parseInt(acertos) || 0), banca: banca || undefined, formato: formatoDaBanca(banca) });
    if (!r.ok) return avisar('Para concluir com questões, registre pelo menos 5.');
    atualizar(() => r.state);
    avisar(r.moedas ? `Revisão feita! +${r.moedas} moedas 🔁` : 'Revisão feita! 🔁');
    aoFechar();
  };
  return (
    <Folha titulo="Como foi a revisão?" aoFechar={aoFechar}>
      <p style={{ marginTop: 0, fontSize: 14, color: 'var(--suave)' }}>Com questões, o próximo intervalo se ajusta ao seu acerto: acima de 85% ele cresce rápido; abaixo de 60% volta para amanhã.</p>
      <div className="linha">
        <label className="campo">Questões<input inputMode="numeric" value={questoes} onChange={(e) => setQuestoes(e.target.value.replace(/\D/g, ''))} placeholder="0" /></label>
        <label className="campo">Acertos<input inputMode="numeric" value={acertos} onChange={(e) => setAcertos(e.target.value.replace(/\D/g, ''))} placeholder="0" /></label>
      </div>
      <SeletorBanca valor={banca} aoMudar={setBanca} />
      <button className="btn primario grande" disabled={q < 5} onClick={() => salvar(false)}>Concluir com {q || 0} questões</button>
      <button className="btn grande" style={{ marginTop: 8 }} onClick={() => salvar(true)}>Revisei só lendo (sem questões)</button>
    </Folha>
  );
}

