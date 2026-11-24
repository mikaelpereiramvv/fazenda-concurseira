import { useMemo, useState } from 'react';
import { atualizar } from '../store';
import { totais, ultimosDias, porMateria, mapaCalor } from '../domain/estatisticas';
import { calcularOfensiva } from '../domain/ofensiva';
import { chaveDia, formatarDuracao, somarDias } from '../domain/datas';
import { MENSAGENS_ERRO, validarLancamento } from '../domain/lancamento';
import { excluirSessao, registrarSessao } from '../domain/estado';
import type { AppState, ResumoSessao } from '../domain/tipos';
import { Folha, Icone, perguntar } from './comum';
import { ResumoFinal } from './Fazenda';

export function TelaEstatisticas({ s, avisar }: { s: AppState; avisar: (t: string) => void }) {
  const t = totais(s.sessoes);
  const ofensiva = calcularOfensiva(s);
  const dias = ultimosDias(s.sessoes, 7);
  const mats = porMateria(s);
  const calor = mapaCalor(s.sessoes, 12);
  const [lancando, setLancando] = useState(false);
  const [resumo, setResumo] = useState<ResumoSessao | null>(null);
  const [verTudo, setVerTudo] = useState(false);
  const cor = (id: string) => s.materias.find((m) => m.id === id)?.cor ?? '#999';
  const nome = (id: string) => s.materias.find((m) => m.id === id)?.nome ?? '—';
  const historico = useMemo(() => [...s.sessoes].sort((a, b) => b.inicio.localeCompare(a.inicio)), [s.sessoes]);
  const maxDia = Math.max(s.ajustes.metaDiariaMin, ...dias.map((d) => d.total));

  return (
    <div className="pagina">
      <div className="linha" style={{ alignItems: 'baseline' }}>
        <h1>Estatísticas</h1>
        <button className="btn primario" style={{ flex: 'none' }} onClick={() => setLancando(true)}>+ Lançar estudo</button>
      </div>

      <div className="grade-cartoes">
        <div className="mini"><div className="v">{formatarDuracao(t.hoje)}</div><div className="r">hoje · meta {formatarDuracao(s.ajustes.metaDiariaMin)}</div></div>
        <div className="mini"><div className="v">{formatarDuracao(t.semana)}</div><div className="r">semana</div></div>
        <div className="mini"><div className="v">{formatarDuracao(t.mes)}</div><div className="r">mês</div></div>
      </div>
      <div className="cartao linha">
        <div><Icone k="ui_ofensiva" /> <b>{ofensiva} dia(s)</b> de ofensiva</div>
        <div style={{ textAlign: 'right', color: 'var(--suave)', fontSize: 13 }}>🧊 {s.jogador.congeladores} congelador(es)</div>
      </div>

      <h2>Últimos 7 dias</h2>
      <div className="cartao grafico">
        <svg viewBox="0 0 320 150" role="img" aria-label="Minutos estudados por dia">
          <line x1="0" x2="320" y1={130 - (s.ajustes.metaDiariaMin / maxDia) * 115} y2={130 - (s.ajustes.metaDiariaMin / maxDia) * 115} stroke="#b8a68f" strokeDasharray="4 4" />
          {dias.map((d, i) => {
            let y = 130;
            const x = 10 + i * 44;
            return (
              <g key={d.dia}>
                {Object.entries(d.porMateria).map(([mid, min]) => {
                  const h = (min / maxDia) * 115;
                  y -= h;
                  return <rect key={mid} x={x} y={y} width="30" height={h} fill={cor(mid)} rx="3" />;
                })}
                {d.manual > 0 && <rect x={x} y={130 - (d.manual / maxDia) * 115} width="30" height={(d.manual / maxDia) * 115} fill="#fff" opacity="0.45" />}
                <text x={x + 15} y="145" fontSize="10" textAnchor="middle" fill="#7d6656">{d.rotulo}</text>
                {d.total > 0 && <text x={x + 15} y={y - 3} fontSize="9" textAnchor="middle" fill="#4a2c1a">{Math.round(d.total / 6) / 10}h</text>}
              </g>
            );
          })}
        </svg>
        <div className="legenda"><span>- - - meta diária</span><span>faixa clara = lançamento manual</span></div>
      </div>

      <h2>Por matéria (total)</h2>
      <div className="cartao">
        {mats.length === 0 && <div className="vazio">Nenhum estudo registrado ainda.</div>}
        {mats.map((m) => (
          <div key={m.materia.id} className="lista-item">
            <span className="bolinha" style={{ background: m.materia.cor }} />
            <span style={{ flex: 1 }}>{m.materia.nome}</span>
            {m.questoes > 0 && <span className="etiqueta">{Math.round((m.acertos / m.questoes) * 100)}% acertos</span>}
            <b>{formatarDuracao(m.min)}</b>
          </div>
        ))}
      </div>

      <h2>Constância (12 semanas)</h2>
      <div className="cartao">
        <div className="calor">
          {calor.map((c) => (
            <div key={c.dia} title={`${c.dia}: ${c.min} min`} style={{
              background: c.min === 0 ? '#ebdcc0' : c.min < 30 ? '#c5e1a5' : c.min < s.ajustes.metaDiariaMin ? '#8bc34a' : '#2f6b3a',
            }} />
          ))}
        </div>
      </div>

      <h2>Histórico</h2>
      <div className="cartao">
        {historico.length === 0 && <div className="vazio">As sessões do cronômetro e os lançamentos manuais aparecem aqui.</div>}
        {(verTudo ? historico : historico.slice(0, 15)).map((x) => (
          <div key={x.id} className="lista-item">
            <span className="bolinha" style={{ background: cor(x.materiaId) }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{nome(x.materiaId)}</div>
              <div style={{ fontSize: 12, color: 'var(--suave)' }}>
                {new Date(x.inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {new Date(x.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                {x.questoes ? ` · ${x.acertos}/${x.questoes} questões` : ''}{x.penalizada ? ' · 🥀' : ''}
              </div>
            </div>
            <span className={`etiqueta ${x.origem === 'manual' ? 'manual' : 'cron'}`}>{x.origem === 'manual' ? 'manual' : 'cronômetro'}</span>
            <b style={{ minWidth: 54, textAlign: 'right' }}>{formatarDuracao(x.duracaoMin)}</b>
            <button className="btn" style={{ flex: 'none', padding: '4px 8px' }} onClick={async () => {
              if (await perguntar('Excluir esta sessão do histórico?\n(XP e moedas já ganhos não são devolvidos.)', 'Excluir')) atualizar((st) => excluirSessao(st, x.id));
            }}>✕</button>
          </div>
        ))}
        {historico.length > 15 && !verTudo && <button className="btn grande" onClick={() => setVerTudo(true)}>Ver tudo ({historico.length})</button>}
      </div>

      {lancando && <LancamentoManual s={s} aoFechar={() => setLancando(false)} aoSalvar={(r) => { setLancando(false); setResumo(r); avisar('Estudo lançado!'); }} />}
      {resumo && <ResumoFinal resumo={resumo} aoFechar={() => setResumo(null)} />}
    </div>
  );
}

function LancamentoManual({ s, aoFechar, aoSalvar }: { s: AppState; aoFechar: () => void; aoSalvar: (r: ResumoSessao) => void }) {
  const hoje = chaveDia(new Date());
  const [materiaId, setMateriaId] = useState(s.materias.find((m) => m.ativa)?.id ?? '');
  const [assuntoId, setAssuntoId] = useState('');
  const [data, setData] = useState(hoje);
  const [hora, setHora] = useState('08:00');
  const [h, setH] = useState('1');
  const [m, setM] = useState('0');
  const [questoes, setQuestoes] = useState('');
  const [acertos, setAcertos] = useState('');
  const dur = (parseInt(h) || 0) * 60 + (parseInt(m) || 0);
  const inicio = new Date(`${data}T${hora || '00:00'}`);
  const v = validarLancamento({ materiaId, assuntoId: assuntoId || undefined, inicio, duracaoMin: dur }, s.sessoes);
  const assuntos = s.assuntos.filter((a) => a.materiaId === materiaId);
  const limiteRecuperacao = chaveDia(somarDias(new Date(), -2));

  return (
    <Folha titulo="Lançar estudo passado" aoFechar={aoFechar}>
      {s.materias.length === 0 ? <div className="vazio">Cadastre matérias na aba Estudos primeiro.</div> : (
        <>
          <label className="campo">Matéria
            <select value={materiaId} onChange={(e) => { setMateriaId(e.target.value); setAssuntoId(''); }}>
              {s.materias.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </label>
          {assuntos.length > 0 && (
            <label className="campo">Assunto (opcional)
              <select value={assuntoId} onChange={(e) => setAssuntoId(e.target.value)}>
                <option value="">—</option>
                {assuntos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </label>
          )}
          <div className="linha">
            <label className="campo">Data<input type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value > hoje ? hoje : e.target.value)} /></label>
            <label className="campo">Início<input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
          </div>
          <div className="linha">
            <label className="campo">Horas<input inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, ''))} /></label>
            <label className="campo">Minutos<input inputMode="numeric" value={m} onChange={(e) => setM(e.target.value.replace(/\D/g, ''))} /></label>
          </div>
          <div className="linha">
            <label className="campo">Questões<input inputMode="numeric" value={questoes} onChange={(e) => setQuestoes(e.target.value.replace(/\D/g, ''))} placeholder="0" /></label>
            <label className="campo">Acertos<input inputMode="numeric" value={acertos} onChange={(e) => setAcertos(e.target.value.replace(/\D/g, ''))} placeholder="0" /></label>
          </div>
          {v.erros.map((e) => <p key={e} style={{ color: 'var(--perigo)', fontSize: 14, margin: '4px 0' }}>⚠ {MENSAGENS_ERRO[e]}</p>)}
          {v.avisos.map((a) => <p key={a} style={{ color: '#8a5a00', fontSize: 13, margin: '4px 0' }}>{a}</p>)}
          <p style={{ fontSize: 12, color: 'var(--suave)' }}>
            Lançamento manual: 100% do XP e 50% das moedas.{data < limiteRecuperacao ? ' Datas com mais de 2 dias não recuperam a ofensiva.' : ''}
          </p>
          <button className="btn primario grande" disabled={v.erros.length > 0} onClick={() => {
            const q = parseInt(questoes) || 0;
            let res: ResumoSessao | null = null;
            atualizar((st) => {
              const r = registrarSessao(st, {
                materiaId, assuntoId: assuntoId || undefined, inicio, duracaoMin: dur, origem: 'manual',
                questoes: q || undefined, acertos: q ? Math.min(parseInt(acertos) || 0, q) : undefined,
              });
              res = r.resumo;
              return r.state;
            });
            if (res) aoSalvar(res);
          }}>Lançar {dur > 0 ? formatarDuracao(dur) : ''}</button>
        </>
      )}
    </Folha>
  );
}
