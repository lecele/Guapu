# Relatório de testes reais — Guapu

**Data:** 30/08/2026  
**Ambiente:** VPS publicada em `https://guapu.agentesnasaude.com.br` e painel protegido em `https://guapu-painel.agentesnasaude.com.br`.

## Resultado executivo

O fluxo operacional foi aprovado no inventário vivo e a bateria crítica de referências passou após duas correções. O app e o painel estão saudáveis, o worker está ativo e a fila de sincronização está zerada.

Há duas pendências que impedem declarar garantia bibliográfica integral e latência ideal para todos os 119 arquivos: o catálogo curado cobre 12/119 documentos e a janela de 30 chamadas ainda apresenta cauda de latência alta quando o provedor troca de modelo.

## 1. Integridade Drive → RAG

Consulta feita diretamente ao Google Drive usando a pasta monitorada e comparada ao Supabase:

- 119 arquivos vivos no Drive: 118 PDFs e 1 DOCX.
- 119 manifestos ativos.
- 119 IDs com chunks ativos.
- 57.796 chunks ativos gerenciados.
- 0 chunks staging.
- 0 vetores ativos sem arquivo vivo.
- 0 arquivos do Drive sem vetor ativo.
- 0 chunks gerenciados órfãos.
- 112 jobs concluídos: 101 `new`, 7 `changed`, 4 `removed`; 0 pendentes, em execução ou falhos.
- Manifesto ao vivo alinhado ao inventário ao vivo: nenhum ID faltante ou excedente.

Uma primeira execução do verificador usou o inventário local de 27/08 e apontou divergência no glossário. A investigação confirmou que o arquivo foi substituído legitimamente por `glossario.docx` em 28/08: o ID antigo foi removido e o novo foi ingerido. A repetição com o inventário vivo de 30/08 passou em modo estrito.

## 2. Testes reais de referências

### Bateria publicada crítica

`run_phase1_rag_release_tests.py --repeat 10`:

- 30/30 casos aprovados.
- Cenários: plano vigente, glossário `near miss` e bloqueio do plano antigo.
- 0 fallback de provedor nesta janela.
- Latência: mínimo 448 ms, P50 928 ms, P95 16.240 ms, máximo 31.879 ms, média 3.792 ms.
- O plano vigente trouxe 216 horas, período 2026-2 e referência da p. 1.
- O plano antigo foi recusado sem fonte.

### Bateria por obra

`run_reference_acceptance_tests.py`:

- 7/7 aprovados: glossário, Manual Técnico, Cuidados Críticos, incisão cirúrgica 2022, deiscência 2018, Nutrição e SOBECC.
- Cada caso passou com fonte correspondente, referência bibliográfica e página real.
- SOBECC passou com `Práticas Recomendadas SOBECC`, 2013, 6ª ed., p. 35; não houve a repetição artificial de “enxágue”.
- Incisão cirúrgica passou com Morgan-Jones et al., 2022, p. 2.
- Deiscência passou com World Union of Wound Healing Societies, 2018, p. 10.
- Nutrição passou com Munoz/Bernstein, 2019, p. 4.

### Testes observados no navegador

Foram observados no app: plano vigente, pós-operatório, glossário, Manual Técnico, Nutrição, incisão cirúrgica, deiscência, SOBECC, plano antigo e pergunta fora do escopo.

O primeiro teste de pós-operatório revelou uma falha real: a resposta era pertinente, mas exibia o fallback “Informação não disponível...”. A causa foi a ausência de identidade curada para três fontes clínicas recuperadas. A correção adicionou o catálogo verificado e vinculou a referência ao documento explicitamente solicitado. Após a publicação, a mesma pergunta passou a exibir as três fontes clínicas e páginas reais.

O teste fora do escopo retornou recusa ética, sem seção de referências visível. O documento antigo retornou “não encontrei conteúdo suficiente”, sem fontes.

### Bateria complementar observada em 30/08

Foi executada uma bateria curta com seis temas novos, uma pergunta por vez, no domínio publicado. A resposta final de cada cenário foi conferida quanto a pertinência temática, referência, página, ausência de fallback e presença do avaliador:

- checklist de cirurgia segura: passou com Protocolo para Cirurgia Segura, OMS e ANVISA, p. 6, 197 e 11; 8,6 s;
- ferida com suturas: passou com Boas Práticas em Sutura Simples, Coren-SP, p. 80; 9,3 s;
- recuperação pós-anestésica: passou com Brunner & Suddarth, p. 809; 10,8 s;
- proteção da pele ao redor do estoma: passou com Linha de Cuidados da Pessoa Estomizada, 2015, p. 45; 8,9 s;
- pós-operatório de cirurgia bariátrica: passou com o artigo de Nayara Lucia do Nascimento et al., 2025, p. 8, e Brunner & Suddarth, p. 1795; 9,6 s;
- teleconsulta de enfermagem: a pergunta genérica falhou por timeout do provedor e recuperação sem escopo suficiente; ela foi rejeitada como sucesso. Após a pergunta determinística com a Resolução Cofen nº 696/2022, passou com a fonte exclusiva do Cofen, p. 1, sem fallback, em 3,8 s.

Resultado final da bateria complementar: 6/6 cenários aprovados após correções; o primeiro erro de teleconsulta permanece registrado como incidente reproduzido, e não como sucesso oculto.

## 3. Painel, telemetria e avaliações

Validação autenticada do endpoint do painel:

- Painel: HTTP 200; Supabase conectado.
- Monitoramento: `healthy`, sem alertas.
- Sincronização: 112 concluídos, 0 pendentes, 0 em execução, 0 falhos.
- Avaliações automáticas exibidas no painel: 381 concluídas, 0 na fila, 0 em execução, 0 falhas; taxa de conformidade 79%; cobertura 97%.
- Feedback humano: 8 avaliações, média 4/5, satisfação 75%.
- O histórico registra `request_id`, recuperação, fontes, páginas, modelo, fallback e latência.

O painel informa 185 fontes e 87.040 chunks porque o resumo administrativo inclui o corpus histórico/quarentenado. Para a reconciliação do acervo atual foram usados os números rastreáveis por `drive_file_id`: 119 arquivos e 57.796 chunks ativos.

## 4. Catálogo bibliográfico

O catálogo curado no runtime e no Supabase possui 19/119 IDs verificados. Esses 19 já têm identidade bibliográfica vinculada ao `drive_file_id` e são usados nas referências determinísticas.

Os outros 100 arquivos continuam com chunks ativos e podem fornecer pistas bibliográficas extraídas do conteúdo, mas ainda não têm garantia curada individual equivalente. Para declarar “todos os arquivos sempre terão referência bibliográfica verificada”, é necessário catalogar e revisar esses 100 documentos, sem inventar autores, ano ou editora.

## 5. Pendências e recomendação

1. **Catálogo dos 100 documentos restantes:** prioridade alta antes da liberação que prometa referência curada para qualquer arquivo.
2. **Latência:** a rodada passou funcionalmente, mas P95 16,24 s e máximo 31,88 s mostram troca de modelo lenta em alguns casos. A próxima otimização deve medir quota/modelo e limitar a cauda sem sacrificar respostas corretas.
3. **Robustez do verificador:** o RPC de contagem apresentou um timeout isolado; três consultas de aquecimento e a repetição estrita passaram. Vale adicionar retry/backoff ao verificador antes de usá-lo como gate automático.

## Conclusão

O app publicado está operacional e os cenários críticos de referência testados estão corretos. A falha de referência pós-operatório foi reproduzida, corrigida e validada no domínio publicado; a bateria complementar também cobriu seis temas novos e passou 6/6 após correções. A Fase 9 pode ser considerada operacionalmente validada, mas a garantia bibliográfica integral de todos os 119 arquivos e a otimização definitiva de P95 continuam pendentes.

## 6. Bateria incremental durante a catalogação — 30/08 17:09–17:16 UTC

- O smoke test clínico passou novamente com resposta contextual e duas referências correspondentes: OMS, p. 127, e SOBECC, p. 210; o avaliador apareceu no app.
- O smoke test administrativo do plano vigente falhou duas vezes com `RETRIEVAL_FAILED`, sem fonte e sem resposta inventada. A investigação confirmou 64 chunks do plano no banco, todos pesquisáveis e sem staging.
- A correção aplicada foi somente nas funções de recuperação do Supabase e na API: a RPC filtrada passou a aceitar o predicado canônico de documentos Drive legados; a API ganhou fallback por fonte exata, mantendo apenas `drive_file_id` e status vazio/active. Não houve reingestão, alteração de conteúdo ou embeddings.
- O teste repetido passou: 216 horas, semestre 2026-2 e referência do Plano de Ensino 2026-2 da UFSC, p. 17. O header exibido foi `Referências` sem dois-pontos e o avaliador apareceu.
- Telemetria do banco confirmou os dois testes aprovados com `has_context=true`, cinco itens de recuperação e cinco referências rastreáveis. Latências totais observadas: 2.012 ms no plano e 15.849 ms na consulta clínica; ambas foram persistidas com `request_id`.
- Uma tentativa de normalizar 5.000 metadados em massa excedeu o timeout upstream e foi abandonada sem commit. A regra compatível ficou nas RPCs; os chunks legados permanecem intactos e pesquisáveis, sem risco de nova manutenção pesada do índice.

## 7. Bateria real adicional no domínio publicado — 30/08

- Pergunta clínica sobre cuidados pré-operatórios: resposta pertinente, referências bibliográficas legíveis e páginas correspondentes; avaliador de 1 a 5 estrelas presente. Tempo observado no navegador: aproximadamente 30 s.
- Pergunta administrativa sobre carga horária e período da INT 5224: resposta com 216 horas e semestre 2026-2; referência exclusiva do Plano de Ensino vigente, p. 1; avaliador presente.
- Quiz sobre feridas: questão 1 exibida com quatro alternativas e feedback avaliável; nenhuma referência foi exibida, conforme a regra do cliente.
- Checagem visual/DOM: 3 respostas com avaliador, 2 respostas com seção `Referências`, 0 referência no quiz e 0 erro/aviso no console do navegador.
- Saúde publicada: HTTP 200 em `/api/health`, Supabase conectado.

Resultado desta rodada: 3/3 cenários funcionais aprovados. A latência do primeiro cenário clínico ficou acima do desejável e deve permanecer como pendência de otimização; isso não foi mascarado como aprovação de desempenho.

Limitação: esta rodada não substitui avaliação semântica individual dos 67 documentos; isso exigiria chamadas reais por documento e consumo adicional de créditos. O contrato de referências foi validado para o catálogo, mas ainda há 52 documentos sem catalogação curada.

## 8. Normalização bibliográfica — 30/08

Foi corrigida a duplicação do ano em referências catalogadas sem autor. Quando o ano já aparece no título — por exemplo, `Plano de Ensino 2026-2` — ele não é mais repetido como prefixo `(2026-2)`. O título, instituição/editora e página permanecem preservados. O caso ganhou teste automatizado específico e a suíte passou 55/55, com lint e build de produção aprovados.

## 9. Auditoria diária — incidente de relevância no tema estoma — 30/08

- Pergunta real: cuidados de enfermagem para proteger a pele ao redor do estoma.
- A resposta apresentou cuidados, relação com a prática, referências e avaliador; não houve erro ou aviso no console.
- Divergência: foram exibidos Brunner & Suddarth e um guia geral de feridas, enquanto a fonte específica `Linha de Cuidados da Pessoa Estomizada` deveria ser priorizada para este tema.
- Latência observada: aproximadamente 37,4 s.
- Classificação: **falha reproduzida de recuperação/priorização de fonte**, não falha de formatação bibliográfica.
- A correção não foi aplicada automaticamente nesta rodada: os testes locais já cobrem a priorização da fonte de estoma, indicando que a versão pública ou o catálogo persistente ainda não está alinhado com o código local. É necessário reconciliar deploy e catálogo do Supabase antes de alterar o ranking.

## 10. Fechamento da manutenção — quatro identidades parciais — 31/08

- Deploy controlado na VPS: backup dos dois artefatos do catálogo em `/opt/guapu-app/backups/20260831-partial4/`; build concluído; `guapu-app` e `guapu-panel` saudáveis.
- Bateria publicada: **8/8 respostas aprovadas**, sendo duas perguntas por material: Clínica Cirúrgica 2, Transporte seguro na SRPA, Alterações respiratórias na SRPA e Analgésicos.
- Todas as respostas recuperaram o documento esperado, exibiram referência parcial literal (`Clínica Cirúrgica 2`, `Passo 1 — Transporte seguro`, `Alterações respiratórias` ou `Analgésicos`) e não exibiram nome de arquivo nem `**Referências:**`.
- Todos os casos persistiram `request_id`, fontes e latência no Supabase, confirmando entrada no histórico/telemetria.
- Latências observadas (ms): 16452, 17117, 16233, 15621, 15173, 15600, 16349, 17248. Amostra curta: P50 aproximado **16,23 s**, P95 observacional **17,25 s**, máximo **17,25 s**. A medição confirma funcionamento, mas não substitui uma janela longa para otimização.
- Saúde após o deploy: `/api/health` HTTP 200, `status=healthy`, `supabase=connected`; worker e timer ativos.

Conclusão: a manutenção funcional e a catalogação operacional dos 119 documentos foram encerradas. Permanecem apenas a otimização de latência em janela maior e, opcionalmente, a obtenção de ficha bibliográfica completa para os quatro materiais parciais; nenhuma delas impede o uso do conteúdo no app.

## 11. Otimização de latência do retrieval — 31/08

- Diagnóstico: `public.match_documents` usava `ivfflat.probes=128` em índice IVFFlat com 256 listas; o benchmark também confirmou que a RPC híbrida falhava e já estava desativada no app (`RAG_HYBRID_ENABLED=false`).
- Correção mínima e reversível: parâmetro da função `match_documents` reduzido para `ivfflat.probes=32`, sem recriar índice, alterar chunks, embeddings, conteúdo ou reprocessar o Drive. Backup da configuração do app: `/opt/guapu-app/backups/20260831-partial4/app.env.before-latency`.
- Benchmark semântico antes: 3,9–5,1 s no RPC; retrieval observado no app: aproximadamente 9,3–9,8 s.
- Benchmark semântico depois: 1,2–1,7 s no RPC; retrieval observado no app: 1,3–1,6 s.
- Bateria publicada depois da mudança: **4/4 aprovados** nos quatro materiais parciais, com fontes corretas, referências parciais literais e telemetria persistida.
- Latência total depois: 6,542–7,498 s nos quatro cenários; embedding 0,388–0,439 s; geração 4,561–5,543 s.
- Saúde final: endpoint público HTTP 200, Supabase conectado, containers saudáveis e worker/timer ativos.

Conclusão: a otimização foi aceita. A qualidade e a seleção das fontes permaneceram aprovadas; a cauda restante está principalmente na geração do modelo, não no retrieval. Uma medição de janela longa continua recomendável para acompanhamento, mas não bloqueia a manutenção funcional.

## 12. Bateria observada no navegador após sanitização — 31/08

- Plano vigente: resposta com 216 horas e semestre 2026-2; referência sem repetição do ano; avaliador presente.
- Prevenção de infecção do sítio cirúrgico: resposta contextual e referência bibliográfica correspondente; avaliador presente.
- Recuperação anestésica/SRPA: a primeira resposta pós-deploy ainda deixou marcadores antigos no histórico da sessão; após a correção, a repetição saiu sem `materiais consultados 1/2/3`, manteve `Passo 1 — Transporte seguro. p. 3.` e a referência SOBECC.
- Sinais respiratórios na SRPA: resposta contextual, referência parcial `Alterações respiratórias. p. 2.` e referência SOBECC, sem fallback.
- Pergunta fora do acervo: recusa ética sem referências, conforme regra do cliente.
- Saúde final: app e painel saudáveis, Supabase conectado, worker ativo.

A sanitização foi adicionada ao código, coberta por teste automatizado e publicada com build aprovado. O marcador observado na primeira resposta permanece apenas como histórico já gerado; novas respostas não o reproduziram.

## 13. Correção do formato bibliográfico e revalidação publicada — 31/08

- Causa confirmada: o formatador colocava o ano no início quando o chunk não trazia autor catalogado, produzindo a saída inadequada `- (2020). Título...`.
- Correção mínima em `lib/chat/references.ts`: quando não há autor, a referência passa a ser formatada como `- Título. (ano). Editora/periódico...`; títulos que já contêm o ano continuam sem repetição.
- Suíte local: **58/58 testes aprovados**. Build de produção: concluído sem erro.
- Deploy controlado: backup remoto de `references.ts` criado em `/opt/guapu-app/backups/20260831-partial4/` antes da publicação; containers `guapu-app` e `guapu-panel` recriados.
- Teste real publicado — prevenção de infecção do sítio cirúrgico: `O papel do enfermeiro na prevenção de infecção no sítio cirúrgico. (2020). Brazilian Journal of Health Review, 3(6), 16969-16977. p. 1.` Não começa pela data e não repete o ano.
- Teste real publicado — transporte/admissão na SRPA: resposta concluída em aproximadamente 14 s, com `Passo 1 — Transporte seguro. p. 3.` e `Práticas Recomendadas SOBECC. (2013). 6ª ed. p. 284.`; não exibiu os marcadores internos `materiais consultados`.
- Saúde pós-publicação: `/api/health` HTTP 200, `status=healthy`, `supabase=connected`; worker e timer ativos.

Conclusão: o erro visual de referência iniciada pela data e a exposição dos marcadores internos ficaram corrigidos para novas respostas. Mensagens antigas no histórico podem conservar a saída anterior, pois não foram reprocessadas.

## 14. Alinhamento final da interface — 31/08

- Ajuste aplicado em `app/globals.css`: a tag `Tutor de Enfermagem` fica oculta no breakpoint mobile de até 620px, conforme a especificação da interface.
- Ajuste aplicado no componente legado `components/chat/ChatContainer.tsx`: o cabeçalho deixou de exibir `Guapu · Tutor de Enfermagem` como uma única identificação e passou a usar o `GuapuMark` com o wordmark `Guapu`.
- Testes locais: **58/58 aprovados**. Build local e build remoto concluídos.
- Deploy controlado com backups dos dois arquivos em `/opt/guapu-app/backups/20260831-partial4/`.
- Validação publicada: Hero Card, cabeçalho `Guapu` + `Tutor de Enfermagem`, quatro Action Cards, placeholder e rodapé presentes; containers saudáveis e Supabase conectado.
- Limitação: o navegador conectado não disponibilizou controle de viewport, portanto o breakpoint mobile foi validado pelo CSS publicado, mas não por emulação visual nesta sessão.

Conclusão: as divergências confirmadas entre a especificação de interface e o código foram corrigidas. Permanecem apenas a observação operacional de timeouts ocasionais dos modelos e a confirmação visual em um celular físico.

## 15. Teste isolado dos provedores de modelo — 31/08

- Teste mínimo executado diretamente no container publicado, sem expor chaves nem conteúdo de usuário.
- OpenAI `gpt-4o-mini`: HTTP 200 em **1,05 s**.
- Moonshot `kimi-k3`: HTTP 200 em **2,34 s**.
- Configuração atual: OpenAI como provedor principal; Moonshot e Gemini na cadeia de fallback.
- Resultado: os timeouts registrados anteriormente foram transitórios ou dependentes da chamada completa; não foram reproduzidos no teste mínimo atual.

Conclusão: os dois provedores estão acessíveis e funcionais neste momento. A ordem atual permanece adequada; a estabilidade das chamadas completas deve continuar sendo acompanhada pela telemetria do app.

## 16. Bateria final pré-liberação — 31/08

- Clínica — prevenção de infecção do sítio cirúrgico: resposta contextual, referência bibliográfica correspondente, formato correto e avaliador disponível; aproximadamente **21,1 s**.
- Administrativo — carga horária/período da INT 5224: retornou 216 horas e semestre 2026-2, com referência do Plano de Ensino; aproximadamente **18,6 s**.
- Guardrail — pedido de diagnóstico: recusa padrão correta, sem referência; aproximadamente **18,6 s**.
- Clínica — transporte e admissão na SRPA: resposta contextual, referências `Passo 1 — Transporte seguro. p. 3.` e `Práticas Recomendadas SOBECC. (2013). 6ª ed. p. 284.`, sem marcadores internos; aproximadamente **20,7 s**.
- Quiz — estomas: iniciou a questão 1 com quatro alternativas e sem referências na nova resposta; aproximadamente **20,8 s**.
- Saúde após a bateria: `/api/health` HTTP 200, `status=healthy`, `supabase=connected`; `guapu-app` e `guapu-panel` saudáveis; worker e timer ativos; nenhum erro novo nos logs dos últimos 8 minutos.

Conclusão: a bateria funcional pré-liberação foi aprovada nos cinco cenários. O app está operacional e aderente aos fluxos testados. A latência observada continua acima do ideal em algumas respostas e deve ser acompanhada após a liberação; isso não bloqueou o aceite funcional desta bateria.

### Complemento — feedback do quiz

- Alternativa `B` no quiz de estomas foi reconhecida como correta.
- O feedback foi breve: `Sua resposta está correta.`
- O fluxo avançou para a questão 2, sem inserir referências.
- Tempo observado do turno: aproximadamente **21,3 s**.

## 17. Gate operacional final para liberação — 31/08

- URL pública: HTTP **200**, servida pelo proxy Nginx.
- `/api/health`: `status=healthy`, `supabase=connected`.
- `guapu-app` e `guapu-panel`: running/healthy.
- `agentes-saude-api` e demais serviços observados: ativos; os outros projetos da VPS permaneceram em execução.
- Worker `guapu-drive-sync-worker.service`: active.
- Timer `guapu-drive-sync-queue.timer`: active.
- Disco da VPS: **55% usado**, 43 GB disponíveis de 99 GB.
- Logs dos últimos 15 minutos do app e do proxy: sem `502`, `503`, `504`, timeout, quota ou exceção registrada.

Conclusão: não há bloqueio operacional identificado para a liberação do Guapu. A latência e os timeouts transitórios de provedores continuam como itens de observação pós-liberação, sem indisponibilidade atual.
