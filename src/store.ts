import { useSyncExternalStore } from 'react';
import { estadoInicial, migrar, gerarBackup } from './domain/estado';
import { aplicarCongeladores } from './domain/ofensiva';
import { chaveDia, diffDias } from './domain/datas';
import type { AppState } from './domain/tipos';
import { backupAutomatico, lerBanco, salvarBanco } from './platform/nativo';

let estado: AppState = estadoInicial();
let carregado = false;
const ouvintes = new Set<() => void>();
let timerSalvar: ReturnType<typeof setTimeout> | null = null;

export function obter(): AppState { return estado; }

export function atualizar(fn: (s: AppState) => AppState) {
  const novo = fn(estado);
  if (novo === estado) return;
  estado = novo;
  ouvintes.forEach((l) => l());
  agendarSalvar();
}

export function substituir(s: AppState) { atualizar(() => s); }

function agendarSalvar() {
  if (!carregado) return;
  if (timerSalvar) clearTimeout(timerSalvar);
  timerSalvar = setTimeout(salvarAgora, 300);
}

export async function salvarAgora() {
  if (timerSalvar) { clearTimeout(timerSalvar); timerSalvar = null; }
  await salvarBanco(JSON.stringify(estado));
}

export function useApp(): AppState {
  return useSyncExternalStore((l) => { ouvintes.add(l); return () => ouvintes.delete(l); }, obter, obter);
}

/** Carrega do disco, aplica congeladores pendentes e faz o backup automático semanal. */
export async function iniciarStore(): Promise<{ congeladoresUsados: string[] }> {
  const bruto = await lerBanco();
  if (bruto) {
    try { estado = migrar(JSON.parse(bruto)); } catch { console.error('Banco corrompido; começando do zero.'); }
  }
  carregado = true;
  const r = aplicarCongeladores(estado);
  estado = r.state;
  ouvintes.forEach((l) => l());
  await salvarAgora();

  const ultimo = estado.registro.ultimoBackupAutoEm;
  if (!ultimo || diffDias(ultimo, new Date()) >= 7) {
    try {
      const ok = await backupAutomatico(`fazenda-auto-${chaveDia(new Date())}.json`, JSON.stringify(gerarBackup(estado)));
      if (ok) atualizar((s) => ({ ...s, registro: { ...s.registro, ultimoBackupAutoEm: new Date().toISOString() } }));
    } catch (e) { console.warn('backup automático falhou', e); }
  }
  return { congeladoresUsados: r.usados };
}
