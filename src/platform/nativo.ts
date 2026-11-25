// Camada de plataforma: tudo que muda entre iPhone (Capacitor) e navegador/PWA.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const ehNativo = Capacitor.isNativePlatform();

// ---------------- FocoGuard (plugin Swift local) ----------------

export interface RelatorioAusencia { hasAbsence: boolean; awaySeconds: number; locked: boolean }

interface FocoGuardPlugin {
  arm(o: { graceSeconds: number; warn: boolean }): Promise<void>;
  disarm(): Promise<void>;
  report(): Promise<RelatorioAusencia>;
  openUrl(o: { url: string }): Promise<{ opened: boolean }>;
  setKeepAwake(o: { on: boolean }): Promise<void>;
  addListener(ev: 'returned', cb: (d: { awaySeconds: number; locked: boolean }) => void): Promise<PluginListenerHandle>;
}

// Versão web: simula a ausência com visibilitychange (sem saber se a tela foi bloqueada).
let webSaiuEm: number | null = null;
let webArmado = false;
const webListeners: ((d: { awaySeconds: number; locked: boolean }) => void)[] = [];
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!webArmado) return;
    if (document.hidden) webSaiuEm = Date.now();
    else if (webSaiuEm) {
      const d = { awaySeconds: (Date.now() - webSaiuEm) / 1000, locked: false };
      webSaiuEm = null;
      webListeners.forEach((l) => l(d));
    }
  });
}

export const FocoGuard = registerPlugin<FocoGuardPlugin>('FocoGuard', {
  web: {
    async arm() { webArmado = true; },
    async disarm() { webArmado = false; },
    async report() { return { hasAbsence: false, awaySeconds: 0, locked: false }; },
    async openUrl({ url }: { url: string }) { console.info('[web] abriria', url); return { opened: false }; },
    async setKeepAwake() {},
    async addListener(_ev: string, cb: (d: { awaySeconds: number; locked: boolean }) => void) {
      webListeners.push(cb);
      return { remove: async () => { webListeners.splice(webListeners.indexOf(cb), 1); } };
    },
  } as unknown as FocoGuardPlugin,
});

// ---------------- Armazenamento ----------------

const ARQ_DB = 'fazenda-db.json';
const CHAVE_WEB = 'fazenda-concurseira:db';

export async function lerBanco(): Promise<string | null> {
  if (ehNativo) {
    try {
      const r = await Filesystem.readFile({ path: ARQ_DB, directory: Directory.Library, encoding: Encoding.UTF8 });
      return typeof r.data === 'string' ? r.data : null;
    } catch { return null; }
  }
  try { return localStorage.getItem(CHAVE_WEB); } catch { return null; }
}

export async function salvarBanco(json: string): Promise<void> {
  if (ehNativo) {
    // grava em arquivo temporário e renomeia: nunca deixa o banco pela metade
    await Filesystem.writeFile({ path: `${ARQ_DB}.tmp`, data: json, directory: Directory.Library, encoding: Encoding.UTF8 });
    await Filesystem.rename({ from: `${ARQ_DB}.tmp`, to: ARQ_DB, directory: Directory.Library, toDirectory: Directory.Library });
    return;
  }
  try { localStorage.setItem(CHAVE_WEB, json); } catch { /* storage indisponível (modo privado) */ }
}

// ---------------- Preferências lidas pelo Atalhos ----------------

export async function marcarSessaoAtiva(ativa: boolean) {
  try { await Preferences.set({ key: 'sessaoAtiva', value: ativa ? 'true' : 'false' }); } catch { /* ok */ }
}

// ---------------- Notificações locais ----------------

const ID_POMODORO = 1001;
const ID_LEMBRETE_PAUSA = 1002;

export async function pedirPermissaoNotificacoes() {
  try { await LocalNotifications.requestPermissions(); } catch { /* web sem suporte */ }
}

export async function agendarNotificacao(id: 'pomodoro' | 'pausa', em: Date, titulo: string, corpo: string) {
  const nid = id === 'pomodoro' ? ID_POMODORO : ID_LEMBRETE_PAUSA;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: nid }] });
    await LocalNotifications.schedule({ notifications: [{ id: nid, title: titulo, body: corpo, schedule: { at: em, allowWhileIdle: true } }] });
  } catch { /* web */ }
}

export async function cancelarNotificacoes() {
  try { await LocalNotifications.cancel({ notifications: [{ id: ID_POMODORO }, { id: ID_LEMBRETE_PAUSA }] }); } catch { /* web */ }
}

// ---------------- Atalhos / Modo Foco ----------------

export async function rodarAtalho(nome: string, voltarPara = 'fazenda://timer') {
  const url = `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(nome)}&x-success=${encodeURIComponent(voltarPara)}`;
  try { return (await FocoGuard.openUrl({ url })).opened; } catch { return false; }
}

export async function telaSempreAcesa(on: boolean) {
  try { await FocoGuard.setKeepAwake({ on }); } catch { /* web */ }
}

// ---------------- Eventos do app ----------------

export function aoVoltarParaApp(cb: () => void) {
  if (ehNativo) App.addListener('appStateChange', (s) => { if (s.isActive) cb(); });
  else document.addEventListener('visibilitychange', () => { if (!document.hidden) cb(); });
}

export function aoAbrirUrl(cb: (url: URL) => void) {
  if (!ehNativo) return;
  App.addListener('appUrlOpen', ({ url }) => {
    try { cb(new URL(url)); } catch { /* url estranha */ }
  });
}

export async function vibrar() {
  try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch { /* web */ }
}

// ---------------- Backup ----------------

export async function exportarArquivo(nome: string, conteudo: string, tipo = 'application/json'): Promise<'compartilhado' | 'baixado'> {
  if (ehNativo) {
    const r = await Filesystem.writeFile({ path: nome, data: conteudo, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: nome, files: [r.uri] });
    return 'compartilhado';
  }
  const blob = new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return 'baixado';
}

/** Backup automático em Documentos/Backups (visível no app Arquivos), mantendo os 8 últimos. */
export async function backupAutomatico(nome: string, conteudo: string, manter = 8) {
  if (!ehNativo) return false;
  await Filesystem.writeFile({ path: `Backups/${nome}`, data: conteudo, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
  const lista = await Filesystem.readdir({ path: 'Backups', directory: Directory.Documents });
  const arquivos = lista.files.map((f) => f.name).filter((n) => n.startsWith('fazenda-auto-')).sort();
  for (const velho of arquivos.slice(0, Math.max(0, arquivos.length - manter))) {
    await Filesystem.deleteFile({ path: `Backups/${velho}`, directory: Directory.Documents });
  }
  return true;
}

export function escolherArquivo(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? await f.text() : null);
    };
    input.click();
  });
}
