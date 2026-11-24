import { useCallback, useEffect, useState } from 'react';
import { atualizar, iniciarStore, useApp } from './store';
import { TelaFazenda, type PedidoColocacao } from './ui/Fazenda';
import { TelaEstatisticas } from './ui/Estatisticas';
import { TelaEstudos } from './ui/Estudos';
import { TelaLoja } from './ui/Loja';
import { TelaAjustes } from './ui/Ajustes';
import { Dialogos, Toast } from './ui/comum';
import { checarRelatorioNativo, definirAvisador, ouvirAusencias } from './sessao';
import { aoAbrirUrl, aoVoltarParaApp } from './platform/nativo';

type Aba = 'fazenda' | 'estatisticas' | 'estudos' | 'loja' | 'ajustes';

const ABAS: { id: Aba; ic: string; rotulo: string }[] = [
  { id: 'fazenda', ic: '🌾', rotulo: 'Fazenda' },
  { id: 'estatisticas', ic: '📊', rotulo: 'Estatísticas' },
  { id: 'estudos', ic: '📚', rotulo: 'Estudos' },
  { id: 'loja', ic: '🛒', rotulo: 'Loja' },
  { id: 'ajustes', ic: '⚙️', rotulo: 'Ajustes' },
];

export default function App() {
  const s = useApp();
  const [pronto, setPronto] = useState(false);
  const [aba, setAba] = useState<Aba>('fazenda');
  const [toast, setToast] = useState<string | null>(null);
  const [colocacao, setColocacao] = useState<PedidoColocacao | null>(null);
  const avisar = useCallback((t: string) => setToast(t), []);
  const fecharToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    definirAvisador(avisar);
    iniciarStore().then(({ congeladoresUsados }) => {
      setPronto(true);
      if (congeladoresUsados.length) avisar(`🧊 ${congeladoresUsados.length} congelador(es) salvaram sua ofensiva!`);
    });
    ouvirAusencias();
    aoVoltarParaApp(() => { checarRelatorioNativo(); });
    aoAbrirUrl((url) => {
      // fazenda://tentativa?app=Instagram  (vindo da automação do Atalhos)
      if (url.host === 'tentativa' || url.pathname.includes('tentativa')) {
        const app = url.searchParams.get('app') ?? 'app proibido';
        atualizar((st) => ({ ...st, registro: { ...st.registro, tentativas: [...st.registro.tentativas, { em: new Date().toISOString(), app }] } }));
        avisar(`Opa! Nada de ${app} agora. Sua fazenda está esperando. 🌱`);
        setAba('fazenda');
      }
    });
  }, [avisar]);

  if (!pronto) return <div className="vazio" style={{ paddingTop: '40vh' }}>🌾 Carregando a fazenda…</div>;

  const emSessao = !!s.sessaoAtiva;
  return (
    <div className="app">
      <div className="conteudo">
        {aba === 'fazenda' && <TelaFazenda s={s} avisar={avisar} colocacao={colocacao} setColocacao={setColocacao} irPara={(a) => setAba(a)} />}
        {aba === 'estatisticas' && <TelaEstatisticas s={s} avisar={avisar} />}
        {aba === 'estudos' && <TelaEstudos s={s} />}
        {aba === 'loja' && <TelaLoja s={s} avisar={avisar} colocar={(c) => { setColocacao(c); setAba('fazenda'); }} />}
        {aba === 'ajustes' && <TelaAjustes s={s} avisar={avisar} />}
      </div>
      {!emSessao && (
        <nav className="abas">
          {ABAS.map((a) => (
            <button key={a.id} className={aba === a.id ? 'ativa' : ''} onClick={() => setAba(a.id)}>
              <span className="ic">{a.ic}</span>{a.rotulo}
            </button>
          ))}
        </nav>
      )}
      <Toast texto={toast} aoSumir={fecharToast} />
      <Dialogos />
    </div>
  );
}
