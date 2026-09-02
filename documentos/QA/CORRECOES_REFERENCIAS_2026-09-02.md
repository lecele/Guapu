# Correções aplicadas — geração de referências (Guapu / INT 5224)

Data: 02/09/2026
Base normativa: `documentos/Ajustes_02_09_26/0{1,2,3}_*_4.md` (pacote v1.5.0, pedido de 01/09/2026)
Diagnóstico que originou este trabalho: `documentos/QA/ANALISE_REFERENCIAS_2026-09-02.md`

**Status: publicado em produção e conferido no assistente no ar.**

Validação: **83/83 testes** (`npm run test:flow`, eram 62 antes — 21 novos casos de regressão), `eslint` limpo, `tsc --noEmit` limpo e `npm run build` aprovado.

| Etapa | Resultado |
| --- | --- |
| GitHub | `c96cee3` (correções), `a715f94` (contexto de build), `4163548` (escopo) na branch `codex/client-interface` |
| VPS | imagem reconstruída, `guapu-app` saudável, saúde pública `{"status":"healthy","supabase":"connected"}` |
| Rollback | `/opt/guapu-app/backups/20260902-referencias/` e `.../20260902-escopo/`; imagens `guapu-app:rollback-20260902-*` |

---

## 1. Os sete defeitos corrigidos

### D1 — Excesso de referências (`lib/chat/references.ts`)

Como todo documento passou a ter identidade catalogada, o portão de relevância virou "o trecho tem alguma palavra em comum com a pergunta" — sempre verdadeiro em um trecho de mil caracteres. A lista publicava até 5 obras, várias apenas tangenciais.

Três mudanças:
- **Evidência de uso:** a referência agora precisa comprovar que o trecho foi usado *na resposta gerada*, não que ele parece com a pergunta. O limiar é relativo ao melhor trecho da própria recuperação, então uma resposta curta não é penalizada.
- **Ordenação por `similarity`:** o campo já era calculado e nunca usado. A lista passa a seguir a força da recuperação, não a ordem em que o banco devolveu as linhas.
- **Corte de 5 para 3** e ampliação das palavras genéricas ignoradas (`cirurgia`, `hospitalar`, `saúde`, `tratado`, `livro`, `apostila`, `manual`, …).

Antes / depois, resposta que trata apenas de antissepsia:

```
ANTES                                          DEPOIS
- Silva J (2020). Prevenção de infecção…       - Silva J (2020). Prevenção de infecção…
- Jacome L (2022). Teleconsulta de enfermagem
  ao paciente submetido a cirurgia geral
```
A segunda entrava só porque o título continha "cirurgia" e a pergunta também.

### D2 — Mensagem "fora do escopo" recebia referências

A v1.5.0 criou a categoria "fora do escopo da disciplina" (Prompt 01, 3.2), com texto que começa por *"Isso foge ao escopo desta disciplina"*. O detector procurava apenas "fora do escopo" e "não posso responder", então não disparava: o aluno perguntava sobre pediatria, recebia "isso foge ao escopo" e, logo abaixo, uma referência de enfermagem pediátrica.

O detector passou a reconhecer "foge ao escopo", "não consta do Plano de Ensino", "não faz parte da ementa" e variações. Recusa, fora de escopo e conteúdo insuficiente ficam sem seção de Referências e sem a frase de fallback, como o documento exige.

### D3 — Perda de conteúdo da resposta

Qualquer linha iniciada pela palavra "Referências" era tratada como cabeçalho de seção e tudo dali em diante era apagado. Como o Plano de Ensino tem uma seção "Referências bibliográficas básicas", uma resposta de Informações da Disciplina podia perder metade do texto em silêncio.

Agora só conta como cabeçalho a linha cujo restante está vazio, abre uma lista ou usa dois-pontos. A frase em prosa é preservada; o cabeçalho real continua sendo removido.

### D4 — Ordem da seção

O cliente especifica (Prompt 03, Exemplos A e H): conteúdo → `**Referências**` → pergunta de encerramento. O código anexava a seção depois da pergunta. A pergunta de encerramento passou a ser destacada antes da montagem e recolocada ao final — inclusive quando a seção é o fallback da camada 3.

### D5 — Números legítimos apagados

O limpador de marcadores de citação (regra 9) removia todo colchete com dígitos. `"A escala de dor varia de [0] a [10]"` virava `"varia de a"`. Um erro clínico silencioso.

Passou a distinguir dois casos: listas (`[3, 4, 5]`, `[4, p. 196]`) são sempre nota de rodapé e saem; um colchete com um único número só sai quando está apoiado no texto anterior, nunca quando faz parte de intervalo ou valor (`de [0] a [10]`, `de [8] horas`).

### D6 — Nome do arquivo entregue ao modelo

`formatContext` (`app/api/chat/route.ts`) montava cada trecho como
`[1] Trecho RAG 1 (arquivo: apostila_final_v3.pdf; página: 12; …)`.

Três problemas de uma vez: o nome técnico do arquivo — expressamente proibido como referência — ia ao modelo em toda chamada; a sigla interna aparecia no contexto; e o prefixo `[1]` ensinava exatamente os marcadores inline que a regra 9 proíbe. O formato passou a ser `--- Trecho 1, página 12 ---`. Nada nas referências depende disso: a identidade vem do catálogo, por `drive_file_id`.

### D7 — O escopo da disciplina não era respeitado (encontrado testando o app publicado)

Depois do primeiro deploy, o assistente foi testado no ar. Perguntado sobre **cuidados de enfermagem em pediatria no pós-operatório**, respondeu a pergunta inteira — sete parágrafos e três referências — em vez de usar o texto padrão de fora do escopo (Prompt 01, seção 3.2).

A regra estava escrita no prompt e o modelo não a seguiu. Como a busca trouxe trechos plausíveis (SOBECC, Brunner), ele tratou o tema como se fosse da disciplina. É literalmente o erro que a seção 3.0 antecipa: *"não decida que um tema está dentro do escopo só porque `CONTEXTO_RAG` trouxe trechos relevantes sobre ele"*.

**Importante:** isso não era uma regressão. Antes destas correções a categoria não existia no código, e a mesma pergunta seria respondida do mesmo jeito.

**Correção.** A checagem saiu do prompt e virou código (`lib/chat/scope.ts`), executada em `app/api/chat/route.ts` **antes da recuperação**. Instrução em prompt é pedido, não garantia; para valer sempre, precisa ser determinística.

Isso responde também à nota técnica da v1.5.0 sobre custo: um pedido fora da ementa não gasta mais embedding, busca nem geração. Em produção a resposta passou a ser imediata.

A lista de temas é curta de propósito — pediatria/neonatologia, obstetrícia e atenção primária, campos que a ementa exclui sem ambiguidade — com duas salvaguardas:

- se o estudante escreve "adulto" ou "idoso", não redireciona (a menção é comparativa, não é o tema);
- **saúde mental e psiquiatria ficaram fora da lista de propósito.** Um paciente cirúrgico pode ter demanda de saúde mental no perioperatório, e essa pergunta é legítima. Recusar conteúdo que a disciplina cobre é pior que deixar passar uma pergunta fora do escopo.

Dos 8 testes novos desta correção, metade verifica justamente o que **não** pode ser redirecionado.

---

## 1.1. Um defeito latente no processo de deploy

A primeira tentativa de publicação falhou no build, com `TS2307` em `references.ts` e `prompts/modes.ts`. Causa: os backups de deploy são gravados em `/opt/guapu-app/backups/`, **dentro** da pasta que o `COPY .` do Dockerfile copia. O TypeScript passava a verificar cópias de arquivos fora do lugar.

Isso não era novo — vinha passando despercebido porque os arquivos salvos em deploys anteriores não tinham importações relativas. `references.ts` e `modes.ts` têm.

`.dockerignore` passou a excluir `backups/`, e o script de deploy confere essa exclusão antes de construir. Vale para todas as publicações futuras.

O build parou antes de recriar qualquer container: o app permaneceu no ar durante toda a falha.

---

## 2. Alinhamento com o pacote v1.5.0

`PROMPT_VERSION` passou de `v1.3.0` para `v1.5.0-refs`.

- **Categoria "fora do escopo" implementada.** O núcleo do prompt agora carrega a ementa do Plano de Ensino 2026-2 e as três situações distintas (recusa por guardrail / fora do escopo / conteúdo insuficiente), com os textos padrão exatos. O escopo é decidido pela ementa, não pelo que a busca devolveu.
- **Encerramento do Quiz (v1.4.0, TC-RF-007):** a conclusão da 3ª questão vai direto ao menu curto, sem oferecer "continuar o quiz" / "trocar de tema" como decisões próprias.
- **Comandos de navegação nunca acionam guardrail** (v1.4.0): regra explícita no prompt de fluxo; em caso de ambiguidade, pedir esclarecimento em vez de recusar.
- **Jargão interno removido do contexto e do prompt**, não apenas filtrado na saída.

### Não implementado nesta rodada (proposta)

A nota técnica da v1.5.0 sugere rodar a checagem de guardrail/escopo **antes** da busca, para não gastar recuperação em pedido que será recusado. É mudança de arquitetura da aplicação. O próprio documento recomenda medir primeiro quantas consultas terminam em recusa/fora de escopo — a telemetria de `response_kind` já registra isso e permite dimensionar o ganho antes de investir.

---

## 3. Catálogo ABNT do cliente — pronto para receber a planilha

Resposta à pergunta "acha que conseguimos substituir?": **sim, e o caminho já está implementado.**

Quando um documento tiver citação ABNT curada, ela é usada **literalmente**, sem remontagem a partir dos campos. É exatamente o que o item 8 da seção 4 pede: "sempre a mesma estrutura, em qualquer modalidade, independentemente do modelo em uso (Gemini ou Claude)". Com OpenAI como primário e Gemini na reserva, o formato da referência deixa de depender de qual modelo respondeu.

O que foi entregue:

| Item | Arquivo |
| --- | --- |
| Campo `reference_abnt` no catálogo | `lib/chat/document-catalog.ts`, `reference_catalog.json` |
| Renderização literal da citação + página | `lib/chat/references.ts` |
| Coluna no banco + sincronização dos chunks | `db/migrations/043_add_abnt_reference_to_catalog.sql` |
| Ingestão propaga o campo | `rag/ingestion.py` |
| Importador da planilha | `scripts/import_abnt_references.py` |

O importador vincula cada linha pelo **nome do arquivo**, que segue a mesma convenção técnica do inventário do Drive (`tema__subtema__tipo__autor__ano__vN`) — a comparação ignora acentos, extensão e separadores. Uma linha que não casar com nenhum documento conhecido **não é gravada**: entra no relatório para conferência manual. O mesmo vale no sentido inverso: documentos do catálogo ausentes da planilha são listados.

Fluxo de importação:

```
psql < db/migrations/043_add_abnt_reference_to_catalog.sql
python scripts/import_abnt_references.py referencias_enfermagem_perioperatoria.xlsx --dry-run
python scripts/import_abnt_references.py referencias_enfermagem_perioperatoria.xlsx
psql < db/seeds/abnt_reference_catalog.sql
```

Detalhe importante: chunks legados já gravados com `reference_verified = true` **não precisam ser reindexados**. O catálogo aplica a citação ABNT por cima do metadado legado assim que a aplicação sobe; o `psql` da última linha é otimização, não pré-requisito.

Teste de ponta a ponta executado em 02/09/2026 com planilha sintética: 4 vínculos corretos (incluindo nome com acento), 1 arquivo inexistente corretamente recusado. Artefatos de teste descartados.

### Pendências do lado do conteúdo

Os três livros digitalizados apontados pelo cliente (Brunner & Suddarth, Enfermagem em cardiologia, Morton & Fontaine) são PDFs só de imagem. Enquanto não passarem por OCR, as citações deles vêm do padrão de nomeação, não do conteúdo — a marcação `[PDF digitalizado, sem texto extraível]` na planilha identifica quais conferir. Isso não impede a importação: a citação ABNT entra no catálogo do mesmo jeito.

---

## 4. Regressões cobertas por teste

Os 13 casos novos em `tests/references.test.ts` travam cada defeito:

| Caso | O que trava |
| --- | --- |
| D2 (×2) | "fora do escopo" e "não consta do Plano de Ensino" sem seção de Referências |
| D3 (×2) | prosa iniciada por "Referências" preservada; cabeçalho real removido |
| D1 (×2) | obra tangencial fora da lista; máximo de três referências |
| D4 (×2) | seção antes do encerramento, inclusive no fallback |
| D5 (×2) | intervalos numéricos preservados; marcadores herdados removidos |
| Escopo de fonte | comparação insensível a maiúsculas, como no banco |
| ABNT (×2) | citação usada literalmente; catálogo vence metadado legado |

---

## 5. Conferido no assistente publicado

As respostas abaixo vieram do Guapu no ar, não de teste automatizado.

| Caso | Resultado |
| --- | --- |
| Resumo sobre pós-operatório imediato | 3 referências, todas do tema, seção **antes** da pergunta de encerramento; quatro blocos completos; sem nome de arquivo e sem marcador numérico |
| Pergunta sobre pediatria | texto de fora do escopo literal, sem Referências, resposta imediata sem consultar a base |
| Quiz sobre feridas cirúrgicas | questão sem nenhuma seção de Referências |

## 6. Em aberto

1. **Hero Card (interface).** Ainda exibe "Assistente de IA · INT 5224" e repete o nome da disciplina na linha seguinte. A v1.4.0 pediu o nome da disciplina no eyebrow; a v1.5.0 pediu remover a linha repetida. É copy de interface, não faz parte destas correções.
2. **Quiz completo.** Só a primeira questão foi verificada. Vale percorrer as três para confirmar que o encerramento vai direto ao menu curto (TC-RF-007).
3. **Planilha ABNT.** O caminho está implementado e testado de ponta a ponta; falta a planilha do cliente.
