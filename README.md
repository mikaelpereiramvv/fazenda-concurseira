# 🌾 Fazenda Concurseira

Gestão de estudos estilo concurseiro (cronômetro, lançamento manual, ciclo de estudos, edital verticalizado, estatísticas) + uma fazendinha brasileira que cresce com o seu tempo de estudo. **100% offline**, sem conta paga da Apple e sem Mac.

**Stack:** Capacitor 8 · React 19 · Phaser 3 · TypeScript · Vite · Vitest. Código nativo mínimo em Swift (compilado só no GitHub Actions).

## O que tem (v0.3)

**Estudos:** cronômetro livre/Pomodoro com assunto, lançamento manual (só passado/hoje), ciclo de estudos com excedente e sugestão da matéria mais atrasada, **ciclo automático** por peso × dificuldade × desempenho, edital verticalizado com incidência, **revisões espaçadas** (1-7-30-60-120 dias ajustadas pelo acerto), painel **Hoje**, **caderno de erros** (Leitner), questões por assunto e **banca**, **simulados** com evolução, **provas** (PC-AL, PM-AL, PC-PE) com contagem regressiva e **ritmo** para fechar o edital, desempenho com **acerto ajustado**, tendência, **pontos fracos**, cobertura ponderada, índice de **foco**, relatório semanal, meta adaptativa e exportação **CSV**.

**Fazenda:** câmera que enquadra o terreno, céu com dia/noite pela hora real, sombras, "pop" ao comprar, plantas que crescem com animação depois do estudo, colheita com partículas, animais passeando, sessão contemplativa, resumo animado, sons opcionais, **enredo** da Vó Benedita com missões ligadas ao estudo, cartas e itens exclusivos, e **mato no canteiro** quando a revisão atrasa mais de 3 dias.

## Começo rápido (Windows)

```bash
npm install
npm run dev          # abre em http://localhost:5173 (e na rede: http://IP-do-PC:5173 no Safari do iPhone)
npm test             # regras de economia, ofensiva, validação, fazenda
npm run build        # checagem de tipos + build web
```

No navegador tudo funciona com versões "falsas" dos recursos nativos: dados no `localStorage`, sem notificações, e a punição por sair do app só acontece se você ligar *Ajustes › Simular saída no navegador*.

## Gerar o .ipa e instalar no iPhone (custo zero)

1. Suba este repositório para o GitHub como **público**: runners macOS padrão são gratuitos e ilimitados em repositórios públicos.
2. Todo push no `main` (ou uma tag `v*`) dispara o build. Também dá para rodar em *Actions › build-ipa › Run workflow*.
3. Ao terminar (~10–15 min), baixe o `FazendaConcurseira-*.ipa` em *Releases* (tags) ou nos artefatos do job.
4. **Uma vez só:** instale o [SideStore](https://sidestore.io) no iPhone seguindo o guia oficial (no Windows, pelo instalador indicado lá). Isso também gera o *pairing file* que permite renovar sem PC.
5. No iPhone: *Ajustes › Privacidade e Segurança › Modo de Desenvolvedor* (ativar e reiniciar).
6. No SideStore: **+** → escolha o `.ipa` no app Arquivos. Depois, *Ajustes › Geral › VPN e Gerenciamento de Dispositivo* → confie na sua Apple ID.
7. A assinatura gratuita dura **7 dias**. O SideStore renova pelo próprio iPhone; dá para agendar isso numa automação do Atalhos.

**Atualizar:** instale o novo `.ipa` com a mesma Apple ID. O app é sobrescrito e os **dados ficam**. Se a assinatura vencer, o app só não abre: os dados continuam lá até você renovar. Dados só se perdem se você **apagar o app** ou **trocar de Apple ID**, e para esses casos existe o backup.

## Backup

- *Ajustes › Exportar*: gera `fazenda-AAAA-MM-DD.json` e abre o compartilhamento (Arquivos, AirDrop, e-mail).
- *Ajustes › Importar*: valida o arquivo, mostra uma prévia e substitui tudo.
- Automático semanal em *Arquivos › No meu iPhone › Fazenda Concurseira › Backups* (8 últimos). **Essa pasta some se o app for apagado**, então exporte para fora de vez em quando; o app lembra se passar de 7 dias.

## Foco e bloqueio (sem Screen Time API)

Veja **[docs/ATALHOS.md](docs/ATALHOS.md)**. Resumo das camadas:

1. **Modo Foco** ligado e desligado por Atalho quando o timer começa e termina (silencia as notificações).
2. **Redirecionamento**: uma automação "quando Instagram/TikTok/YouTube/WhatsApp abrir" consulta *"Sessão de estudo está ativa?"* (App Intent do app) e te devolve para a fazenda.
3. **FocoGuard** (Swift): sair do app por mais de 15 s murcha as plantações em crescimento e o tempo fora não conta. Bloquear a tela **não** pune. O modo rigoroso (toggle) também encerra a sessão.

## Arte (Gemini → jogo)

Veja **[docs/ASSETS.md](docs/ASSETS.md)**. Resumo: coloque o PNG/JPG do Gemini (fundo branco) em `assets/raw/<chave>.jpg` e rode `npm run assets`. O script remove o fundo, redimensiona e gera o atlas do Phaser. Os itens sem arte aparecem como placeholders com o nome da chave.

## Estrutura

```
src/domain/        regras puras + testes (economia, níveis, ofensiva, ciclo, fazenda, validação)
src/config/economia.json   balanceamento (calibrado para 2 h/dia)
src/platform/      Capacitor: arquivo de dados, notificações, FocoGuard, Atalhos, backup
src/game/          cena Phaser isométrica + placeholders
src/ui/            telas React (Fazenda+Timer, Estatísticas, Estudos, Loja, Ajustes)
ios/App/App/Native Swift: FocoGuardPlugin, SessaoAtivaIntent, MainViewController
scripts/assets     pipeline de imagens (remover fundo, redimensionar, atlas)
scripts/ios        patch idempotente do projeto Xcode (sem abrir o Xcode)
.github/workflows  build-ipa (macOS) e pwa-pages (plano B)
```

## Licença

Código MIT. As ilustrações em `assets/raw` são suas.
