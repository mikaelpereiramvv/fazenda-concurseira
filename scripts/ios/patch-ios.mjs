#!/usr/bin/env node
// Ajusta o projeto iOS gerado pelo Capacitor sem precisar abrir o Xcode.
// Idempotente: pode rodar quantas vezes quiser (localmente ou no GitHub Actions).
//
//  1. Adiciona os .swift de ios/App/App/Native ao target "App" no project.pbxproj
//  2. Troca CAPBridgeViewController por MainViewController no SceneDelegate
//  3. Garante as chaves necessárias no Info.plist (URL scheme, Arquivos, orientação)
//  4. Ajusta deployment target mínimo (iOS 16, exigido pelo Modo de Desenvolvedor)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import xcode from 'xcode';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appDir = path.join(root, 'ios/App/App');
const pbxPath = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
const plistPath = path.join(appDir, 'Info.plist');
const sceneDelegatePath = path.join(appDir, 'SceneDelegate.swift');

if (!fs.existsSync(pbxPath)) {
  console.error('ios/ não encontrado. Rode "npx cap add ios" antes.');
  process.exit(1);
}

// ---------- 1. project.pbxproj ----------
const project = xcode.project(pbxPath);
project.parseSync();

const nativeFiles = fs
  .readdirSync(path.join(appDir, 'Native'))
  .filter((f) => f.endsWith('.swift'))
  .sort();

const appGroupKey = project.findPBXGroupKey({ name: 'App' }) ?? project.findPBXGroupKey({ path: 'App' });
if (!appGroupKey) throw new Error('Grupo "App" não encontrado no pbxproj');

const existing = new Set(
  Object.values(project.pbxFileReferenceSection())
    .filter((r) => r && typeof r === 'object' && r.path)
    .map((r) => String(r.path).replace(/"/g, '')),
);

let added = 0;
for (const f of nativeFiles) {
  const rel = `Native/${f}`;
  if (existing.has(rel) || existing.has(f)) continue;
  const file = project.addSourceFile(rel, {}, appGroupKey);
  if (!file) throw new Error(`Falha ao adicionar ${rel}`);
  added++;
}

// deployment target 16.0 em todas as configurações
const configs = project.pbxXCBuildConfigurationSection();
for (const key of Object.keys(configs)) {
  const cfg = configs[key];
  if (cfg && cfg.buildSettings && cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET) {
    cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.0';
  }
}

// node-xcode escreve "explicitFileType = undefined", que confunde o Xcode
const pbxOut = project
  .writeSync()
  .replace(/ explicitFileType = undefined;/g, '')
  .split('\n')
  .map((l) => (l.includes('path = "Native/') ? l.replace(' includeInIndex = 0;', '') : l))
  .join('\n');
fs.writeFileSync(pbxPath, pbxOut);
console.log(`pbxproj: ${added} arquivo(s) Swift adicionado(s); deployment target = 16.0`);

// ---------- 2. SceneDelegate ----------
let scene = fs.readFileSync(sceneDelegatePath, 'utf8');
if (scene.includes('CAPBridgeViewController()')) {
  scene = scene.replace('CAPBridgeViewController()', 'MainViewController()');
  fs.writeFileSync(sceneDelegatePath, scene);
  console.log('SceneDelegate: usando MainViewController');
}

// ---------- 3. Info.plist ----------
let plist = fs.readFileSync(plistPath, 'utf8');
const MARK = '<!-- fazenda-concurseira -->';
if (!plist.includes(MARK)) {
  // orientação só retrato no iPhone
  plist = plist.replace(
    /<key>UISupportedInterfaceOrientations<\/key>\s*<array>[\s\S]*?<\/array>/,
    `<key>UISupportedInterfaceOrientations</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>`,
  );
  const extra = `\t${MARK}
\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>br.fazendaconcurseira.app</string>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>fazenda</string>
\t\t\t</array>
\t\t</dict>
\t</array>
\t<key>LSApplicationQueriesSchemes</key>
\t<array>
\t\t<string>shortcuts</string>
\t</array>
\t<key>UIFileSharingEnabled</key>
\t<true/>
\t<key>LSSupportsOpeningDocumentsInPlace</key>
\t<true/>
\t<key>ITSAppUsesNonExemptEncryption</key>
\t<false/>
`;
  plist = plist.replace(/<\/dict>\s*<\/plist>\s*$/, `${extra}</dict>\n</plist>\n`);
  fs.writeFileSync(plistPath, plist);
  console.log('Info.plist: URL scheme fazenda://, Arquivos e orientação configurados');
}

console.log('patch-ios: ok');
