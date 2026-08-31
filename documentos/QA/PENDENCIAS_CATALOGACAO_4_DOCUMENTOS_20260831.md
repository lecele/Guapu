# Mapa das 4 pendências de catalogação

Data: 31/08/2026  
Status geral: **119/119 documentos com entrada no catálogo**; os quatro últimos foram cadastrados como **identidades parciais**, conforme a regra do cliente.

Este mapa separa os quatro documentos que foram lidos novamente no PDF original do Drive. Eles continuam pesquisáveis e seus conteúdos não foram alterados. A pendência é somente de identidade bibliográfica formal.

| # | Drive file ID | Nome no inventário | Chunks | O que foi confirmado | O que falta para catalogar |
| --- | --- | --- | ---: | --- | --- |
| 1 | `1uC-_-TFRVx4pPW90wwfm0nS8CzkzdcMY` | `biblioteca__clinica_cirurgica__resumo__medcel__sem_data__v1` | 780 | O conteúdo começa com “clínica cirúrgica 2 SIC Resumão revalida”. | Título oficial, autores/organizadores, ano, edição, editora ou instituição e referência bibliográfica original. |
| 2 | `1a0YMt3q7p70f5iFaX_qQJ1RHouEvalYA` | `cuidados_pos__recuperacao_anestesica_segura__apostila__sobecc__nao_disponivel__v1` | 7 | Apostila com passos de transporte, admissão, manutenção e alta segura na SRPA. | Autoria, instituição responsável, título oficial, ano/edição e editora ou fonte institucional. |
| 3 | `1_VSuj-wh7VOliXi2M_7idLkb1jEAk5Yn` | `cuidados_pos__sinais_agravo__apostila__sobecc__nao_disponivel__v1` | 8 | Material de sinais de alerta e condutas de enfermagem na SRPA. | Autoria, instituição responsável, título oficial, ano/edição e fonte bibliográfica. |
| 4 | `1Tm4GYvbkUYo315CYRF4ssgWIoAdjIC-H` | `dor_pos_operatoria__tabela_medicamentos_cirurgica__guia__prof_juliana_balbinot_reis_girondi_prof_keyla_nascimento__2022__v1` | 15 | Tabela didática elaborada por Juliana Balbinot Reis Girondi e Keyla Nascimento; contém 9 referências internas, incluindo ANVISA/CBM, Trissel, bula Zofran e Formulário Terapêutico Nacional. | Título oficial da obra/material, instituição/disciplina, versão/ano e forma de citação da própria tabela. As 9 referências internas já estão preservadas no conteúdo. |

## Regra de decisão

- Não usar o nome técnico do arquivo como referência bibliográfica.
- Não transformar uma referência interna da tabela em identidade da própria obra.
- Não preencher autor, ano, editora ou instituição por aproximação.
- Se o cliente confirmar apenas que são materiais didáticos internos, cadastrar como material institucional/didático, com a instituição e a disciplina informadas, sem classificá-los como livro ou artigo.

## Evidências da conferência

- Auditoria direta dos PDFs: `scratch/audit11-rerun.json`.
- Inventário e evidências de chunks: `scratch/catalogacao_raw_20260830.json`.
- Relatório consolidado: `documentos/QA/RELATORIO_CATALOGACAO_100_DOCUMENTOS_20260830.md`.

Os quatro agora possuem entrada no catálogo com `reference_confidence=partial`. Isso não afirma que sejam livros/artigos completos: apenas registra pistas literais confirmadas no PDF. Eles continuam disponíveis para recuperação de conteúdo.

### Fechamento controlado dos quatro

| Drive file ID | Identidade parcial cadastrada | Evidência literal | Metadados não preenchidos |
| --- | --- | --- | --- |
| `1uC-...` | Clínica Cirúrgica 2 — SIC Resumão Revalida | Cabeçalho inicial do PDF | autor, ano, edição, editora |
| `1a0Y...` | Passo 1 — Transporte seguro | Seção explícita do PDF | título oficial, autoria, instituição, ano |
| `1_VS...` | Alterações respiratórias | Seção explícita do PDF | título oficial, autoria, instituição, ano |
| `1Tm4...` | Analgésicos | Cabeçalho explícito da tabela | título oficial, autoria institucional, ano |

Essas entradas foram propagadas idempotentemente aos chunks correspondentes após backup de metadados em `/opt/guapu-app/backups/20260831-catalog-partial-4/`. O conteúdo, embeddings, índices e status dos chunks não foram alterados.

## Classificação e comportamento exigidos pelo documento do cliente

O documento do cliente não determina que todo arquivo precise ser convertido em livro ou artigo. Ele determina que o assistente use a melhor referência comprovável em três camadas, sempre baseada nos trechos consultados:

| Documento | Classificação operacional | Como o assistente deve agir em uma consulta |
| --- | --- | --- |
| `1uC-...` | Material didático/resumão interno, identidade editorial não confirmada | Pode responder usando apenas o conteúdo consultado. Como existe um cabeçalho identificável no início (“clínica cirúrgica 2 SIC Resumão revalida”), pode usar referência parcial de camada 2, sem nome de arquivo, `.pdf` ou dados inventados. Se esse cabeçalho não estiver entre os trechos recuperados, usar a camada 3. |
| `1a0Y...` | Apostila/material didático de recuperação anestésica, sem ficha bibliográfica | Responder apenas com o material consultado. Usar camada 2 somente quando o trecho trouxer um título ou seção real, como “Passo 1 — Transporte seguro”; não transformar uma frase de instrução em título. Sem identificador em nenhum trecho, usar a camada 3. |
| `1_VS...` | Material didático/tabela de sinais de alerta na SRPA, sem identidade bibliográfica | Responder apenas com o conteúdo recuperado. O texto “PARE e AVALIE” é uma instrução, não deve ser promovido automaticamente a título. Se não houver título, autor ou seção identificável no contexto completo, usar exatamente a camada 3. |
| `1Tm4...` | Tabela didática interna de medicamentos, com referências bibliográficas internas explícitas | Pode responder com base na tabela e, quando diretamente pertinente, citar as fontes internas que aparecem no trecho consultado (por exemplo, Trissel ou ANVISA/CBM). Não deve apresentar a tabela como livro, não deve usar o nome do arquivo e não deve inventar páginas/edição. Se nenhuma fonte interna pertinente estiver no contexto consultado, usar camada 2 se houver título/seção real; caso contrário, camada 3. |

### Regras práticas para os quatro

1. Se houve uso de conteúdo desses materiais em Resumo ou Pergunta Livre, a seção final deve ser `**Referências**`, sem dois-pontos, com uma referência por linha e sem prefixar cada linha com “Referência”.
2. O assistente deve reler todo o contexto da chamada antes de decidir que não há referência.
3. O nome técnico do arquivo, caminho e extensão nunca podem aparecer como referência.
4. A camada 3 — `Informação não disponível no artigo, consultar o Plano de Ensino ou docentes.` — é o último recurso e só cabe quando nenhum título, cabeçalho, autor ou nome de seção identificável aparece em nenhum trecho.
5. Se a pergunta for legítima, mas os trechos não tiverem conteúdo suficiente, a resposta é de conteúdo insuficiente e não deve conter seção `**Referências**`; isso não é recusa ética.
6. Os quatro não devem ser bloqueados da busca apenas por falta de ficha bibliográfica. A ausência de catalogação formal afeta a forma da referência, não a disponibilidade do conteúdo.
