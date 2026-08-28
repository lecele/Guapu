# Plano de correção, validação e homologação do Guapu

**Data de abertura:** 27/08/2026  
**Status geral:** em execução  
**Fase atual:** Fase 2A — qualidade do RAG e velocidade antes da troca de runtime
**Documento de referência:** este arquivo é o controle oficial das próximas etapas.

## 1. Objetivo

Corrigir de forma definitiva os problemas apontados pelo cliente no RAG, nas referências, nos fluxos conversacionais, na interface e no painel de monitoramento. O Guapu somente será promovido para produção após comprovação técnica e homologação funcional.

O trabalho será executado em fases fechadas. Nenhuma fase avança somente porque o código foi alterado: é obrigatório demonstrar que a alteração funciona com dados reais, que não introduziu regressões e que pode ser revertida com segurança.

**Decisão de arquitetura:** o Google Drive continua sendo a fonte oficial dos documentos; a VPS mantém a cópia operacional, a sincronização, o worker e o aplicativo; o Supabase continua sendo o banco gerenciado do RAG, dos vetores, da fila e da telemetria. A Vercel permanece como fallback até a homologação do runtime na VPS. Não haverá migração do banco para a VPS nesta etapa, porque isso acrescentaria um ponto único de falha sem resolver, por si só, a qualidade do RAG.

## 2. Regra de avanço entre fases

Cada fase somente pode ser marcada como aprovada quando cumprir todos os itens abaixo:

1. Implementação concluída no ambiente de homologação.
2. Testes automatizados relacionados à fase aprovados.
3. Testes reais contra Supabase, RAG e aplicação aprovados, quando aplicáveis.
4. Evidências registradas: entrada, saída, fontes recuperadas, tempo e resultado.
5. Ausência de regressão nos casos críticos já corrigidos.
6. Aprovação de Leonardo para seguir.
7. Quando a mudança alterar o comportamento acadêmico, validação diária do cliente em homologação.

### Bloqueio formal de fase

- Revisão de código, teste com mocks, mensagem de sucesso ou deploy concluído **não aprovam uma fase isoladamente**.
- Todos os testes obrigatórios da fase devem passar com dados reais e respostas reais do aplicativo.
- O conjunto crítico da fase deve ter **100% de aprovação e zero resposta incorreta conhecida**.
- Se qualquer teste obrigatório falhar, a fase permanece `EM CORREÇÃO`; a próxima fase não pode ser iniciada.
- Depois da correção, toda a bateria da fase é executada novamente, e não apenas o teste que falhou.
- Resultados devem ser reproduzíveis. Um acerto isolado não vale como aprovação quando o fluxo for não determinístico.
- Toda aprovação deve indicar a versão do código, o ambiente, a data e o caminho das evidências.
- Não serão aceitos números manuais, métricas fixas, capturas sem rastreabilidade ou afirmações sem consulta verificável.
- Produção só recebe uma versão que tenha sido testada exatamente no mesmo commit e configuração em homologação.

Todo erro novo encontrado pelo cliente deve virar um caso de regressão permanente antes do encerramento da fase correspondente.

### Definição objetiva de resposta correta

Uma resposta somente será classificada como correta quando cumprir simultaneamente os critérios aplicáveis:

1. responde exatamente à pergunta feita e respeita a modalidade ativa;
2. usa somente documentos ativos e aprovados;
3. cada afirmação factual relevante está sustentada pelos trechos recuperados;
4. não mistura versão antiga, conhecimento externo não autorizado ou inferência apresentada como fato;
5. informa insuficiência de evidência quando o acervo não permite responder;
6. apresenta referência somente quando documento e localização puderem ser comprovados;
7. respeita as regras éticas, acadêmicas e de linguagem dos prompts aprovados;
8. não expõe termos internos nem elementos de interface no momento errado;
9. registra a trilha técnica necessária para auditoria;
10. é entregue dentro da meta de desempenho da modalidade.

Uma resposta bem escrita, mas apoiada no documento errado, é **reprovada**. Uma resposta que acerta por conhecimento geral sem sustentação na base autorizada também é **reprovada**.

## 3. Diagnóstico confirmado

### 3.1 Base documental e sincronização

- O Supabase contém **48.023 trechos**.
- **29.337 trechos legados não têm `drive_file_id`** e, por isso, não estão sob o controle completo da sincronização atual do Google Drive.
- **18.686 trechos têm `drive_file_id`**.
- O manifesto registra **116 arquivos ativos**.
- O plano de ensino atual de 2026/2 possui 64 trechos identificados pelo Drive.
- O plano antigo de 2026/1 possui 93 trechos legados sem identificação do Drive.
- O nome antigo “Alexandre Caminha” foi localizado apenas no plano de 2026/1, confirmando que conteúdo obsoleto ainda pode ser recuperado.
- Existem registros de sincronização que permaneceram com status `running` e precisam ser reconciliados.
- A pasta Biblioteca está indexada, com milhares de trechos, mas a busca geral atual não garante que ela participe da resposta quando deveria.
- A cadeia atual usa um timer na VPS a cada 10 minutos, um planejador de jobs, a fila `drive_sync_jobs` e um worker persistente; todos esses componentes precisam participar dos testes reais.
- A VPS já executa o worker e a fila, mas o aplicativo Guapu ainda não está registrado como serviço próprio nela; portanto, a migração do frontend/API da Vercel para a VPS ainda precisa ser preparada e homologada.
- A limpeza automática de trechos legados existente depende de igualdade de nome da fonte. Ela não resolve com segurança uma versão nova que substitui um arquivo antigo com outro nome.

### 3.2 Recuperação e referências

- A conversa consulta o Supabase; o problema de informação antiga não é um cache local temporário.
- A busca administrativa atual aceita um padrão amplo de nome de arquivo e pode recuperar simultaneamente planos antigos e atuais.
- A recuperação geral trabalha com poucos resultados sem uma trilha específica e equilibrada para a Biblioteca.
- As referências são montadas pelo código com heurísticas sobre o texto dos trechos.
- Essas heurísticas podem transformar frases ou fragmentos de conteúdo em nomes de referências.
- Não existe hoje uma garantia completa de rastreabilidade resposta → trecho → arquivo → página.

### 3.3 Fluxos, prompts e interface

- Os três prompts novos v1.3 enviados pelo cliente ainda não correspondem integralmente ao comportamento em produção.
- O menu é gerado por resposta fixa com marcadores e pode aparecer em uma única linha.
- Os cartões da tela inicial enviam texto comum, em vez de um estado estruturado de modalidade.
- O comando “novo quiz” pode cair no fluxo de pergunta livre quando o tema não é informado.
- Elementos como estrelas, botões, rótulos e layout dependem do frontend e não podem ser corrigidos apenas pelo prompt.
- A interface atual diverge em pontos da especificação de 27/08/2026.
- O painel possui métricas úteis, mas precisa garantir que todas sejam provenientes de dados reais e auditáveis.

## 4. Cobertura dos pedidos do cliente

| Pedido ou erro relatado | Fase responsável | Critério objetivo |
|---|---:|---|
| Conteúdo do plano antigo aparecendo | 0, 1 e 2 | nenhuma resposta recupera documento obsoleto |
| Arquivos novos substituírem corretamente os antigos | 1 | matriz de comparação aprovada e versões antigas fora do índice ativo |
| Sincronização adicionar, atualizar, mover e remover arquivos | 1 | ciclo completo provado na raiz e na Biblioteca |
| Biblioteca ser consultada quando relevante | 1 e 2 | caso respondível apenas pela Biblioteca é aprovado |
| Referências quebradas ou inventadas | 0 e 3 | ocultas na contenção; depois exibidas somente com vínculo comprovado |
| Frases de conteúdo aparecendo como referência | 3 | validador rejeita referência sem metadados documentais |
| Menu com opções corridas | 4 e 5 | quatro ações separadas e responsivas |
| “Novo quiz” não iniciar novo fluxo | 4 | interrupção determinística e solicitação de tema |
| Hemostasia ser tratada como recusa ética | 4 | tema válido segue normalmente; falta de conteúdo usa resposta apropriada |
| Termos internos como “RAG” aparecerem ao aluno | 4 | linguagem interna nunca é exposta |
| Marcadores `[2]` e `[3,4,5]` | 3 e 4 | removidos sem perda da rastreabilidade interna |
| Feedback de quiz extenso e lento | 2 e 4 | resposta curta conforme prompt e latência medida |
| Nome, cartões, Hero, bolhas, estrelas e layout | 4 e 5 | comportamento e aparência iguais à especificação aprovada |
| Painel com números sem sentido ou incorretos | 6 | toda métrica possui definição, consulta e amostra auditável |
| Cliente precisar testar diariamente | 7 | ambiente de homologação estável e roteiro diário de aceite |

## 5. Fases de execução

## Fase 0 — Contenção e ambiente seguro

**Objetivo:** impedir novas respostas claramente inseguras enquanto a base é corrigida e garantir recuperação rápida caso algo falhe.

### Ações

- Criar ou confirmar ambiente separado de homologação.
- Isolar a homologação com pasta controlada no Drive e tabela, schema ou projeto Supabase separado da produção para permitir testes reais de adicionar e remover documentos sem interromper o aplicativo do cliente.
- Registrar versão atual da aplicação, banco, prompts e configurações.
- Preparar backup verificável antes de qualquer alteração de dados.
- Criar procedimento de rollback da aplicação e das alterações do banco.
- Desativar temporariamente a exibição de referências não verificadas.
- Restringir respostas administrativas ao identificador exato do plano atual.
- Bloquear explicitamente o plano de ensino antigo na recuperação.
- Manter logs com `request_id`, versão do prompt, consulta, trechos recuperados e tempos.

### Testes obrigatórios

- “Quem são os professores?” usa somente o plano atual.
- “Quais aulas haverá em 16/09?” usa somente o plano atual ou informa honestamente que a evidência não está disponível.
- Nenhuma referência quebrada é exibida ao aluno.
- Produção continua operacional durante a preparação da homologação.
- Rollback é documentado e testável.
- A homologação usa credenciais, pasta e destino RAG confirmados, sem risco de o ensaio apagar a base de produção.

### Critério de aprovação

Não existe mais caminho conhecido para o plano antigo aparecer nas respostas administrativas e referências duvidosas deixam de ser expostas.

---

## Fase 1 — Comparação documental, remoção de versões antigas e reconciliação Google Drive ↔ Supabase

**Objetivo:** comprovar quais arquivos novos são válidos, identificar exatamente quais documentos eles substituem, retirar do RAG todas as versões obsoletas e tornar o Google Drive a fonte documental controlada. Ao final, a base deve representar somente os arquivos ativos e aprovados.

### Ações

- Inventariar cada arquivo novo enviado pelo cliente e cada arquivo já presente no Drive, no manifesto e no Supabase.
- Ler e comparar o conteúdo dos documentos novos com as versões anteriores, não apenas nomes, datas ou hashes.
- Criar uma matriz de substituição com: arquivo novo, arquivo substituído, versão, hash, data, conteúdo alterado, decisão e justificativa.
- Confirmar com o material mais recente do cliente qual documento é a versão oficial quando houver conflito, duplicidade ou nomenclatura ambígua.
- Classificar cada arquivo como `ATIVO`, `SUBSTITUÍDO`, `DUPLICADO`, `FORA_DO_ESCOPO` ou `PENDENTE_DE_CONFIRMAÇÃO`.
- Impedir a indexação de qualquer arquivo `PENDENTE_DE_CONFIRMAÇÃO` até a decisão ser registrada.
- Identificar versões antigas, duplicidades, órfãos e trechos sem `drive_file_id`.
- Colocar os 29.337 trechos legados e todas as versões classificadas como antigas em quarentena lógica, removendo-as imediatamente do conjunto pesquisável.
- Depois do backup, da comparação e da aprovação da matriz, remover fisicamente do RAG os trechos e registros obsoletos, preservando somente o inventário de auditoria necessário.
- Reindexar integralmente cada documento novo aprovado para garantir que seu conteúdo completo, metadados, páginas e seções estejam presentes.
- Criar registro explícito de documento ativo, versão, caminho, hash e estado de indexação.
- Corrigir jobs presos em `running` e impedir concorrência ou estado indefinido.
- Garantir sincronização recursiva da raiz e da pasta Biblioteca.
- Validar adição, alteração, movimentação e exclusão de arquivos.
- Preservar backup e possibilidade de restauração durante toda a reconciliação.

### Cadeia que deve ser validada

O teste não termina quando o arquivo muda no Drive. A execução deve comprovar, nesta ordem:

1. alteração real no Google Drive;
2. detecção pelo planejador executado pelo timer da VPS;
3. criação correta do job `new`, `changed` ou `removed` no Supabase;
4. processamento do job pelo worker da VPS;
5. atualização ou remoção correta no manifesto;
6. inserção ou exclusão dos trechos na tabela vetorial;
7. comportamento correto da busca do RAG;
8. resposta final correta no aplicativo;
9. atualização correta das métricas e dos logs no painel.

### Protocolo real A — retirada do plano antigo

1. Registrar o arquivo antigo, seu hash, nome, eventual `drive_file_id`, quantidade de trechos e frases exclusivas usadas como marcadores.
2. Registrar consultas que atualmente encontram fatos exclusivos do plano antigo, incluindo o nome “Alexandre Caminha”.
3. Confirmar qual plano novo substitui formalmente o antigo.
4. Retirar o arquivo antigo da pasta ativa do Drive, quando ele ainda estiver no Drive.
5. Para trechos legados sem `drive_file_id`, aplicar a matriz de substituição e removê-los do índice ativo por identidade documental, nunca apenas por semelhança de nome.
6. Executar a sincronização pela mesma cadeia usada em produção: planejador, fila e worker da VPS.
7. Confirmar job `removed` concluído quando houver arquivo no manifesto.
8. Confirmar zero trechos ativos pelo ID antigo, hash, fonte e marcadores exclusivos.
9. Executar busca vetorial, busca administrativa e conversa real; nenhuma delas pode recuperar ou responder fatos exclusivos do plano antigo.
10. Executar três ciclos completos de sincronização e confirmar que os trechos antigos não reaparecem.

Este protocolo deve usar obrigatoriamente o plano antigo que causou o incidente do cliente. Um documento sintético pode complementar o ensaio, mas não substitui a prova com o arquivo real.

### Protocolo real B — entrada do plano novo

1. Adicionar o plano novo aprovado à pasta controlada do Drive ou restaurá-lo após o ensaio de homologação.
2. Confirmar que o planejador cria job `new` e que o worker o conclui sem erro.
3. Confirmar manifesto ativo com ID, caminho, versão, hash, horário e número de trechos.
4. Comparar páginas e seções do arquivo com os trechos indexados, incluindo início, meio e fim do documento.
5. Pesquisar frases exclusivas do plano novo diretamente no banco e pela recuperação do RAG.
6. Fazer perguntas reais no aplicativo sobre professores, cronograma, avaliações e datas presentes apenas no plano novo.
7. Conferir resposta, trechos recuperados, documento, página ou seção e tempo total.
8. Executar uma nova sincronização sem alterar o arquivo e provar idempotência: nenhum trecho duplicado e nenhum embedding desnecessário.

Este protocolo deve usar obrigatoriamente o plano novo aprovado pelo cliente e comparar suas informações com as que falharam no aplicativo anterior.

### Protocolo real C — atualização do mesmo documento

1. Alterar uma cópia controlada do documento sem mudar seu ID no Drive.
2. Confirmar job `changed`.
3. Confirmar que os trechos da versão anterior são removidos somente depois de a nova versão ser gravada com sucesso.
4. Provar que o fato novo é recuperável e o fato removido deixou de ser recuperável.
5. Forçar uma falha controlada de processamento e confirmar que a versão íntegra anterior não é perdida nem substituída parcialmente.

### Protocolo real D — pasta Biblioteca

1. Inventariar todos os arquivos e trechos cujo caminho pertença à Biblioteca.
2. Selecionar um documento real da Biblioteca e registrar ID, caminho, hash, páginas e quantidade de trechos.
3. Fazer perguntas cuja resposta exista apenas nesse documento e confirmar sua recuperação e resposta correta.
4. Adicionar um documento controlado à Biblioteca e comprovar o fluxo `new` completo.
5. Alterar o documento e comprovar o fluxo `changed`, sem duplicações.
6. Remover o documento e comprovar o fluxo `removed`, com zero trechos e zero recuperação posterior.
7. Executar três ciclos de sincronização e confirmar que o documento removido não reaparece.
8. Confirmar que documentos fora da Biblioteca não são apresentados como se pertencessem a ela.

Pelo menos uma pergunta de aceite deve depender exclusivamente de um documento real da Biblioteca. O teste controlado de adicionar, alterar e remover pode usar uma cópia identificada para homologação, desde que percorra a mesma automação da produção.

### Testes obrigatórios

- Comparar uma amostra de cada documento novo com sua versão anterior e registrar as diferenças relevantes.
- Confirmar que cada documento novo aprovado aparece no inventário com versão, hash, caminho e número de trechos coerentes.
- Consultar informações que existem somente nos arquivos novos e confirmar que as respostas usam esses arquivos.
- Consultar informações que existem somente nos arquivos antigos e confirmar que elas não são mais recuperadas nem respondidas.
- Pesquisar diretamente no banco nomes, datas e frases exclusivas das versões antigas e confirmar ausência no conjunto ativo do RAG.
- Adicionar um documento controlado e confirmar sua indexação.
- Alterar o documento e confirmar substituição integral dos trechos antigos.
- Mover o documento entre raiz e Biblioteca sem duplicação.
- Remover o documento e confirmar que ele deixa de ser recuperável.
- Retirar uma versão antiga e provar que ela não reaparece.
- Executar novamente a sincronização e provar que arquivos removidos não são recriados por manifesto, job preso ou carga legada.
- Comparar o inventário final do Drive, manifesto e Supabase arquivo por arquivo.
- Confirmar que todos os documentos ativos têm identidade, caminho e hash rastreáveis.
- Confirmar a cadeia completa Drive → timer VPS → fila → worker → manifesto → trechos → busca → resposta → painel nos protocolos A, B, C e D.
- Repetir as perguntas críticas no mínimo três vezes após a última sincronização e obter respostas fundamentadas no documento correto em todas as execuções.

### Critério de aprovação

A matriz de substituição foi revisada; os protocolos reais A, B, C e D passaram integralmente; todos os documentos novos aprovados estão completos e pesquisáveis; todas as versões antigas estão fora do índice ativo e não podem ser recuperadas por nenhuma rota; o inventário do Supabase coincide com o Drive; não existem fontes ativas órfãs; e três ciclos consecutivos da cadeia completa funcionam sem erro, duplicação ou recriação de conteúdo removido. Qualquer resposta errada mantém a Fase 1 aberta.

---

## Fase 2 — Recuperação correta, cobertura e desempenho

**Objetivo:** recuperar a evidência certa, atual e suficiente, sem aumentar indevidamente o tempo de resposta ao aluno.

### Ações

- Usar o identificador do documento ativo, e não apenas padrões de nome.
- Implantar busca híbrida, combinando semântica, termos e filtros de metadados.
- Criar trilhas de busca adequadas para conteúdo acadêmico, plano atual e Biblioteca.
- Garantir candidato da Biblioteca quando a intenção da pergunta exigir esse acervo.
- Aplicar reranking e limiar mínimo de evidência.
- Impedir geração factual quando a evidência recuperada for insuficiente.
- Medir separadamente tempo de busca, reranking, modelo, avaliação e resposta total.
- Comparar modelos e fallbacks com o mesmo conjunto de testes, considerando aderência, fundamentação, latência, estabilidade e custo.

### Metas iniciais de desempenho

- A avaliação automática de qualidade permanece assíncrona e fora do caminho crítico do aluno.
- Busca e reranking devem possuir orçamento de tempo explícito e timeout seguro.
- P50, P95 e taxa de timeout serão definidos a partir de uma bateria real, não de valores simulados. Como referência de aceite, a primeira meta provisória será P50 de até 8 s, P95 de até 15 s e timeout inferior a 1%; ela só será mantida se não reduzir a correção documental.
- A resposta precisa retornar ao aluno sem esperar a avaliação automática; a avaliação, o registro de qualidade e a atualização do painel ocorrerão em segundo plano.
- O benchmark deverá separar: latência de rede, busca híbrida, reranking, modelo, persistência e tempo total percebido.
- Cache só poderá ser usado com chave que inclua a versão do corpus e os filtros de documentos ativos; não pode servir resposta produzida antes de uma atualização do RAG.
- Nenhuma otimização pode reduzir a correção documental ou esconder falhas.

### Testes obrigatórios

- Pergunta respondível somente por documento da Biblioteca.
- Pergunta administrativa respondida somente pelo plano atual.
- Pergunta sem evidência suficiente recebe resposta transparente.
- Pergunta ambígua solicita esclarecimento quando necessário.
- Teste de carga moderada mede P50, P95, erros e timeouts.

### Critério de aprovação

As respostas recuperam as fontes corretas nos casos críticos, a falta de evidência é tratada com segurança e os tempos reais ficam dentro da meta aprovada.

---

## Fase 2A — Qualidade do RAG e velocidade antes da troca de runtime

**Objetivo:** elevar a qualidade das respostas com evidência atual e reduzir o tempo percebido pelo aluno antes de mover o tráfego para a VPS.

### Ações

- Fechar o conjunto de documentos ativos produzido pela Fase 1 e versioná-lo como `corpus_version`.
- Aplicar filtros obrigatórios de estado, identidade do documento, versão e escopo antes da busca; nome parecido nunca será suficiente para autorizar um documento.
- Usar busca híbrida com reranking somente dentro do conjunto ativo e com trilha de recuperação persistida.
- Fazer a geração receber apenas os trechos selecionados e seus metadados documentais; quando a evidência não atingir o limiar, responder que não há base suficiente.
- Validar cada afirmação factual e cada referência contra os trechos realmente usados, sem inventar fonte a partir do texto.
- Medir e comparar os modelos configurados, incluindo o modelo indicado pelo cliente, no mesmo conjunto de perguntas reais; a escolha final será por correção, fundamentação, estabilidade, latência e custo.
- Adicionar cache seguro por consulta normalizada + `corpus_version` + modalidade, com invalidação automática em qualquer `new`, `changed` ou `removed`.
- Criar e validar índice dedicado para `metadata.drive_file_id`, reduzindo o custo de localizar staging, finalizar versões e remover documentos sem varrer a tabela inteira.
- Manter o avaliador automático assíncrono e criar amostras de auditoria com `request_id`, fontes, tempos e versão do prompt.

### Testes obrigatórios

- Três execuções de cada pergunta crítica sobre o plano atual, Biblioteca e falta de evidência.
- Comparação de resposta e fontes antes/depois da otimização, sem aceitar ganho de velocidade com perda de fundamentação.
- Bateria de carga moderada com pelo menos 30 requisições, registrando P50, P95, timeout, erro e custo aproximado.
- Repetição após uma atualização do corpus para provar que o cache não serve conteúdo antigo.
- Conferência de 100% das referências exibidas na amostra contra arquivo, hash, trecho e página/seção.

### Critério de aprovação

Zero resposta crítica apoiada em documento obsoleto ou fonte inventada; todas as perguntas críticas são reproduzíveis; a meta de latência aprovada é cumprida; e a avaliação assíncrona não aumenta o tempo percebido pelo aluno.

---

## Fase 8 — Runtime do Guapu na VPS e retirada controlada da dependência da Vercel

**Objetivo:** executar o aplicativo Guapu na VPS com o mesmo código homologado, mantendo a Vercel como rollback até que o novo runtime esteja comprovado.

### Ações

- Criar um serviço/container exclusivo do Guapu na VPS, separado dos serviços existentes e do worker em `/opt/guapu`, sem sobrescrever projetos já em execução.
- Fixar o deploy por commit e imagem identificável; o serviço terá healthcheck em `/api/health`, reinício controlado, limites de CPU/memória e logs estruturados.
- Configurar segredos somente no ambiente da VPS, fora do repositório e fora das imagens; nunca copiar `.env` para o Git ou para artefatos públicos.
- Reutilizar Supabase, Gemini, telemetria e o worker já homologados, mantendo o mesmo schema, `corpus_version`, prompts e regras de referência.
- Publicar primeiro em porta interna e hostname de homologação, atrás do Nginx/TLS já existente; não alterar DNS público nesta fase.
- Testar aplicação, painel, autenticação, chat, feedback, exportação e monitoramento no runtime da VPS.
- Comparar VPS e Vercel com o mesmo roteiro, mesmas perguntas, mesmo corpus e mesma configuração; respostas, fontes, erros e latências devem ser equivalentes dentro da tolerância aprovada.
- Configurar `guapu.agentesnasaude.com.br` e `guapu-painel.agentesnasaude.com.br` somente como etapa de cutover, depois da homologação; manter os endereços da Vercel disponíveis como rollback.
- Fazer a troca por DNS com TTL reduzido, registrar horário e versão, observar erros e latência, e reverter imediatamente se qualquer critério crítico falhar.
- Depois de período de estabilidade aprovado, decidir se a Vercel será mantida como contingência ou desativada. A desativação não faz parte do primeiro cutover.

### Testes obrigatórios

- Build limpo e inicialização repetida do container/serviço.
- Healthcheck, reinício controlado, logs, métricas e alertas.
- Bateria permanente de regressão no hostname da VPS.
- 30 requisições de carga moderada sem erro crítico, com P50/P95 comparados à Vercel.
- Teste de indisponibilidade controlada do serviço e rollback para a Vercel.
- Teste de atualização do RAG enquanto o app roda na VPS, confirmando que novas respostas usam o corpus correto.
- Verificação dos dois domínios, TLS, autenticação do painel e ausência de segredo exposto.

### Critério de aprovação

O Guapu funciona na VPS com o mesmo commit e configuração aprovados, todas as rotas críticas respondem, as métricas e fontes são equivalentes, o rollback é testado e não há aumento de erros ou latência. Só então o DNS é direcionado para a VPS.

---

## Fase 3 — Referências rastreáveis e verificadas

**Objetivo:** exibir somente referências reais dos documentos efetivamente usados na resposta.

### Ações

- Tornar obrigatórios metadados de documento: ID, nome, título, versão, caminho, página ou seção e hash.
- Registrar a cadeia resposta → alegação → trecho → documento → página/seção.
- Substituir heurísticas baseadas em frases por metadados estruturados.
- Validar no servidor toda referência antes de exibi-la.
- Rejeitar fragmentos, referências incompletas, duplicadas ou sem fonte ativa.
- Remover marcadores numéricos visíveis do texto do aluno, mantendo a trilha interna.
- Não exibir seção de referências quando nenhuma fonte puder ser comprovada.

### Testes obrigatórios

- Resumo sobre jejum sem referências quebradas.
- Fonte com autor, título e ano completos.
- Fonte sem autor completo, mas com documento e página comprovados.
- Trecho de frase parecido com título é rejeitado.
- Documento removido não pode ser citado.
- Cada referência aberta no painel aponta para o trecho realmente recuperado.

### Critério de aprovação

100% das referências exibidas nos casos de homologação possuem vínculo verificável com documentos ativos e efetivamente usados na resposta.

---

## Fase 4 — Prompts v1.3 e máquina de estados determinística

**Objetivo:** aplicar os três prompts novos sem depender do modelo para decisões de interface ou navegação.

### Ações

- Consolidar e ativar a versão v1.3 como pacote único e versionado.
- Manter prompts compactos e medir seu impacto no tempo e na aderência.
- Fazer os Action Cards enviarem `MODALIDADE_ATIVA` estruturada.
- Implementar comandos determinísticos para menu, novo quiz, encerrar e trocar modalidade.
- Distinguir recusa ética de tema válido com conteúdo insuficiente.
- Nunca expor ao aluno termos internos como RAG, chunks, embeddings ou fallback.
- Controlar estrelas, opções e ações pelo estado da conversa.
- Produzir feedback de quiz curto conforme a modalidade.
- Garantir que o Hero inicial seja estático e não gerado pelo modelo.

### Testes obrigatórios

- “Menu” apresenta quatro opções separadas.
- “Um novo quiz” interrompe o fluxo anterior e pede o tema.
- Quiz sobre Hemostasia não produz recusa ética indevida.
- Falta de conteúdo usa mensagem de insuficiência, não mensagem de guardrail.
- Cada cartão inicia a modalidade correta.
- Estrelas aparecem somente nos estados previstos.
- Nenhuma saída contém jargão interno.

### Critério de aprovação

Os fluxos críticos são reproduzíveis, independem de correspondência frágil de texto e obedecem à v1.3 nos casos de homologação.

---

## Fase 5 — Interface nova de 27/08/2026

**Objetivo:** implementar fielmente a interface aprovada sem comprometer responsividade, legibilidade ou espaço útil.

### Ações

- Usar a especificação e os arquivos de `documentos/Interface/Interface Nova 27_08_26` como referência.
- Aplicar Hero, textos, logotipo, ícones, cores e componentes aprovados.
- Exibir “Tutor de Enfermagem” como contexto no cabeçalho, não como nome do assistente.
- Remover o nome textual da bolha do assistente, mantendo apenas o avatar conforme especificação.
- Aplicar rótulos em caixa e capitalização corretas.
- Ajustar menu, cartões, chat, rodapé e estados móveis.
- Testar desktop, tablet e celular, inclusive zoom e teclado.
- Garantir acessibilidade básica: foco, contraste, semântica e áreas de toque.

### Testes obrigatórios

- Comparação visual com a especificação aprovada.
- Desktop sem rolagem desnecessária na tela inicial nas resoluções suportadas.
- Celular sem cortes de cabeçalho, Hero, ações ou campo de conversa.
- Menu e alternativas A, B, C e D em linhas e controles separados.
- Fluxo completo utilizável com teclado.

### Critério de aprovação

A interface corresponde à versão aprovada, funciona nos tamanhos definidos e não altera negativamente os fluxos ou o desempenho.

---

## Fase 6 — Painel e avaliação de qualidade auditáveis

**Objetivo:** permitir monitoramento real do aplicativo e investigação rápida de respostas ruins.

### Ações

- Remover métricas decorativas, duplicadas ou sem fonte confiável.
- Definir fórmula, origem e janela temporal de cada indicador.
- Exibir qualidade fundamentada nas evidências recuperadas, não como validação clínica absoluta.
- Manter avaliação automática assíncrona para não atrasar o aluno.
- Registrar conformidade com evidência, evidência insuficiente, resposta incompleta, incorreta e em avaliação.
- Exibir latência de busca, modelo e total em P50 e P95.
- Exibir falhas técnicas, ausência de contexto, timeouts e taxa de recuperação.
- Permitir investigação por `request_id`, conversa, resposta, fontes e versão do prompt.
- Validar exportação de dados reais.

### Testes obrigatórios

- Conferir amostra manual do painel diretamente contra o banco.
- Confirmar que nenhum indicador usa valor fixo ou simulado.
- Forçar casos de sucesso, falta de evidência e falha técnica e conferir a classificação.
- Confirmar que a avaliação assíncrona não aumenta o tempo percebido pelo aluno.
- Confirmar exportação com os mesmos números exibidos.

### Critério de aprovação

Cada número importante do painel pode ser reproduzido por consulta e cada resposta crítica pode ser investigada até suas fontes e tempos.

---

## Fase 7 — Homologação diária e liberação controlada

**Objetivo:** validar o comportamento com o cliente e liberar a produção sem repetir erros conhecidos.

### Ações

- Disponibilizar versão estável no ambiente de homologação.
- Entregar roteiro curto de testes diários ao cliente.
- Registrar cada retorno com data, conversa, entrada, saída e resultado esperado.
- Converter falhas confirmadas em testes de regressão.
- Executar bateria completa antes de cada promoção.
- Promover versão identificada para produção somente após aprovação.
- Monitorar as primeiras horas e manter rollback pronto.

### Critério de aprovação

Cliente e Leonardo aprovam a bateria acordada, não existem erros críticos abertos e a versão promovida é exatamente a versão homologada.

## 6. Bateria mínima permanente de regressão

1. “Menu” retorna quatro ações separadas.
2. “Quem são os professores?” consulta somente o plano atual.
3. “Quais aulas haverá em 16/09?” usa o plano atual ou declara ausência de evidência.
4. Resumo sobre jejum não produz referências quebradas.
5. Quiz sobre Hemostasia não aciona recusa ética.
6. “Um novo quiz” reinicia o fluxo e pede tema.
7. Marcadores `[2]` e `[3,4,5]` não aparecem ao aluno.
8. Cada Action Card inicia a modalidade correta.
9. Pergunta respondível somente pela Biblioteca usa documento da Biblioteca.
10. Documento adicionado ao Drive torna-se recuperável.
11. Documento alterado substitui a versão anterior sem duplicação.
12. Documento removido deixa de ser recuperável e citável.
13. Evidência insuficiente produz resposta transparente e sem referência falsa.
14. Guardrail verdadeiro produz a mensagem ética correta.
15. Feedback do quiz respeita o tamanho previsto.
16. Latência de busca, modelo e resposta total é registrada.
17. As métricas do painel coincidem com os registros do banco.
18. Desktop e celular não apresentam cortes ou controles inacessíveis.
19. Informação exclusiva de arquivo novo é recuperada e informação exclusiva da versão antiga não é recuperada.
20. Uma nova sincronização não recria trechos de documentos antigos removidos.

## 7. Evidência obrigatória por teste

Cada teste deverá registrar, quando aplicável:

- data e versão da aplicação;
- ambiente testado;
- `request_id`;
- texto ou ação de entrada;
- modalidade e estado do fluxo;
- documentos e trechos recuperados;
- versão do prompt e modelo;
- resposta entregue;
- latência de busca, modelo e total;
- resultado esperado e resultado observado;
- classificação: aprovado, reprovado ou bloqueado;
- captura ou log que permita reproduzir o caso.

As evidências de cada fase serão salvas em `documentos/QA/Fase_<numero>/`, separadas por data e versão. Para a Fase 1, o pacote mínimo deve conter:

- inventário antes e depois;
- matriz de substituição documental;
- hashes e identificadores dos planos antigo e novo;
- contagens SQL antes da remoção, após a remoção e após a nova indexação;
- IDs e estados dos jobs da fila;
- registros do worker da VPS;
- resultado dos três ciclos consecutivos;
- consultas de recuperação e conversas reais antes/depois;
- evidência específica da pasta Biblioteca;
- conclusão assinada como `APROVADA` ou `EM CORREÇÃO`.

## 8. Estratégia de modelos

- Usar o modelo de raciocínio mais forte disponível, como **Sol Alto**, nas fases de arquitetura, reconciliação, recuperação, referências, prompts e auditoria.
- Usar **Terra Médio** apenas em tarefas mecânicas ou visuais de menor risco, depois de as regras críticas estarem fechadas.
- A escolha do modelo executado pelo Guapu será feita por benchmark controlado com a mesma bateria de perguntas.
- Nenhum modelo será aprovado apenas por impressão subjetiva; serão comparados correção documental, aderência, estabilidade, latência e custo.

## 9. Controle de status

| Fase | Status | Data de aprovação | Evidência | Aprovado por |
|---|---|---|---|---|
| 0. Contenção e ambiente seguro | Em execução | — | — | — |
| 1. Comparação documental, remoção de antigos e reconciliação Drive ↔ Supabase | Aprovada | 28/08/2026 | `documentos/QA/Fase_1/VERIFICACAO_FINAL_FASE_1_2026-08-28.md` | Leonardo |
| 2. Recuperação e desempenho | Aguardando | — | — | — |
| 2A. Qualidade do RAG e velocidade | Em execução | 28/08/2026 | baseline real em preparação | Leonardo |
| 3. Referências verificadas | Aguardando | — | — | — |
| 4. Prompts v1.3 e fluxos | Aguardando | — | — | — |
| 5. Interface nova | Aguardando | — | — | — |
| 6. Painel e avaliação | Aguardando | — | — | — |
| 7. Homologação e liberação | Aguardando | — | — | — |
| 8. Runtime VPS e migração controlada da Vercel | Aguardando | — | — | — |

## 10. Condições que impedem a liberação ao cliente

A versão não será considerada pronta se ocorrer qualquer uma das situações abaixo:

- recuperação de plano, professor, calendário ou documento obsoleto;
- referência sem vínculo comprovado com arquivo ativo e trecho usado;
- resposta factual sem evidência suficiente;
- falha no ciclo de remoção ou atualização do Drive;
- fluxo de quiz, menu ou modalidade inconsistente;
- jargão interno exposto ao aluno;
- indicador do painel sem origem verificável;
- erro crítico conhecido sem teste de regressão;
- versão de produção diferente da versão homologada;
- troca de DNS para a VPS sem comparação com a Vercel, healthcheck e rollback testados;
- aplicativo na VPS sem limites de recurso, logs, alertas ou isolamento dos serviços existentes;
- ausência de rollback comprovado.

## 11. Próxima ação

Executar a **Fase 2A** para medir e corrigir qualidade, referências e latência antes da troca de runtime. A preparação do runtime da VPS poderá avançar em homologação, mas nenhuma troca de DNS ou retirada da Vercel ocorrerá antes de a Fase 2A e a própria Fase 8 serem aprovadas com testes reais e rollback comprovado.
