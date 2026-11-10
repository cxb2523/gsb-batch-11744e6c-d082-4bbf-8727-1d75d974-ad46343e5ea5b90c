# Preparando o Kindle

[English](../kindle.md) · **Português (Brasil)**

O inkdoor roda em Kindles com jailbreak. O lado do Kindle é simples: alguns scriptlets que
desligam a interface do aparelho e mostram a imagem gerada pelo computador.

## Qual é o meu Kindle?

O inkdoor desenha a imagem na resolução do seu Kindle: escolha o modelo na página **Tela** do
admin (ou defina `screen` em `[display]` no `config.toml`, por exemplo `screen = "1236x1648"`).
O padrão é 1072 × 1448. Estes são os Kindles que os jailbreaks atuais suportam:

| Tela | Modelos de Kindle |
|---|---|
| 600 × 800 | Kindle 2014, 2016 e 2019 (7ª, 8ª e 10ª geração) |
| 758 × 1024 | Kindle Paperwhite 1 e 2 (2012, 2013) |
| 1072 × 1448 | Kindle Paperwhite 3 e 4 (2015, 2018), Voyage, Oasis 2016, Kindle 2022 e 2024 (11ª geração) |
| 1236 × 1648 | Kindle Paperwhite 5 e Signature Edition (2021) |
| 1264 × 1680 | Kindle Oasis 2017 e 2019 |
| 1272 × 1696 | Kindle Paperwhite 2024 e Colorsoft |
| 1860 × 2480 | Kindle Scribe 2022 e 2024 |

No firmware 5.14 ou mais novo, Configurações → Opções do dispositivo → Informações do
dispositivo mostra o nome do modelo. O layout mantém as mesmas proporções em todas as telas,
com o texto no tamanho certo para cada uma.

- Se a imagem não ocupar a tela inteira, ou as bordas ficarem cortadas, o modelo escolhido na
  página **Tela** não é o seu.
- O tamanho do Paperwhite 2024 e do Colorsoft vem de capturas de tela, não do inkdoor rodando
  neles, e o Colorsoft mostra a porta em cinza. Se você tem um, um relato ajuda muito
  ([abra uma issue](https://github.com/frkey/inkdoor/issues/new/choose)).
- Quais versões de firmware aceitam jailbreak muda com o tempo: confira no
  [Kindle Modding](https://kindlemodding.org/jailbreaking/) antes de começar.

## 1. Jailbreak

Siga o guia atualizado do [Kindle Modding](https://kindlemodding.org/jailbreaking/). O método
depende do modelo e da versão do firmware (Configurações → Opções do dispositivo → Informações
do dispositivo). Os jailbreaks recentes já instalam o suporte a **scriptlets**: arquivos `.sh`
na pasta `documents` que aparecem na biblioteca e rodam quando você toca neles.

Antes de começar, deixe o Kindle em **modo avião** para ele não atualizar o firmware.

## 2. Instalação

### Baixe os arquivos no admin

Na página **Início** do admin, aperte **Baixar os arquivos do Kindle**. O `.zip` já vem com o
endereço do seu servidor e o seu idioma no `inkdoor/config.sh`. Com o Kindle ligado no USB:

1. Descompacte.
2. Copie a pasta `inkdoor` para a raiz do Kindle, ao lado da pasta `documents`.
3. Copie os arquivos de `scriptlets` para a pasta `documents` do Kindle. Copie os arquivos, não a
   pasta: substituir `documents` apagaria os seus livros.

O `README.txt` dentro do zip tem os mesmos passos.

### Atualizações pelo KPM (opcional)

Os jailbreaks recentes já vêm com o **KPM**, o gerenciador de pacotes do Kindle, e o seu servidor
inkdoor funciona como um repositório do KPM. Com os arquivos acima no Kindle, abra **inkdoor -
connect KPM** na biblioteca, uma vez só: ele adiciona o seu servidor ao KPM e instala o inkdoor a
partir dele, mantendo as configurações do seu `config.sh`. A partir daí, para atualizar o Kindle
depois de atualizar o servidor, digite na barra de busca do Kindle, apertando Enter depois de cada
linha:

```
;kpm update
;kpm upgrade
```

Para remover o inkdoor, digite `;kpm uninstall inkdoor`.

Não dá para adicionar o servidor com `;kpm add-repo` pela barra de busca: o Kindle descarta
qualquer comando de busca com `.` ou `:` no texto, então um endereço nunca chega ao KPM
([KindleModding/KPM#5](https://github.com/KindleModding/KPM/issues/5)). Por isso o scriptlet
faz isso. Se o endereço do servidor mudar, coloque o novo na `URL` do `inkdoor/config.sh` (a
página **Início** do admin mostra) e abra **inkdoor - connect KPM** de novo.

### À mão

A partir de uma cópia deste repositório, com o Kindle ligado no USB:

```
Kindle/
├── documents/
│   ├── inkdoor-start.sh       ← de kindle/documents/
│   ├── inkdoor-test.sh        ← de kindle/documents/
│   └── inkdoor-kpm.sh         ← de kindle/documents/ (opcional, para atualizar pelo KPM)
└── inkdoor/                   ← a pasta kindle/inkdoor/ inteira
    ├── common.sh
    ├── config.sh
    └── loop.sh
```

Edite `inkdoor/config.sh`:

```sh
URL="http://192.168.0.10:3667/kindle.png"   # IP do computador que roda o "inkdoor serve"
INTERVAL=300                                # espera máxima entre atualizações, em segundos
FULL_REFRESH_EVERY=6                        # a cada N atualizações, uma completa (pisca e limpa fantasmas)
LANGUAGE="pt-BR"                            # mensagens no Kindle: en-US ou pt-BR
```

O arquivo pode ser editado no Windows: as quebras de linha são corrigidas automaticamente.

## 3. Uso

Ejete o Kindle. Na biblioteca aparecem:

- **inkdoor - test connection**: liga o Wi-Fi, baixa a imagem uma vez e diz se deu certo.
  Não muda nada no Kindle.
- **inkdoor - start display**: desliga a interface do Kindle e passa a mostrar a agenda.
- **inkdoor - connect KPM**: só precisa uma vez, para as [atualizações pelo KPM](#atualizações-pelo-kpm-opcional).

**Para voltar ao Kindle normal, reinicie o aparelho** (segure o botão liga/desliga). O painel
não inicia sozinho depois de reiniciar.

## Dicas

- **Energia**: o painel mantém o Wi-Fi ligado e não usa hibernação, então o ideal é deixar o
  Kindle no carregador. Um cabo USB fino passa bem pelo batente da porta.
- **IP fixo**: reserve um IP para o computador no roteador, senão o endereço muda e o painel
  para de atualizar. Um servidor de casa evita isso e nunca dorme ([server.md](server.md)).
- **Na hora certa**: o servidor redesenha a porta na hora em que um compromisso começa ou termina
  e avisa o Kindle quando voltar, então o status muda em segundos. O `INTERVAL` é só a espera
  máxima entre atualizações; isso precisa dos scripts do Kindle a partir da versão 1.2
  (`;kpm upgrade` ou um zip novo).
- **Uma instância só**: tocar duas vezes em "start display" não inicia dois painéis.
- **Sem conexão**: depois de 3 falhas seguidas, aparece "sem conexao com o PC" no canto da tela.
  O histórico fica em `inkdoor/log.txt`, e a
  [Solução de problemas](troubleshooting.md#no-kindle) explica cada mensagem.
