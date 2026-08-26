# Auditoria inicial — conversas, RAG e quiz

Data da coleta: 25 de agosto de 2026. Esta auditoria usa o historico existente em `chat_messages`; nao infere qualidade clinica apenas por palavras-chave.

## Evidencias encontradas

- 1.306 mensagens salvas, equivalentes a 653 perguntas e 653 respostas.
- Entre 24/08 18:00 e 19:10 UTC ha 24 sessoes e 68 respostas: e a janela mais provavel dos testes recentes. Em 25/08 ha mais 9 sessoes e 17 respostas. O banco nao marca quais sao exatamente os 31 testes informados pelo cliente.
- Nao ha resposta historica com texto de erro de plataforma. Existem recusas de seguranca e mensagens de entrada invalida; elas nao devem ser contabilizadas como falha tecnica.
- So uma resposta antiga possui telemetria de recuperacao. Portanto, o painel antigo nao consegue afirmar taxa de acerto do RAG, nem atribuir os 9 resultados ruins a busca, modelo ou fluxo.

## O que funcionou nos testes observados

- Perguntas diretas de conteudo, plano de ensino, seguranca cirurgica, infeccao de sitio cirurgico e cuidados pre-operatorios receberam respostas coerentes e ancoradas no escopo.
- Recusas para pedido de diagnostico, medicacao individual, resposta direta de prova e temas fora da disciplina sao comportamentos corretos de seguranca.
- Navegacao de menu, encerramento, resumo e consulta livre foram reconhecidos.

## Problema confirmado: integridade do quiz

Em uma sessao iniciada com quiz de fios de sutura, as perguntas seguintes migraram para eletrocoagulacao e analgesia. Isso e falha de fluxo/prompt: a pergunta do quiz nao permaneceu limitada ao tema selecionado. O mesmo risco existe porque a correcao e a criacao da proxima questao ainda dependem apenas do modelo e do historico textual.

Consequencias:

1. Uma resposta marcada como "incorreta" pode ser uma resposta errada do aluno, e nao um erro do sistema; esse indicador precisa ser separado no painel.
2. O gabarito e a pergunta devem ser persistidos de forma estruturada, em vez de depender apenas do texto que o modelo gerou.
3. A proxima questao deve usar somente o tema atual e os trechos RAG recuperados para esse tema.

## Decisoes de implementacao

1. Registrar telemetria por turno: modelo solicitado/usado, latencias, numero de fontes, similaridades, fallback e codigo de erro. O novo endpoint ja grava esses campos; o painel deve ignorar dados anteriores sem instrumentacao.
2. Criar estado estruturado de quiz por sessao: tema, numero da questao, enunciado, alternativas, gabarito e tentativas.
3. Gerar quiz em formato estruturado e validar tema/alternativas antes de exibir.
4. Criar uma suite de avaliacao com os 31 enunciados aprovados pelo cliente. Cada caso precisa informar resultado esperado: resposta, recusa segura, menu ou quiz.
5. Medir separadamente: falha tecnica, ausencia de contexto RAG, recuperacao irrelevante, falha de modelo, erro de fluxo e resposta incorreta do aluno.

## Criterio de aceite

Nao publicar uma taxa de assertividade antes de haver pelo menos uma rodada de casos rotulados. Para cada caso, registrar fontes recuperadas, resposta, avaliacao humana e motivo. A meta inicial recomendada e zero falha tecnica, 100% de recusas seguras corretas e pelo menos 90% de respostas aprovadas pelos especialistas nos casos com contexto suficiente.
