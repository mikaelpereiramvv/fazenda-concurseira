import { useState } from 'react';
import { atualizar } from '../store';
import { MOTIVOS, criarErro, errosDe, errosDoDia, revisarErro } from '../domain/revisoes';
import type { AppState, MotivoErro } from '../domain/tipos';
import { Folha, SeletorBanca } from './comum';
import { bancaPadrao } from './Hoje';

export function CadernoErros({ s, avisar }: { s: AppState; avisar: (t: string) => void }) {
  const doDia = errosDoDia(s);
  const todos = errosDe(s);
  const [novo, setNovo] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [verResolvidos, setVerResolvidos] = useState(false);
  const porMotivo = new Map<MotivoErro, number>();
  for (const e of todos) porMotivo.set(e.motivo, (porMotivo.get(e.motivo) ?? 0) + 1);
  const nomeM = (id: string) => s.materias.find((m) => m.id === id)?.nome ?? '';
  const lista = todos.filter((e) => (verResolvidos ? !!e.resolvidoEm : !e.resolvidoEm)).sort((a, b) => a.proximaEm.localeCompare(b.proximaEm));

  return (
    <>
      <p style={{ marginTop: 0, fontSize: 14, color: 'var(--suave)' }}>
        Anote a questão que errou e o porquê. Ela volta em 1, 3, 7, 14 e 30 dias; acertou 5 vezes seguidas, sai do caderno.
      </p>
      <div className="linha" style={{ marginBottom: 12 }}>
        <button className="btn primario" disabled={!doDia.length} onClick={() => setRevisando(true)}>Revisar agora ({doDia.length})</button>
        <button className="btn verde" onClick={() => setNovo(true)}>+ Anotar erro</button>
      </div>
      {porMotivo.size > 0 && (
        <div className="cartao">
          <b>Por que você erra</b>
          {[...porMotivo.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => (
            <div key={m} style={{ marginTop: 6 }}>
              <div className="linha" style={{ fontSize: 13 }}><span>{MOTIVOS[m]}</span><span style={{ textAlign: 'right', flex: 'none' }}>{n}</span></div>
              <div className="barra"><div style={{ width: `${(n / todos.length) * 100}%`, background: 'var(--terra-2)' }} /></div>
            </div>
          ))}
        </div>
      )}
      <div className="segmentos" style={{ marginBottom: 8 }}>
        <button className={!verResolvidos ? 'ativo' : ''} onClick={() => setVerResolvidos(false)}>No caderno</button>
        <button className={verResolvidos ? 'ativo' : ''} onClick={() => setVerResolvidos(true)}>Resolvidos</button>
      </div>
      <div className="cartao">
        {lista.length === 0 && <div className="vazio" style={{ padding: 8 }}>{verResolvidos ? 'Nenhum erro resolvido ainda.' : 'Caderno vazio. Bom sinal, ou falta anotar?'}</div>}
        {lista.map((e) => (
          <div key={e.id} className="lista-item" style={{ alignItems: 'flex-start' }}>
            <span className="etiqueta" style={{ flex: 'none' }}>caixa {e.caixa}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14 }}>{e.enunciado}</div>
              <div style={{ fontSize: 12, color: 'var(--suave)' }}>{nomeM(e.materiaId)} · {MOTIVOS[e.motivo]}{e.banca ? ` · ${e.banca}` : ''} · volta em {new Date(`${e.proximaEm}T12:00`).toLocaleDateString('pt-BR')}</div>
            </div>
          </div>
        ))}
      </div>
      {novo && <NovoErro s={s} aoFechar={() => setNovo(false)} avisar={avisar} />}
      {revisando && <RevisarErros s={s} aoFechar={() => setRevisando(false)} avisar={avisar} />}
    </>
  );
}

function NovoErro({ s, aoFechar, avisar }: { s: AppState; aoFechar: () => void; avisar: (t: string) => void }) {
  const [materiaId, setMateriaId] = useState(s.materias[0]?.id ?? '');
  const [assuntoId, setAssuntoId] = useState('');
  const [enunciado, setEnunciado] = useState('');
  const [explicacao, setExplicacao] = useState('');
  const [motivo, setMotivo] = useState<MotivoErro>('conteudo');
  const [banca, setBanca] = useState(bancaPadrao(s));
  const assuntos = s.assuntos.filter((a) => a.materiaId === materiaId);
  return (
    <Folha titulo="Anotar erro" aoFechar={aoFechar}>
      <label className="campo">Matéria
        <select value={materiaId} onChange={(e) => { setMateriaId(e.target.value); setAssuntoId(''); }}>
          {s.materias.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </label>
      {assuntos.length > 0 && (
        <label className="campo">Assunto
          <select value={assuntoId} onChange={(e) => setAssuntoId(e.target.value)}>
            <option value="">—</option>
            {assuntos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </label>
      )}
      <label className="campo">O que a questão cobrava (resumo)<textarea rows={3} value={enunciado} onChange={(e) => setEnunciado(e.target.value)} placeholder="Ex.: Crase antes de pronome demonstrativo 'aquele'" /></label>
      <label className="campo">Resposta certa / por quê (o que lembrar)<textarea rows={3} value={explicacao} onChange={(e) => setExplicacao(e.target.value)} placeholder="Ex.: a + aquele = àquele" /></label>
      <label className="campo">Por que errei
        <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoErro)}>
          {Object.entries(MOTIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <SeletorBanca valor={banca} aoMudar={setBanca} />
      <button className="btn primario grande" disabled={!materiaId || !enunciado.trim()} onClick={() => {
        atualizar((st) => criarErro(st, { materiaId, assuntoId: assuntoId || undefined, enunciado: enunciado.trim(), explicacao: explicacao.trim() || undefined, motivo, banca: banca || undefined }));
        avisar('Anotado. Volta amanhã para você revisar. 📕');
        aoFechar();
      }}>Salvar no caderno</button>
    </Folha>
  );
}

function RevisarErros({ s, aoFechar, avisar }: { s: AppState; aoFechar: () => void; avisar: (t: string) => void }) {
  const [fila] = useState(() => errosDoDia(s).map((e) => e.id));
  const [i, setI] = useState(0);
  const [mostrar, setMostrar] = useState(false);
  const [placar, setPlacar] = useState({ certos: 0, moedas: 0 });
  const atual = (s.erros ?? []).find((e) => e.id === fila[i]);
  if (!atual) {
    return (
      <Folha titulo="Revisão concluída 📕" aoFechar={aoFechar}>
        <div className="cartao">Você acertou <b>{placar.certos}</b> de <b>{fila.length}</b>.{placar.moedas ? ` +${placar.moedas} moedas.` : ''}</div>
        <button className="btn primario grande" onClick={aoFechar}>Fechar</button>
      </Folha>
    );
  }
  const responder = (acertou: boolean) => {
    let moedas = 0, resolvido = false;
    atualizar((st) => { const r = revisarErro(st, atual.id, acertou); moedas = r.moedas; resolvido = r.resolvido; return r.state; });
    if (resolvido) avisar('Resolvido! Saiu do caderno. 🎉');
    setPlacar((p) => ({ certos: p.certos + (acertou ? 1 : 0), moedas: p.moedas + moedas }));
    setMostrar(false);
    setI(i + 1);
  };
  return (
    <Folha titulo={`Erro ${i + 1} de ${fila.length}`} aoFechar={aoFechar}>
      <div className="cartao flashcard">
        <div style={{ fontSize: 12, color: 'var(--suave)' }}>{s.materias.find((m) => m.id === atual.materiaId)?.nome} · caixa {atual.caixa}</div>
        <div style={{ fontSize: 18, fontWeight: 700, margin: '8px 0' }}>{atual.enunciado}</div>
        {mostrar
          ? <div className="resposta">{atual.explicacao || <i>(sem anotação da resposta)</i>}</div>
          : <button className="btn grande" onClick={() => setMostrar(true)}>Mostrar resposta</button>}
      </div>
      {mostrar && (
        <div className="linha">
          <button className="btn perigo grande" onClick={() => responder(false)}>Errei de novo</button>
          <button className="btn verde grande" onClick={() => responder(true)}>Acertei</button>
        </div>
      )}
    </Folha>
  );
}
