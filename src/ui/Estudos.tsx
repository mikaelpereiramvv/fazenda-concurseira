import { useState } from 'react';
import { atualizar } from '../store';
import { itensCiclo, progressoCiclo } from '../domain/ciclo';
import { aplicarCicloSugerido, cicloSugerido, coberturaPonderada } from '../domain/desempenho';
import { errosDoDia, registrarQuestoesAvulsas, revisoesDoDia } from '../domain/revisoes';
import { formatarDuracao, novoId } from '../domain/datas';
import type { AppState, Materia, StatusAssunto } from '../domain/tipos';
import { CORES_MATERIA, Folha, SeletorBanca, formatoDaBanca, pct, perguntar } from './comum';
import { PainelHoje, bancaPadrao } from './Hoje';
import { CadernoErros } from './Erros';
import { Simulados } from './Simulados';
import { Provas } from './Provas';

const STATUS: Record<StatusAssunto, string> = { nao_visto: 'Não visto', teoria: 'Teoria', questoes: 'Questões', revisado: 'Revisado' };
const PESOS = { 1: 'baixa', 2: 'média', 3: 'alta' } as const;

export type SecaoEstudos = 'hoje' | 'ciclo' | 'edital' | 'erros' | 'simulados' | 'provas';

interface Props {
  s: AppState;
  avisar: (t: string) => void;
  estudar: (materiaId: string, assuntoId?: string) => void;
  secao: SecaoEstudos;
  setSecao: (x: SecaoEstudos) => void;
}

export function TelaEstudos({ s, avisar, estudar, secao, setSecao }: Props) {
  const nRev = revisoesDoDia(s).length;
  const nErros = errosDoDia(s).length;
  const abas: [SecaoEstudos, string][] = [
    ['hoje', `Hoje${nRev ? ` (${nRev})` : ''}`], ['ciclo', 'Ciclo'], ['edital', 'Edital'],
    ['erros', `Erros${nErros ? ` (${nErros})` : ''}`], ['simulados', 'Simulados'], ['provas', 'Provas'],
  ];
  return (
    <div className="pagina">
      <h1>Estudos</h1>
      <div className="segmentos rolavel" style={{ marginBottom: 14 }}>
        {abas.map(([k, r]) => <button key={k} className={secao === k ? 'ativo' : ''} onClick={() => setSecao(k)}>{r}</button>)}
      </div>
      {secao === 'hoje' && (
        s.materias.length === 0
          ? <div className="cartao">Comece cadastrando suas matérias e o edital na aba <b>Edital</b>. <button className="btn primario grande" style={{ marginTop: 10 }} onClick={() => setSecao('edital')}>Ir para o edital</button></div>
          : <PainelHoje s={s} avisar={avisar} acoes={{ estudar, irPara: (x) => setSecao(x) }} />
      )}
      {secao === 'ciclo' && <Ciclo s={s} avisar={avisar} />}
      {secao === 'edital' && <Edital s={s} avisar={avisar} />}
      {secao === 'erros' && <CadernoErros s={s} avisar={avisar} />}
      {secao === 'simulados' && <Simulados s={s} avisar={avisar} />}
      {secao === 'provas' && <Provas s={s} />}
    </div>
  );
}

// ---------------- Ciclo ----------------

function Ciclo({ s, avisar }: { s: AppState; avisar: (t: string) => void }) {
  const itens = itensCiclo(s);
  const [sugerindo, setSugerindo] = useState(false);
  return (
    <>
      <h2>Volta {s.ciclo.rodada}</h2>
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
            <p style={{ fontSize: 12, color: 'var(--suave)', margin: '8px 0 0' }}>
              A volta fecha quando todas batem o tempo; o que passar da meta vai para a próxima volta. O app sugere a matéria mais atrasada em proporção.
            </p>
          </>
        )}
      </div>
      {itens.length > 0 && <button className="btn grande" onClick={() => setSugerindo(true)}>✨ Sugerir tempos pelo edital e desempenho</button>}
      {sugerindo && <SugestaoCiclo s={s} avisar={avisar} aoFechar={() => setSugerindo(false)} />}
    </>
  );
}

function SugestaoCiclo({ s, avisar, aoFechar }: { s: AppState; avisar: (t: string) => void; aoFechar: () => void }) {
  const atualTotal = s.ciclo.minutosPorVolta ?? s.materias.filter((m) => m.ativa).reduce((a, m) => a + m.metaCicloMin, 0);
  const [total, setTotal] = useState(String(atualTotal));
  const T = Math.max(60, parseInt(total) || atualTotal);
  const sug = cicloSugerido(s, T);
  const semDados = s.materias.filter((m) => m.ativa && !m.questoesProva).length;
  return (
    <Folha titulo="Ciclo sugerido" aoFechar={aoFechar}>
      <p style={{ marginTop: 0, fontSize: 13, color: 'var(--suave)' }}>
        Peso na prova × dificuldade × distância até 80% de acerto × quanto do edital falta. Limites: 30 min e 2,5× a média.
        {semDados > 0 && ` ${semDados} matéria(s) sem nº de questões na prova: edite no Edital para melhorar a sugestão.`}
      </p>
      <label className="campo">Minutos por volta<input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/\D/g, ''))} /></label>
      <div className="cartao">
        {sug.map((x) => (
          <div key={x.materia.id} className="lista-item">
            <span className="bolinha" style={{ background: x.materia.cor }} />
            <span style={{ flex: 2, fontSize: 14 }}>{x.materia.nome}</span>
            <span style={{ fontSize: 13, color: 'var(--suave)' }}>{x.atual} →</span>
            <b style={{ flex: 'none', minWidth: 52, textAlign: 'right', color: x.sugerido > x.atual ? 'var(--mata)' : x.sugerido < x.atual ? 'var(--terra)' : undefined }}>{x.sugerido} min</b>
          </div>
        ))}
      </div>
      <button className="btn primario grande" onClick={() => {
        atualizar((st) => aplicarCicloSugerido(st, sug, T));
        avisar('Ciclo atualizado! O progresso da volta atual foi mantido.');
        aoFechar();
      }}>Aplicar</button>
    </Folha>
  );
}

// ---------------- Edital ----------------

function Edital({ s, avisar }: { s: AppState; avisar: (t: string) => void }) {
  const [editando, setEditando] = useState<Materia | 'nova' | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [novoAssunto, setNovoAssunto] = useState('');
  const [avulsas, setAvulsas] = useState(false);
  const ordenadas = [...s.materias].sort((a, b) => a.ordem - b.ordem);
  const cobTotal = coberturaPonderada(s);

  const mover = (id: string, d: -1 | 1) => atualizar((st) => {
    const lista = [...st.materias].sort((a, b) => a.ordem - b.ordem);
    const i = lista.findIndex((m) => m.id === id);
    const j = i + d;
    if (j < 0 || j >= lista.length) return st;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    return { ...st, materias: lista.map((m, k) => ({ ...m, ordem: k })) };
  });

  return (
    <>
      <div className="linha" style={{ marginBottom: 10 }}>
        <button className="btn primario" onClick={() => setEditando('nova')}>+ Matéria</button>
        <button className="btn" disabled={!s.materias.length} onClick={() => setAvulsas(true)}>+ Questões avulsas</button>
      </div>
      {cobTotal !== null && (
        <div className="cartao">
          <div className="linha" style={{ justifyContent: 'space-between' }}><b>Edital coberto (ponderado)</b><b style={{ flex: 'none' }}>{pct(cobTotal)}</b></div>
          <div className="barra" style={{ marginTop: 6 }}><div style={{ width: `${cobTotal * 100}%`, background: 'var(--mata)' }} /></div>
          <div style={{ fontSize: 12, color: 'var(--suave)', marginTop: 6 }}>Não visto 0 · teoria 0,4 · questões 0,7 · revisado 2+ vezes 1. Assuntos de incidência alta pesam mais.</div>
        </div>
      )}
      {ordenadas.map((m, idx) => {
        const assuntos = s.assuntos.filter((a) => a.materiaId === m.id);
        const cob = coberturaPonderada(s, m.id);
        return (
          <div key={m.id} className="cartao" style={{ opacity: m.ativa ? 1 : 0.6 }}>
            <div className="linha">
              <span className="bolinha" style={{ background: m.cor, flex: 'none' }} />
              <div style={{ flex: 4 }} onClick={() => setAberta(aberta === m.id ? null : m.id)}>
                <b>{m.nome}</b>
                <div style={{ fontSize: 12, color: 'var(--suave)' }}>
                  {formatarDuracao(m.metaCicloMin)} por volta · edital {cob === null ? '—' : pct(cob)}{m.questoesProva ? ` · ${m.questoesProva} questões na prova` : ''}
                </div>
              </div>
              <button className="btn" style={{ flex: 'none', padding: '6px 9px' }} disabled={idx === 0} onClick={() => mover(m.id, -1)}>↑</button>
              <button className="btn" style={{ flex: 'none', padding: '6px 9px' }} disabled={idx === ordenadas.length - 1} onClick={() => mover(m.id, 1)}>↓</button>
              <button className="btn" style={{ flex: 'none', padding: '6px 9px' }} onClick={() => setEditando(m)}>✎</button>
            </div>
            {aberta === m.id && (
              <div style={{ marginTop: 10 }}>
                {assuntos.map((a) => (
                  <div key={a.id} className="lista-item" style={{ flexWrap: 'wrap' }}>
                    <span style={{ flex: '1 1 100%', fontSize: 14 }}>{a.nome}{a.revisoesFeitas ? <span className="etiqueta" style={{ marginLeft: 6 }}>{a.revisoesFeitas} rev.</span> : null}</span>
                    <select className="btn" style={{ flex: 2, padding: '6px 8px', fontSize: 13 }} value={a.status}
                      onChange={(e) => atualizar((st) => ({ ...st, assuntos: st.assuntos.map((x) => x.id === a.id ? { ...x, status: e.target.value as StatusAssunto } : x) }))}>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select className="btn" style={{ flex: 2, padding: '6px 8px', fontSize: 13 }} value={a.peso ?? 2} aria-label="Incidência"
                      onChange={(e) => atualizar((st) => ({ ...st, assuntos: st.assuntos.map((x) => x.id === a.id ? { ...x, peso: Number(e.target.value) } : x) }))}>
                      {Object.entries(PESOS).map(([k, v]) => <option key={k} value={k}>Incidência {v}</option>)}
                    </select>
                    <button className="btn" style={{ flex: 'none', padding: '6px 9px' }} onClick={async () => {
                      if (await perguntar(`Remover o assunto "${a.nome}"?`, 'Remover')) atualizar((st) => ({ ...st, assuntos: st.assuntos.filter((x) => x.id !== a.id), revisoes: (st.revisoes ?? []).filter((r) => r.assuntoId !== a.id) }));
                    }}>✕</button>
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
      {avulsas && <QuestoesAvulsas s={s} avisar={avisar} aoFechar={() => setAvulsas(false)} />}
    </>
  );
}

function QuestoesAvulsas({ s, avisar, aoFechar }: { s: AppState; avisar: (t: string) => void; aoFechar: () => void }) {
  const [materiaId, setMateriaId] = useState(s.materias[0]?.id ?? '');
  const [assuntoId, setAssuntoId] = useState('');
  const [feitas, setFeitas] = useState('');
  const [acertos, setAcertos] = useState('');
  const [banca, setBanca] = useState(bancaPadrao(s));
  const assuntos = s.assuntos.filter((a) => a.materiaId === materiaId);
  const f = parseInt(feitas) || 0;
  return (
    <Folha titulo="Questões feitas fora do app" aoFechar={aoFechar}>
      <p style={{ marginTop: 0, fontSize: 13, color: 'var(--suave)' }}>Para questões resolvidas no Qconcursos, TEC etc. Entram nas métricas e concluem a revisão vencida do assunto (com 5+). Não dão moedas por questão, porque não há tempo medido. Para isso, use o cronômetro com "vou estudar em outro app".</p>
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
      <div className="linha">
        <label className="campo">Feitas<input inputMode="numeric" value={feitas} onChange={(e) => setFeitas(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="campo">Acertos<input inputMode="numeric" value={acertos} onChange={(e) => setAcertos(e.target.value.replace(/\D/g, ''))} /></label>
      </div>
      <SeletorBanca valor={banca} aoMudar={setBanca} />
      <button className="btn primario grande" disabled={!f || !materiaId} onClick={() => {
        let res = { moedas: 0, revisaoFeita: false };
        atualizar((st) => {
          const r = registrarQuestoesAvulsas(st, { materiaId, assuntoId: assuntoId || undefined, banca: banca || undefined, formato: formatoDaBanca(banca), feitas: f, acertos: Math.min(f, parseInt(acertos) || 0) });
          res = r;
          return r.state;
        });
        avisar(res.revisaoFeita ? `Registrado e revisão concluída!${res.moedas ? ` +${res.moedas} moedas` : ''} 🔁` : 'Questões registradas.');
        aoFechar();
      }}>Registrar {f || ''} questões</button>
    </Folha>
  );
}

function EditarMateria({ s, m, aoFechar }: { s: AppState; m: Materia | null; aoFechar: () => void }) {
  const [nome, setNome] = useState(m?.nome ?? '');
  const [cor, setCor] = useState(m?.cor ?? CORES_MATERIA[s.materias.length % CORES_MATERIA.length]);
  const [meta, setMeta] = useState(String(m?.metaCicloMin ?? 60));
  const [ativa, setAtiva] = useState(m?.ativa ?? true);
  const [questoesProva, setQuestoesProva] = useState(m?.questoesProva ? String(m.questoesProva) : '');
  const [pesoProva, setPesoProva] = useState(m?.pesoProva ? String(m.pesoProva) : '1');
  const [dificuldade, setDificuldade] = useState<1 | 2 | 3>(m?.dificuldade ?? 2);
  const [assuntosTexto, setAssuntosTexto] = useState('');
  return (
    <Folha titulo={m ? 'Editar matéria' : 'Nova matéria'} aoFechar={aoFechar}>
      <label className="campo">Nome<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Direito Constitucional" /></label>
      <label className="campo">Minutos por volta do ciclo<input inputMode="numeric" value={meta} onChange={(e) => setMeta(e.target.value.replace(/\D/g, ''))} /></label>
      <div className="linha">
        <label className="campo">Questões na prova<input inputMode="numeric" value={questoesProva} onChange={(e) => setQuestoesProva(e.target.value.replace(/\D/g, ''))} placeholder="ex.: 20" /></label>
        <label className="campo">Peso por questão<input inputMode="decimal" value={pesoProva} onChange={(e) => setPesoProva(e.target.value.replace(/[^\d.,]/g, ''))} /></label>
      </div>
      <div className="campo">Dificuldade para você
        <div className="segmentos">
          {([1, 2, 3] as const).map((d) => <button key={d} className={dificuldade === d ? 'ativo' : ''} onClick={() => setDificuldade(d)}>{['Fácil', 'Média', 'Difícil'][d - 1]}</button>)}
        </div>
      </div>
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
          atualizar((st) => ({ ...st, materias: st.materias.filter((x) => x.id !== m.id), assuntos: st.assuntos.filter((a) => a.materiaId !== m.id), revisoes: (st.revisoes ?? []).filter((r) => r.materiaId !== m.id) }));
          aoFechar();
        }}>Excluir</button>}
        <button className="btn primario" disabled={!nome.trim()} onClick={() => {
          const metaN = Math.max(0, parseInt(meta) || 0);
          const extra = {
            questoesProva: parseInt(questoesProva) || undefined,
            pesoProva: parseFloat(pesoProva.replace(',', '.')) || undefined,
            dificuldade,
          };
          if (m) atualizar((st) => ({ ...st, materias: st.materias.map((x) => x.id === m.id ? { ...x, nome: nome.trim(), cor, metaCicloMin: metaN, ativa, ...extra } : x) }));
          else {
            const id = novoId();
            const assuntos = assuntosTexto.split('\n').map((x) => x.trim()).filter(Boolean).map((n) => ({ id: novoId(), materiaId: id, nome: n, status: 'nao_visto' as const }));
            atualizar((st) => ({ ...st, materias: [...st.materias, { id, nome: nome.trim(), cor, metaCicloMin: metaN, ativa, ordem: st.materias.length, ...extra }], assuntos: [...st.assuntos, ...assuntos] }));
          }
          aoFechar();
        }}>Salvar</button>
      </div>
    </Folha>
  );
}
