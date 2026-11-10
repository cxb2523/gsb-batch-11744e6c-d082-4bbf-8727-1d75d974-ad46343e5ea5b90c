# Solução de problemas

[English](../troubleshooting.md) · **Português (Brasil)**

Comece pelos dois comandos que respondem à maioria das dúvidas, no servidor (num container do
Proxmox, coloque `pct exec <id> --` na frente):

```sh
inkdoor check                          # testa cada link de agenda e de tarefas
journalctl -u inkdoor -n 50 --no-pager # o log recente do serviço
```

Nenhum dos dois mostra links de agenda, então dá para colar a saída numa issue.

## O que a porta mostra

| Tela | O que significa | O que fazer |
|---|---|---|
| **CONFIGURAÇÃO** · *o inkdoor está quase pronto* | Nenhuma agenda e nenhuma lista de tarefas tem link ainda. | Abra o endereço do admin que aparece na tela e adicione suas agendas. |
| **BATA ANTES** · *agenda indisponível* | Uma agenda que marca você como ocupado não pôde ser lida, e não há dados dela hoje. A linha de baixo diz qual. | Rode `inkdoor check` ou aperte **Testar link** nessa agenda no admin. Veja [os resultados do Testar link](#resultados-do-testar-link-e-do-inkdoor-check). |
| **BATA ANTES** · *sem agenda que marque ocupado* | Há agendas configuradas, mas nenhuma marca você como ocupado, então a porta não tem como saber quando você está livre. | No admin, edite a agenda das suas reuniões e ligue **Marca você como ocupado**. |
| **BATA ANTES** · *endereço não permitido* | O Kindle chegou ao servidor por um nome que não está liberado. | Use o IP do servidor na `URL` do Kindle ou adicione o nome em `allowed_hosts` ([detalhes](server.md#abrindo-o-admin-por-nome)). |
| **BATA ANTES** · *erro no painel* | O próprio inkdoor não conseguiu desenhar a tela. O tipo do erro aparece embaixo. | Veja o log do serviço e [abra uma issue](https://github.com/frkey/inkdoor/issues/new/choose) com ele. |
| **BATA ANTES** · *erro no painel*, "A tela parou de atualizar" | O servidor passou mais de 15 minutos do horário sem terminar uma atualização, ou ficou desligado por um tempo, então o último status pode ser antigo. | Veja o log do serviço e reinicie-o (`systemctl restart inkdoor`). Se acontecer de novo, teste cada link. |
| Uma linha no rodapé como *sem acesso: Trabalho* | Essa agenda falhou na última atualização; a porta está usando os últimos dados bons dela no dia. | Nada, se voltar na próxima atualização; senão, teste o link. |

A porta nunca diz **Livre** sem saber: quando não tem como saber, diz **Bata antes**.

## No Kindle

| Mensagem | O que fazer |
|---|---|
| *FALHOU: o Wi-Fi nao conectou* | Confira se o Kindle está na rede Wi-Fi certa e fora do modo avião. |
| *FALHOU: nao consegui baixar a imagem.* | Confira a `URL` em `inkdoor/config.sh`: o endereço, a porta (3667 em instalações novas, 8000 nas antigas) e o `/kindle.png` no fim. Abra o mesmo endereço num navegador na mesma rede. |
| *sem conexao com o PC* (no canto da tela) | Os últimos 3 downloads falharam. O servidor está desligado, mudou de endereço ou o Wi-Fi caiu. |
| *O KPM nao esta instalado neste Kindle.* | O **inkdoor - connect KPM** precisa do KPM, que vem com os jailbreaks recentes. Sem ele, atualize copiando o zip de novo. |
| *A URL em inkdoor/config.sh precisa ser http://.../kindle.png* | O **inkdoor - connect KPM** acha o servidor pela `URL`. Corrija, ou baixe o zip de novo. |
| *FALHOU: o KPM nao conseguiu instalar o inkdoor.* | As linhas acima mostram o erro do KPM. Confira a `URL` em `inkdoor/config.sh`, se o servidor está ligado e se o admin está ativo: o repositório do KPM só existe enquanto ele está. |

As mensagens do Kindle não têm acento: a fonte de tela do aparelho não tem esses caracteres.

- **O endereço mudou**: se o servidor pegou o IP por DHCP, reserve esse endereço no roteador para
  ele nunca mudar.
- **Histórico**: cada tentativa fica registrada em `inkdoor/log.txt` no Kindle (ligue-o no USB
  para ler).
- **Voltar ao Kindle normal**: reinicie o aparelho (segure o botão liga/desliga). O painel não
  volta sozinho.

## Resultados do Testar link e do inkdoor check

| Resultado | O que significa | O que fazer |
|---|---|---|
| *link ainda não foi colado no config.toml* | A agenda não tem link. | Cole o link ICS. |
| *acesso negado (HTTP 401 ou 403)* | O serviço recusou o link: a empresa bloqueia agendas publicadas, ou a agenda foi despublicada. | Publique de novo e copie o link novo. |
| *link não encontrado (HTTP 404)* | O link não existe mais. | Publique a agenda de novo e copie o link ICS. |
| *o link abriu uma página da web, não uma agenda* | Você copiou o link HTML. | Copie o link que termina em `.ics`. |
| *o servidor demorou demais para responder* | O serviço não respondeu em 30 segundos. | Tente mais tarde; confira o acesso do servidor à internet. |
| *não consegui acessar o endereço* | Endereço errado, sem internet ou falha de DNS. | Confira o link e a rede do servidor. |
| *endereço não permitido* | O link aponta para o próprio servidor ou para um endereço link-local. | Use o endereço real da agenda. |
| *isto não é um link válido* | Ele não começa com `https://`, `http://` ou `webcal://`. | Copie o link inteiro de novo. |
| *nenhum compromisso nos próximos 14 dias* | A agenda é lida, mas está vazia. | Confira se publicou a agenda certa. |
| *o link só mostra 'Ocupado'* | A agenda foi publicada só com "ocupado". | Publique de novo com **Pode ver todos os detalhes**; se essa opção não existir, a porta funciona mesmo assim. |
| *muitos compromissos de madrugada* | O fuso horário provavelmente está errado. | Ajuste o fuso na página **Tela** do admin. |
| *não consegui ler os compromissos (TooManyOccurrences)* | A agenda repete um compromisso com tanta frequência (a cada minuto ou segundo, por exemplo) que ele tem milhares de ocorrências em poucos dias. O inkdoor para de ler a agenda. | Corrija ou apague esse compromisso repetido no app de agenda. |
| *não consegui ler os compromissos (CalendarTimeout)* | Ler a agenda levou mais de 30 segundos, quase sempre por uma regra que repete com muita frequência. | O mesmo de cima; com uma agenda muito grande, publique uma menor. |

Onde achar cada link: [Links das agendas](calendar-sources.md).

## O admin

- **Esqueci a senha**: rode `inkdoor password` no servidor. Ele mostra uma senha nova e
  desconecta todos os navegadores.
- **"Este endereço não é permitido"** ao abrir o admin: você usou um nome que não está liberado.
  Abra pelo IP do servidor ou [adicione o nome](server.md#abrindo-o-admin-por-nome).
- **"Muitas tentativas. Tente de novo em…"** depois de várias senhas erradas: o login espera mais
  a cada erro do mesmo endereço. Espere ou gere uma senha nova.
- **"O config.toml tem um problema."**: o arquivo foi editado à mão e não carrega mais. A porta
  continua com as últimas configurações que funcionaram; o admin diz o que está errado e oferece
  **Restaurar versão anterior**.
- **O admin nem abre num notebook**: lá ele vem desligado ([como ligar](server.md#num-notebook)).

## O serviço

- **Não sobe, com `226/NAMESPACE` no log**: o container do Proxmox precisa do recurso
  **nesting** (já vem ligado nos containers criados pelo `create-lxc.sh`). Ligue em **Options →
  Features** do container e inicie de novo.
- **"A porta … já está em uso"** ao iniciar o `inkdoor serve`: outro programa usa a porta. Mude
  `port` no `config.toml` e reinicie, ou feche o outro programa.
- **A porta mudou depois de atualizar**: instalações novas usam a 3667, configs antigas podem ter
  a 8000. Veja [qual porta uma atualização usa](server.md#no-dia-a-dia).
- **Depois de editar à mão**, a maioria das opções vale a partir da próxima atualização; uma
  `port` nova ou uma mudança em `[admin] enabled` precisam de `systemctl restart inkdoor`.

## Ainda não resolveu?

[Abra uma issue](https://github.com/frkey/inkdoor/issues/new/choose) com a saída do
`inkdoor check`, o log do serviço e o que a porta mostra. Deixe de fora links de agenda, nomes,
títulos de reunião e senhas.
