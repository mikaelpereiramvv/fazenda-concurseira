import { atualizar, salvarAgora, substituir } from '../store';
import { estadoInicial, gerarBackup, lerBackup } from '../domain/estado';
import { chaveDia, diffDias } from '../domain/datas';
import type { Ajustes, AppState } from '../domain/tipos';
import { ehNativo, escolherArquivo, exportarArquivo, rodarAtalho } from '../platform/nativo';
import { Chave, perguntar } from './comum';
import { tocar } from '../platform/sons';

export function TelaAjustes({ s, avisar }: { s: AppState; avisar: (t: string) => void }) {
  const a = s.ajustes;
  const set = <K extends keyof Ajustes>(k: K, v: Ajustes[K]) => atualizar((st) => ({ ...st, ajustes: { ...st.ajustes, [k]: v } }));
  const num = (k: keyof Ajustes, min = 0, max = 1440) => (
    <input type="number" inputMode="numeric" value={a[k] as number} min={min} max={max}
      onChange={(e) => set(k, Math.max(min, Math.min(max, parseInt(e.target.value) || 0)) as never)} />
  );
  const ultimoExt = s.registro.ultimoBackupExternoEm;
  const diasSemBackup = ultimoExt ? diffDias(ultimoExt, new Date()) : null;

  return (
    <div className="pagina">
      <h1>Ajustes</h1>

      {(diasSemBackup === null || diasSemBackup >= 7) && s.sessoes.length > 0 && (
        <div className="cartao" style={{ background: '#fde9c4' }}>
          💾 {diasSemBackup === null ? 'Você ainda não exportou nenhum backup.' : `Último backup há ${diasSemBackup} dias.`} Exporte para não perder o progresso se o app for apagado.
        </div>
      )}

      <h2>Metas</h2>
      <div className="cartao">
        <Chave rotulo="Meta diária (min)" dica="Padrão: 120 min (2 h)">{num('metaDiariaMin', 10)}</Chave>
        <Chave rotulo="Meta semanal (min)">{num('metaSemanalMin', 30, 10080)}</Chave>
      </div>

      <h2>Timer</h2>
      <div className="cartao">
        <Chave rotulo="Pomodoro (min)">{num('pomodoroMin', 5, 120)}</Chave>
        <Chave rotulo="Pausa curta (min)">{num('pausaMin', 1, 60)}</Chave>
        <Chave rotulo="Pausa máxima (min)" dica="Pausa mais longa encerra a sessão">{num('pausaMaxMin', 5, 240)}</Chave>
        <Chave rotulo="Tela mínima na sessão" dica="Só o relógio, sem ver a fazenda ao fundo">
          <input type="checkbox" className="toggle" checked={!!a.sessaoTelaMinima} onChange={(e) => set('sessaoTelaMinima', e.target.checked)} />
        </Chave>
      </div>

      <h2>Fazenda</h2>
      <div className="cartao">
        <Chave rotulo="Sons" dica="Cliques, colheita e moedas. Na sessão, só o fim do Pomodoro">
          <input type="checkbox" className="toggle" checked={!!a.sons} onChange={(e) => { set('sons', e.target.checked); if (e.target.checked) tocar('moeda', true); }} />
        </Chave>
      </div>

      <h2>Foco e bloqueio</h2>
      <div className="cartao">
        <Chave rotulo="Tolerância ao sair (s)" dica="Depois disso a plantação murcha">{num('toleranciaSaidaSeg', 5, 120)}</Chave>
        <Chave rotulo="Avisar ao sair" dica="Notificação “volte em alguns segundos”">
          <input type="checkbox" className="toggle" checked={a.avisarSaida} onChange={(e) => set('avisarSaida', e.target.checked)} />
        </Chave>
        <Chave rotulo="Modo rigoroso" dica="Sair além da tolerância também ENCERRA a sessão">
          <input type="checkbox" className="toggle" checked={a.encerrarAoSair} onChange={(e) => set('encerrarAoSair', e.target.checked)} />
        </Chave>
        <Chave rotulo="Ligar Modo Foco via Atalhos" dica="Roda os Atalhos abaixo ao iniciar/encerrar">
          <input type="checkbox" className="toggle" checked={a.usarAtalhoFoco} onChange={(e) => set('usarAtalhoFoco', e.target.checked)} />
        </Chave>
        <Chave rotulo="Atalho ao iniciar"><input type="text" value={a.atalhoOn} onChange={(e) => set('atalhoOn', e.target.value)} /></Chave>
        <Chave rotulo="Atalho ao encerrar"><input type="text" value={a.atalhoOff} onChange={(e) => set('atalhoOff', e.target.value)} /></Chave>
        <button className="btn grande" style={{ marginTop: 8 }} onClick={async () => {
          const ok = await rodarAtalho(a.atalhoOn, 'fazenda://');
          if (!ok) avisar(ehNativo ? 'Não consegui abrir o Atalhos. Confira o nome do atalho.' : 'Teste de Atalhos só funciona no iPhone.');
        }}>Testar atalho “{a.atalhoOn}”</button>
        {!ehNativo && (
          <Chave rotulo="Simular saída no navegador" dica="Trocar de aba conta como sair do app">
            <input type="checkbox" className="toggle" checked={a.simularSaidaNoNavegador} onChange={(e) => set('simularSaidaNoNavegador', e.target.checked)} />
          </Chave>
        )}
      </div>

      <h2>Apps</h2>
      <div className="cartao">
        <label className="campo">Redirecionar de volta à fazenda (automação do Atalhos)
          <input value={a.appsRedirecionar.join(', ')} onChange={(e) => set('appsRedirecionar', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
        </label>
        <label className="campo">Saída autorizada (apps de estudo)
          <input value={a.appsSaidaAutorizada.join(', ')} onChange={(e) => set('appsSaidaAutorizada', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} />
        </label>
        <p style={{ fontSize: 12, color: 'var(--suave)', margin: 0 }}>
          Para cada app da primeira lista, crie no Atalhos uma automação “Quando {a.appsRedirecionar[0] ?? 'Instagram'} for aberto” → Se
          “Sessão de estudo está ativa?” → Abrir URL <code>fazenda://tentativa?app={a.appsRedirecionar[0] ?? 'Instagram'}</code>. Passo a passo em docs/ATALHOS.md.
        </p>
        {s.registro.tentativas.length > 0 && <p style={{ fontSize: 13 }}>Tentativas de distração registradas: <b>{s.registro.tentativas.length}</b></p>}
      </div>

      <h2>Backup</h2>
      <div className="cartao">
        <p style={{ marginTop: 0, fontSize: 14 }}>
          Último backup exportado: <b>{ultimoExt ? new Date(ultimoExt).toLocaleDateString('pt-BR') : 'nunca'}</b>
          {s.registro.ultimoBackupAutoEm && <><br />Backup automático (Arquivos › No meu iPhone › Fazenda Concurseira › Backups): {new Date(s.registro.ultimoBackupAutoEm).toLocaleDateString('pt-BR')}</>}
        </p>
        <div className="linha">
          <button className="btn verde" onClick={async () => {
            await salvarAgora();
            const json = JSON.stringify(gerarBackup(s), null, 1);
            await exportarArquivo(`fazenda-${chaveDia(new Date())}.json`, json);
            atualizar((st) => ({ ...st, registro: { ...st.registro, ultimoBackupExternoEm: new Date().toISOString() } }));
          }}>Exportar</button>
          <button className="btn" onClick={async () => {
            const txt = await escolherArquivo();
            if (!txt) return;
            const r = lerBackup(txt);
            if (!r.ok) return avisar(r.erro);
            if (!(await perguntar(`Substituir TODOS os dados atuais por este backup?\n\n${r.resumo}`, 'Importar'))) return;
            if (s.sessaoAtiva) return avisar('Encerre a sessão de estudo antes de importar.');
            substituir(r.state);
            await salvarAgora();
            avisar('Backup importado! 🌾');
          }}>Importar</button>
        </div>
      </div>

      <h2>Zona de perigo</h2>
      <div className="cartao">
        <button className="btn perigo grande" onClick={async () => {
          if (!(await perguntar('Apagar TODOS os dados (estudos e fazenda)? Exporte um backup antes.', 'Apagar'))) return;
          if (!(await perguntar('Tem certeza mesmo? Não dá para desfazer.', 'Apagar tudo'))) return;
          substituir(estadoInicial());
          await salvarAgora();
          avisar('Tudo zerado. Fazenda nova!');
        }}>Apagar todos os dados</button>
      </div>
      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--suave)' }}>Fazenda Concurseira v0.1 · 100% offline · {ehNativo ? 'iPhone' : 'navegador'}</p>
    </div>
  );
}
