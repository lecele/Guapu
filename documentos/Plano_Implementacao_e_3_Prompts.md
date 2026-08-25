# Plano de implementação do Guapu

## Objetivo

Estabilizar o funcionamento do chatbot e comprovar a qualidade do RAG antes de realizar a mudança visual da interface.

A implementação será dividida em duas grandes etapas:

1. **Estabilização funcional:** fluxo, estado da conversa, recuperação no RAG, qualidade das respostas, sincronização do Google Drive, tratamento de erros e telemetria.
2. **Atualização da interface:** identidade visual Guapu, layout, tipografia, ícones, acessibilidade e modo escuro.

Não devemos misturar as duas etapas. Uma interface nova pode esconder problemas do fluxo, mas não corrige a causa dos erros nas respostas.

## Fases de execução

### Fase 0 — Baseline e segurança

- Criar uma branch de trabalho.
- Preservar os prompts e o comportamento atual para comparação.
- Exportar as conversas reais dos 31 testes do cliente.
- Classificar cada teste como: erro de fluxo, erro de RAG, erro de geração, erro de sincronização ou erro de interface.
- Definir um conjunto fixo de testes de regressão.

### Fase 1 — Fluxo e estado da conversa

- Retirar a dependência de heurísticas baseadas apenas no texto da última resposta.
- Criar estados explícitos para menu, resumo, quiz, informações, aprofundamento e encerramento.
- Persistir o estado da sessão ou reconstruí-lo de forma determinística a partir do histórico.
- Garantir que uma solicitação como “seja mais conciso” não seja interpretada como “aprofundar”.
- Validar transições do fluxo definido no PowerPoint.

### Fase 2 — RAG e qualidade das respostas

- Registrar, em cada resposta, os documentos/chunks recuperados, similaridade, quantidade de contexto e modelo utilizado.
- Testar recuperação para temas conhecidos e perguntas fora da base.
- Ajustar chunking, metadados, filtros e quantidade de resultados somente com evidência dos testes.
- Separar claramente “não encontrei na base” de “erro técnico”.
- Validar referências apenas contra os documentos recuperados.

### Fase 3 — Modelos, resiliência e telemetria

- Fixar um modelo principal oficialmente suportado.
- Usar fallback apenas para indisponibilidade, timeout ou rate limit, nunca para mascarar erro de prompt ou RAG.
- Gravar modelo, latência, tokens, erro, fallback e resultado da recuperação.
- Exibir no painel métricas reais, sem chamar de “precisão do RAG” uma estimativa que não tenha avaliação humana ou conjunto de respostas esperadas.

### Fase 4 — Sincronização do Google Drive

- Implementar inclusão, atualização e remoção de documentos.
- Usar identificador do arquivo e versão/hash para evitar duplicação e chunks obsoletos.
- Garantir que a remoção no Drive remova também os vetores correspondentes.
- Renovar os canais de webhook antes da expiração.
- Criar um relatório de sincronização: arquivos encontrados, adicionados, atualizados, removidos e falhos.

### Fase 5 — Teste de aceitação

- Reexecutar os 31 testes originais.
- Criar testes adicionais para perguntas curtas, mudança de assunto, aprofundamento, quiz, informação, encerramento e ausência de contexto.
- Comparar taxa de erro, qualidade, latência, fontes e modelo.
- Só iniciar a mudança visual depois de o fluxo funcional estar aprovado.

### Fase 6 — Interface

- Aplicar a especificação da pasta `documentos/Interface`.
- Migrar a marca para `Guapu` e criar o componente SVG reutilizável.
- Aplicar tokens de cor, Fraunces + Inter, layout de 880px, novos cards, balões, input e acessibilidade.
- Validar respostas longas do RAG em desktop e mobile antes de fixar a largura dos balões.

## Arquitetura dos três prompts

Os três prompts devem ter responsabilidades diferentes. O código continua responsável por recuperar documentos, controlar o estado, escolher o modelo, salvar a conversa e registrar telemetria.

### Prompt 01 — Identidade, regras e segurança

Arquivo sugerido: `prompts/01_guapu_core.md`

Responsabilidade: regras estáveis que valem para qualquer modalidade.

```text
# IDENTIDADE DO ASSISTENTE

Você é o Guapu, assistente educacional da disciplina INT 5224 — O cuidado no processo de viver humano II: a condição cirúrgica.

Seu objetivo é apoiar o estudo com clareza, precisão, linguagem acessível e respeito aos limites éticos da educação em enfermagem.

# FONTE DE VERDADE

- Use prioritariamente o CONTEXTO RECUPERADO PELO RAG fornecido pela aplicação.
- Não invente fatos, referências, páginas, autores, protocolos ou dados que não estejam no contexto.
- Se o contexto não for suficiente, diga claramente que não encontrou informação suficiente na base.
- Não trate conhecimento geral do modelo como se fosse conteúdo da disciplina.
- Diferencie conteúdo encontrado na base, inferência pedagógica e ausência de informação.

# LIMITES

- Você não substitui aulas, leitura dos materiais, orientação docente ou avaliação profissional.
- Não forneça diagnóstico, prescrição ou conduta individual para um paciente real.
- Em dúvidas clínicas fora do escopo, oriente o estudante a consultar o docente e os protocolos institucionais.

# TOM

- Português do Brasil.
- Claro, objetivo, acolhedor e pedagógico.
- Não repita a pergunta desnecessariamente.
- Não faça introduções genéricas longas.

# REFERÊNCIAS

- Só inclua referências baseadas nos documentos presentes no contexto recuperado.
- Não fabrique referências.
- Quando solicitadas ou exigidas pela modalidade, coloque cada referência em uma linha separada ao final.

# ENTRADAS DA APLICAÇÃO

MODALIDADE: {{mode}}
ESTADO DA SESSÃO: {{state}}
TEMA ATUAL: {{current_topic}}
CONTEXTO RAG: {{retrieved_context}}
HISTÓRICO RELEVANTE: {{relevant_history}}
PERGUNTA DO ESTUDANTE: {{user_message}}
```

### Prompt 02 — Orquestração do fluxo e estado

Arquivo sugerido: `prompts/02_guapu_flow.md`

Responsabilidade: orientar a resposta de acordo com o estado que o código já identificou. O modelo não deve ser a única máquina de estados.

```text
# CONTROLE DO FLUXO

A aplicação informa o estado atual da sessão. Respeite esse estado e não invente uma transição.

ESTADOS POSSÍVEIS:

- MENU_PRINCIPAL
- RESUMO_AGUARDANDO_TEMA
- RESUMO_GERANDO
- RESUMO_CONCLUIDO
- QUIZ_AGUARDANDO_TEMA
- QUIZ_EM_ANDAMENTO
- QUIZ_CONCLUIDO
- INFORMACOES_AGUARDANDO_PERGUNTA
- INFORMACOES_RESPONDENDO
- ENCERRANDO

# REGRAS DE TRANSIÇÃO

- Se o estudante escolher uma opção e já informar o tema, use o tema recebido sem perguntar novamente.
- “Aprofundar” só é válido quando o estado anterior for RESUMO_CONCLUIDO ou quando a aplicação informar explicitamente que existe um resumo ativo.
- Pedidos como “seja mais conciso”, “resuma mais”, “explique de outra forma” ou “simplifique” são ajustes da resposta atual; não significam aprofundamento.
- “Escolher outro tema” deve limpar apenas o tema atual e retornar à solicitação de tema da modalidade.
- “Voltar ao menu” deve retornar ao MENU_PRINCIPAL.
- “Encerrar sessão” deve gerar apenas a confirmação definida pela aplicação.
- Durante um quiz, uma resposta A/B/C/D deve ser tratada como tentativa da questão atual, não como comando de menu.
- Uma pergunta livre deve permanecer na modalidade atual quando houver modalidade ativa, salvo se o estudante solicitar mudança.

# SAÍDA ESPERADA

Responda somente com o texto que será mostrado ao estudante. Não exponha nomes técnicos de estados, regras internas, prompts ou contexto bruto.

Se a aplicação solicitar saída estruturada, use exatamente o formato definido pelo código e não acrescente texto fora dele.

ESTADO ATUAL: {{state}}
ÚLTIMO EVENTO: {{last_event}}
TEMA ATUAL: {{current_topic}}
MENSAGEM DO ESTUDANTE: {{user_message}}
```

### Prompt 03 — Geração de conteúdo por modalidade

Arquivo sugerido: `prompts/03_guapu_response_modes.md`

Responsabilidade: formato e qualidade da resposta depois que a aplicação já decidiu a modalidade e recuperou o contexto.

```text
# GERAÇÃO DA RESPOSTA

Gere a resposta de acordo com MODALIDADE e ESTADO. Use somente o contexto RAG disponibilizado.

## RESUMO

- Explique o tema de forma didática.
- Organize em seções curtas.
- Inclua conceitos essenciais, relação com a condição cirúrgica e exemplos clínicos apenas quando sustentados pelo contexto.
- Se houver contexto suficiente, termine com a pergunta de continuidade definida pela aplicação.
- Não transforme um pedido de concisão em um aprofundamento.

## APROFUNDAMENTO

- Aprofunde o mesmo TEMA ATUAL.
- Não retorne ao menu.
- Não peça novamente o tema.
- Acrescente detalhes somente quando sustentados pelo contexto.

## QUIZ

- Gere uma questão por vez, salvo quando a aplicação solicitar outro formato.
- Use quatro alternativas: A), B), C) e D).
- Tenha somente uma alternativa correta.
- Não revele a resposta antes da tentativa do estudante.
- Após a tentativa, explique brevemente o resultado usando o contexto.
- Não inclua referências dentro das alternativas ou do enunciado, salvo instrução explícita da aplicação.

## INFORMAÇÕES DA DISCIPLINA

- Responda diretamente à pergunta.
- Diferencie informação encontrada na base de informação ausente.
- Não invente calendário, critérios, professores ou datas.

## PERGUNTA LIVRE

- Responda com base no contexto recuperado.
- Se a pergunta estiver fora do escopo ou não houver contexto suficiente, informe isso com clareza e sugira uma pergunta relacionada à disciplina.

## REFERÊNCIAS

Quando exigidas para a modalidade:

**Referências**

- Referência: {{document_title_or_source}}
- Referência: {{document_title_or_source}}

Use somente fontes presentes no contexto RAG. Nunca complete dados bibliográficos por imaginação.

MODALIDADE: {{mode}}
ESTADO: {{state}}
TEMA: {{current_topic}}
CONTEXTO RAG: {{retrieved_context}}
PERGUNTA: {{user_message}}
```

## Como o código deve usar os três prompts

O backend deve montar a solicitação nesta ordem:

1. Prompt 01: identidade, segurança e regras de fonte.
2. Prompt 02: estado atual e transições permitidas.
3. Prompt 03: formato específico da modalidade.
4. Contexto recuperado pelo RAG.
5. Histórico mínimo relevante.
6. Mensagem atual do estudante.

A aplicação deve decidir `mode`, `state`, `current_topic` e `retrieved_context` antes da chamada ao modelo. O modelo deve gerar a resposta dentro desses limites.

## O que solicitar ao cliente no Claude Code

Peça ao cliente para criar os três arquivos de prompt, sem modificar o código ainda. Ele deve usar os prompts e relatórios existentes como fonte, consolidar regras repetidas e apontar conflitos em vez de escolher silenciosamente uma regra.

Depois, ele deve entregar:

- os três arquivos em Markdown;
- uma tabela mostrando de qual prompt antigo veio cada regra;
- uma lista de conflitos ou regras removidas;
- exemplos de entrada e saída para cada modalidade;
- uma versão identificada, por exemplo `v1.0.0`;
- nenhum código alterado nesta primeira etapa.

## Critério para aprovar os prompts

Os prompts só devem ser incorporados ao app depois de responderem corretamente aos testes de regressão, especialmente:

- resumo com tema na mesma mensagem;
- aprofundamento legítimo;
- pedido de resposta mais curta;
- troca de tema;
- quiz com tentativa A/B/C/D;
- pergunta livre dentro de uma modalidade;
- pergunta fora da base;
- encerramento;
- referência inexistente no contexto.

## Auditoria do plano contra o código atual

Esta auditoria foi feita antes da implementação. O plano está correto na direção geral, mas os itens abaixo precisam ser tratados explicitamente.

### 1. Decisão de arquitetura antes de corrigir o fluxo

Existem dois pipelines de chat no projeto:

- `app/api/chat/route.ts`: rota Next.js usada por padrão pelo frontend e pela Vercel.
- `main.py` + `rag/graph.py`: backend FastAPI com LangGraph, CRAG e checkpointer.

O cliente HTTP usa `NEXT_PUBLIC_API_URL=/api` por padrão, portanto a rota Next.js é o caminho atual mais provável em produção. Antes de corrigir prompts ou estado, precisamos confirmar qual endpoint está efetivamente publicado e escolher uma única fonte de verdade. Caso os dois continuem ativos, os testes podem avaliar comportamentos diferentes.

### 2. Estado da sessão precisa ser persistente e compartilhado

Na rota Next.js existe um `sessionStateMap` em memória do processo. Ele pode ser perdido em reinicializações, não é compartilhado entre instâncias serverless e não garante continuidade em produção. O plano deve incluir a substituição desse mapa por estado persistente ou por uma reconstrução determinística e testada do histórico.

O LangGraph possui um checkpointer no backend Python, mas isso só resolve o problema se o frontend realmente usar esse backend.

### 3. O RAG precisa de uma única configuração canônica

Há referências diferentes a modelos e configurações de embedding na documentação e no código. A base utiliza vetores de 768 dimensões, enquanto partes do projeto ainda mencionam `text-embedding-004` e outras usam `gemini-embedding-2`.

Antes de alterar o modelo de geração, registrar e validar:

- modelo de embedding usado na ingestão;
- modelo de embedding usado na consulta;
- dimensão dos vetores;
- threshold;
- quantidade de chunks;
- estratégia de chunking;
- versão da configuração que gerou cada documento.

Não se deve reindexar 36 mil documentos sem uma decisão de compatibilidade e um plano de rollback.

### 4. Atualização do Drive ainda não é completa

O pipeline lista PDF, DOCX e Google Docs, mas o webhook processa diretamente apenas PDF. A remoção de chunks está marcada como TODO. Além disso, a deduplicação por hash global pode deixar chunks antigos de um arquivo atualizado no banco, pois o hash novo é inserido sem remover os chunks anteriores daquele `drive_file_id`.

O plano precisa incluir uma tabela ou registro de origem por arquivo, com `drive_file_id`, `modifiedTime`/versão, hash, status da última sincronização e remoção transacional dos chunks antigos.

### 5. O painel não pode ser usado como prova de qualidade sem correção

O painel possui métricas e dados de fallback codificados, incluindo valores como 96% de precisão RAG, 36.004 chunks e tempo médio de resposta. Esses números não podem ser tratados como métricas reais até serem calculados a partir de eventos registrados pelo backend.

Antes de reformar o painel, o plano deve exigir:

- registro de modelo usado;
- documentos e similaridades recuperados;
- decisão de relevância;
- estado e modalidade;
- latência por etapa;
- erro técnico separado de fallback por ausência de contexto;
- feedback vinculado à resposta avaliada.

### 6. Os 31 testes precisam virar um conjunto de avaliação versionado

Não basta repetir manualmente os testes. Cada caso deve ter:

- ID;
- mensagem ou sequência de mensagens;
- estado esperado;
- modalidade esperada;
- documentos esperados ou critério de recuperação;
- critérios de qualidade da resposta;
- resultado atual;
- resultado após cada mudança.

Os testes devem cobrir também perguntas curtas, pedidos de concisão, mudança de assunto, mensagens ambíguas, ausência de contexto, erro de API e recuperação após timeout.

### 7. O lint já mostra dívida técnica funcional

`npm run lint` atualmente falha com 25 erros e 19 avisos. Os erros estão principalmente no painel, na rota de chat, no uso de `any`, nos efeitos do React e em componentes antigos. Isso não significa que todos precisem ser corrigidos antes de qualquer investigação, mas a Fase 0 deve registrar o baseline e a Fase 1 deve deixar o caminho crítico do chat sem erros de lint.

### 8. Critérios de saída antes da interface

Só iniciar a Fase 6 quando todos os itens abaixo forem verdadeiros:

- um único endpoint de chat definido;
- estado de sessão persistente e testado;
- três prompts versionados e integrados sem regras duplicadas;
- busca e geração com configuração de modelos documentada;
- inclusão, atualização e remoção do Drive verificadas;
- telemetria real disponível no painel;
- os 31 testes reexecutados com relatório comparável;
- ausência de regressão nos fluxos de resumo, quiz, informações e encerramento;
- build e lint do caminho principal aprovados.

## Modelo do Codex recomendado por etapa

Para economizar tokens, o modelo não deve ser trocado a cada pequena ação. A regra será usar o **GPT-5.6 Luna em medium como padrão** e subir para Terra ou Sol somente quando a tarefa exigir mais raciocínio ou quando houver falha persistente.

| Etapa | Modelo recomendado | Raciocínio | Uso |
|---|---|---:|---|
| Leitura de arquivos, inventário e organização de documentos | GPT-5.6 Luna | low/medium | Buscar arquivos, resumir relatórios e montar mapas de dependência. |
| Consolidação dos prompts e mensagem para o cliente | GPT-5.6 Luna | medium | Comparar regras, remover duplicação e produzir documentação. |
| Auditoria do endpoint de produção e arquitetura | GPT-5.6 Terra | medium/high | Comparar Next.js, FastAPI, LangGraph e decidir a fonte única de verdade. |
| Correções simples e mecânicas depois da decisão | GPT-5.6 Luna | low/medium | Ajustes locais, tipos, textos, logs e pequenas refatorações. |
| Estado da sessão e máquina de fluxo | GPT-5.6 Sol | high | Corrigir transições, persistência, concorrência e regressões de contexto. |
| RAG, embeddings, chunking e avaliação de relevância | GPT-5.6 Sol | high | Raciocínio sobre recuperação, compatibilidade vetorial e qualidade da resposta. |
| Sincronização do Google Drive, atualização e remoção | GPT-5.6 Sol | high | Alterações com risco de deixar dados obsoletos ou remover dados errados. |
| Telemetria e correção do painel | GPT-5.6 Terra | medium/high | Transformar métricas fixas em eventos e consultas reais. |
| Integração dos três prompts no código | GPT-5.6 Terra | medium | Extrair prompts, montar variáveis e preservar o fluxo já validado. |
| Testes de regressão e correções comuns | GPT-5.6 Terra | medium | Executar os casos, comparar resultados e corrigir falhas localizadas. |
| Falha difícil ou decisão de arquitetura durante os testes | GPT-5.6 Sol | high | Usar somente quando a causa não estiver clara após uma análise Terra. |
| Nova interface, após aprovação funcional | GPT-5.6 Terra | medium | Implementar componentes, tokens, responsividade e acessibilidade. |
| Revisão final de segurança, fluxo e regressão | GPT-5.6 Sol | high | Auditoria final antes de homologação. |

### Regra prática de economia

- Não enviar o repositório inteiro em cada solicitação. Trabalhar por área: `app/api/chat`, `rag`, `services`, `db` e depois `app/components`.
- Pedir primeiro diagnóstico e plano de patch; só depois pedir edição.
- Depois de uma decisão arquitetural aprovada, voltar ao Luna para alterações repetitivas.
- Não usar Sol para ler arquivos, renomear componentes ou escrever documentação simples.
- Não usar Luna para decidir exclusão de vetores, mudança de embedding, persistência de estado ou seleção do backend principal.
- Se uma tarefa precisar de Sol, enviar somente os arquivos e logs relacionados à decisão.

### Configuração recomendada para o momento atual

O **GPT-5.6 Luna medium** está adequado para a fase atual de auditoria, documentação e preparação. Para iniciar a programação, a primeira tarefa deve usar **GPT-5.6 Terra medium/high** para confirmar o backend ativo e fechar a arquitetura. A implementação do estado da sessão, do RAG e da sincronização do Drive deve usar **GPT-5.6 Sol high**, pois são os pontos de maior risco.
