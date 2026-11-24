# Foco e bloqueio com Atalhos (sem conta paga)

Nada aqui é inviolável: você mesmo pode desligar qualquer camada. O objetivo é **atrito + consequência no jogo**.

## 1. Modo Foco "Estudo"

1. *Ajustes › Foco › +* → Personalizado → nome **Estudo**.
2. Notificações: permita só contatos de emergência; em "Apps", deixe só a Fazenda e os apps de estudo.
3. Opcional: *Telas* → escolha uma página de tela de início só com Fazenda, PDF e Anki.

## 2. Atalhos chamados pelo app

No app **Atalhos**, crie dois atalhos com estes nomes exatos (dá para mudar em *Ajustes › Foco e bloqueio* no app):

| Nome | Ação |
| --- | --- |
| `Fazenda Foco On` | **Definir Foco** → Estudo → Ativado |
| `Fazenda Foco Off` | **Definir Foco** → Estudo → Desativado |

No app: *Ajustes › Ligar Modo Foco via Atalhos* → ativar → **Testar atalho**. Ao tocar em *Estudar*, o app abre o Atalhos, que roda em ~1 s e volta sozinho (via `fazenda://timer`).

## 3. Redirecionamento (Instagram, TikTok, YouTube, WhatsApp)

Para **cada** app:

1. Atalhos → *Automação* → **+** → **App** → escolha o app → *For Aberto* → **Executar Imediatamente** (e desative "Notificar ao Executar").
2. Ações:
   - **Sessão de estudo está ativa?** (ação da Fazenda Concurseira)
   - **Se** *Resultado* **for** *verdadeiro*:
     - **Abrir URLs** → `fazenda://tentativa?app=Instagram` (troque o nome do app)
   - **Fim do Se**

O app proibido pisca por menos de 1 s, você volta para a fazenda, e a tentativa fica registrada nas estatísticas.

> **Teste no primeiro build:** se a ação "Sessão de estudo está ativa?" **não** aparecer no Atalhos num app assinado com conta gratuita, use o plano B: no lugar dela, coloque a condição **Se Foco atual é Estudo** (ação "Obter Foco Atual", quando disponível na sua versão do iOS). Como o Foco Estudo só fica ligado durante a sessão, o efeito é o mesmo.

## 4. Saída do app (FocoGuard)

Funciona sozinho, sem configurar nada:

- Tela bloqueada: **não** pune.
- Trocar de app: começa uma tolerância (padrão de 15 s) com o aviso "volte para a fazenda".
- Passou da tolerância: as plantações **em crescimento** murcham e o tempo fora não conta. No **modo rigoroso**, a sessão também é encerrada.
- **"Vou estudar em outro app"**: ao iniciar, marque essa opção para usar PDF, Anki ou sites de questões sem punição.

## 5. Renovação automática do SideStore (opcional)

O SideStore expõe a renovação como ação do Atalhos. Crie uma automação semanal (ex.: domingo 20h) → *Atualizar todos os apps* do SideStore. Combine com o lembrete de backup do app.
