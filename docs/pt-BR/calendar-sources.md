# Links das agendas

[English](../calendar-sources.md) · **Português (Brasil)**

O inkdoor lê qualquer agenda que tenha um link ICS (iCalendar). Adicione cada link no
[admin](server.md#admin) e, depois de salvar, aperte **Testar link**; ou cole em `config.toml`
e rode `inkdoor check` para conferir.

> **Esses links são secretos.** Quem tem o link consegue ler a agenda inteira, incluindo
> descrições e códigos de acesso de reuniões. Não publique o `config.toml` e, se um link vazar,
> gere outro (despublique e publique de novo).

## Microsoft 365 / Outlook

1. Entre em [outlook.office.com](https://outlook.office.com) com a conta.
2. Configurações → Calendário → **Calendários compartilhados**.
3. Em **Publicar um calendário**, escolha o calendário e a permissão
   **Pode ver todos os detalhes**. Clique em Publicar.
4. Copie o link **ICS** (o HTML é só para ver no navegador).

Repita em cada conta. Possíveis situações em contas corporativas:

| O que aparece | Resultado no inkdoor |
|---|---|
| Opção "Pode ver todos os detalhes" | Funciona completo, com títulos. |
| Só "Pode ver quando estou ocupado" | O status da porta funciona; a lista mostra "Ocupado" no lugar dos títulos. |
| Seção "Publicar" não aparece | A empresa bloqueou a publicação. |

Os fusos no formato do Windows (`E. South America Standard Time`, `Mountain Standard Time`…)
são convertidos automaticamente.

## Google Agenda

1. [calendar.google.com](https://calendar.google.com) → Configurações (engrenagem).
2. Clique na agenda, à esquerda.
3. Copie o **Endereço secreto no formato iCal**.

## TickTick

No TickTick para desktop ou na web:

1. Avatar → **Configurações** → **Integrações e Importação**.
2. Em **Outros**, abra **Assinar o TickTick**.
3. Clique em **Habilitar o URL**, escolha a lista e copie o link gerado (pode começar com
   `webcal://`; o inkdoor aceita).

Quais planos têm essa opção é decisão do TickTick; veja o
[artigo de ajuda](https://help.ticktick.com/articles/7055781574649839616) deles.

São mostradas as tarefas com data de hoje e as atrasadas (até `overdue_days` dias).
Tarefas concluídas são ignoradas.

## O que o inkdoor faz com cada compromisso

- Reuniões **canceladas** são ignoradas.
- Compromissos marcados como **disponível** (TRANSP) aparecem na lista, mas não deixam a porta
  como ocupada. O mesmo vale para eventos de dia inteiro, que aparecem como etiquetas.
- Links de Teams, Zoom e Meet no campo de local não são mostrados.
- Repetições do mesmo compromisso **dentro de uma agenda** são unificadas; agendas diferentes
  nunca se misturam.
- Se uma agenda não puder ser lida, os últimos dados bons do dia são reaproveitados e o rodapé
  avisa qual falhou. Se ainda não houver dado nenhum dela, a porta mostra "Bata antes" em vez
  de "Livre".
