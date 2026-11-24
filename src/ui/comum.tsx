import { useEffect, useState, type ReactNode } from 'react';

export function Folha({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: ReactNode }) {
  return (
    <div className="fundo-folha" onClick={aoFechar}>
      <div className="folha" onClick={(e) => e.stopPropagation()}>
        <div className="alca" />
        <h3>{titulo}</h3>
        {children}
      </div>
    </div>
  );
}

export function Icone({ k, alt = '' }: { k: 'ui_moeda' | 'ui_xp' | 'ui_ofensiva' | 'ui_cadeado' | 'ui_relogio'; alt?: string }) {
  const [ok, setOk] = useState(true);
  const emoji = { ui_moeda: '🪙', ui_xp: '⭐', ui_ofensiva: '🔥', ui_cadeado: '🔒', ui_relogio: '⏰' }[k];
  if (!ok) return <span aria-label={alt}>{emoji}</span>;
  return <img className="ic-ui" src={`assets/ui/${k}.png`} alt={alt} onError={() => setOk(false)} />;
}

export function Moedas({ v }: { v: number }) {
  return <span className="preco"><Icone k="ui_moeda" />{v.toLocaleString('pt-BR')}</span>;
}

export function Chave({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <label className="chave">
      <span>{rotulo}{dica && <small>{dica}</small>}</span>
      {children}
    </label>
  );
}

export function Toast({ texto, aoSumir }: { texto: string | null; aoSumir: () => void }) {
  useEffect(() => {
    if (!texto) return;
    const t = setTimeout(aoSumir, Math.max(2500, texto.length * 60));
    return () => clearTimeout(t);
  }, [texto, aoSumir]);
  return texto ? <div className="toast" onClick={aoSumir}>{texto}</div> : null;
}

export const CORES_MATERIA = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#f39c12', '#7f8c8d', '#e84393', '#6c5ce7'];

// ---------- diálogo de confirmação próprio (confirm() nativo é bloqueado em alguns contextos) ----------
type Pedido = { texto: string; ok: string; resolver: (v: boolean) => void };
let abrirDialogo: ((p: Pedido) => void) | null = null;

export function perguntar(texto: string, ok = 'Confirmar'): Promise<boolean> {
  return new Promise((resolver) => {
    if (abrirDialogo) abrirDialogo({ texto, ok, resolver });
    else resolver(false);
  });
}

export function Dialogos() {
  const [p, setP] = useState<Pedido | null>(null);
  useEffect(() => { abrirDialogo = setP; return () => { abrirDialogo = null; }; }, []);
  if (!p) return null;
  const fechar = (v: boolean) => { p.resolver(v); setP(null); };
  return (
    <div className="fundo-folha" style={{ alignItems: 'center', justifyContent: 'center', zIndex: 90 }} onClick={() => fechar(false)}>
      <div className="cartao" style={{ width: 'min(92%, 380px)', margin: 0 }} onClick={(e) => e.stopPropagation()}>
        <p style={{ marginTop: 0, whiteSpace: 'pre-line', color: 'var(--texto)', textAlign: 'left' }}>{p.texto}</p>
        <div className="linha">
          <button className="btn" onClick={() => fechar(false)}>Cancelar</button>
          <button className="btn primario" onClick={() => fechar(true)}>{p.ok}</button>
        </div>
      </div>
    </div>
  );
}
