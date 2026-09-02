# Análise do código — geração de referências (Guapu / INT 5224)

Data: 02/09/2026
Escopo analisado: `lib/chat/references.ts`, `app/api/chat/route.ts`, `lib/chat/document-catalog.ts`, `lib/chat/prompts/*`, `rag/ingestion.py`, `reference_catalog.json`, `components/chat/MessageBubble.tsx`
Prompt de referência: `documentos/Ajustes_02_09_26/0{1,2,3}_*_4.md` (v1.5.0, pedido de 01/09/2026)
Baseline de testes: `npm run test:flow` → **62/62 aprovados** (nenhum dos defeitos abaixo é coberto pelos testes atuais)

---

## 1. Resumo executivo

A arquitetura está correta e é a decisão certa: **o modelo não escreve referências**; a aplicação as monta deterministicamente a partir dos chunks recuperados (`finalizeReferences`, `lib/chat/references.ts:352`). O catálogo bibliográfico está íntegro — **119/119 documentos**, `reference_catalog.json` e `lib/chat/document-catalog.ts` sem nenhuma divergência de ID ou de título.

O problema **não** é o catálogo nem a extração. São **seis defeitos no filtro e na montagem final**, todos reproduzidos em execução local contra o módulo real. Três deles produzem violação direta do documento do cliente e um deles apaga conteúdo da resposta.

| # | Defeito | Gravidade | Local |
| --- | --- | --- | --- |
| D1 | Excesso de referências: documento catalogado entra na lista só por compartilhar a palavra "cirurgia" com a pergunta | **Alta** | `references.ts:407-417` |
| D2 | Novo texto "fora do escopo" (v1.5.0, seção 3.2) recebe seção `**Referências**` | **Alta** | `references.ts:64-70, 373` |
| D3 | A palavra "Referências" no corpo da resposta apaga todo o texto seguinte | **Alta** | `references.ts:10, 337-345` |
| D4 | Seção `**Referências**` sai **depois** da pergunta de encerramento (o cliente especifica antes) | Média | `references.ts:434` + `route.ts:865-870` |
| D5 | O limpador de marcadores `[n]` apaga números legítimos entre colchetes | Média | `references.ts:363-364` |
| D6 | O nome técnico do arquivo é injetado no contexto enviado ao modelo | Média | `route.ts:376` |

---

## 2. Defeitos, com reprodução

### D1 — Excesso de referências (causa mais provável do que o cliente está vendo)

**Mecanismo.** Todo chunk com `drive_file_id` no catálogo recebe identidade bibliográfica em `enrichDocumentReferenceMetadata` (`document-catalog.ts`, final do arquivo) — hoje isso é **100% dos documentos**. O portão de relevância para item catalogado (`references.ts:416`) é:

```ts
item.catalog && (singleDocumentScope || explicitSourceMatch || item.documentQuestionMatch)
```

e `documentQuestionMatch` (`references.ts:381`) é `meaningfulOverlapCount(relevanceText, doc.content) > 0` — ou seja, basta **uma palavra de 6+ letras** do chunk inteiro (não do título) coincidir com a pergunta. Em um chunk de ~1.000 caracteres isso é praticamente sempre verdadeiro. O portão anterior (`hasMeaningfulOverlap` sobre o título) também é permissivo: `REFERENCE_STOPWORDS` (`references.ts:72`) bloqueia `cirurgico/cirurgica`, mas **não** bloqueia `cirurgia`, `operatorio`, `hospitalar`, `clinico`, `anestesia` — palavras presentes em quase todo título do acervo desta disciplina.

Resultado: com `RAG_MATCH_COUNT=5` e `.slice(0, 5)` (`references.ts:431`), a resposta lista até 5 obras, várias sem relação com o que foi efetivamente afirmado.

**Reprodução** (resposta contendo apenas antissepsia; 5 documentos catalogados recuperados):

```
**Referências**
- Silva J (2020). Prevencao de infeccao de sitio cirurgico.
- Jacome L (2022). Teleconsulta de enfermagem ao paciente submetido a cirurgia geral.
```

A segunda entrou porque o título contém "cirurgia" e a pergunta era "antissepsia da pele antes da **cirurgia**". Nada sobre teleconsulta foi dito na resposta.

**Correção proposta.** Trocar o critério de item catalogado de "o chunk tem alguma palavra da pergunta" para "**a resposta gerada usou este chunk**":
1. exigir `meaningfulOverlapCount(withoutModelReferences, doc.content) >= N` (sobreposição com a **resposta**, não com a pergunta) — hoje o texto da resposta só é usado no ramo não catalogado;
2. ordenar por `similarity` (já calculado em `references.ts:382` e **nunca usado**) antes do `slice`;
3. reduzir o corte de 5 para 2–3 e ampliar `REFERENCE_STOPWORDS` com o vocabulário genérico da disciplina.

### D2 — Texto padrão 3.2 ("fora do escopo") recebe referências

A v1.5.0 criou a categoria "fora do escopo da disciplina", com texto exato na seção 3.2, e determina: recusa (3.1), fora de escopo (3.2) e conteúdo insuficiente **nunca** levam seção `**Referências**` — nem o fallback da camada 3.

`isInsufficientOrRefusal` (`references.ts:64`) reconhece `"não posso responder"` e `"fora do escopo"`. O texto novo diz **"Isso foge ao escopo desta disciplina"** — nenhuma das duas expressões. O detector não dispara.

**Reprodução:**

```
Isso foge ao escopo desta disciplina (O cuidado no processo de viver humano II - a condição cirúrgica), (...)

**Referências**
- Autor P (2020). Enfermagem pediatrica perioperatoria.
```

Exatamente o pior caso descrito pelo cliente: o aluno pede pediatria, recebe "isso foge ao escopo" **e** uma referência de enfermagem pediátrica logo abaixo, contradizendo a própria mensagem.

**Correção.** Acrescentar ao detector `foge ao escopo`, `não faz parte (do|desta) (plano|disciplina)`, `não consta do Plano de Ensino`. Melhor ainda: fazer a aplicação classificar a categoria da resposta (recusa / fora de escopo / insuficiente / conteúdo) e passar essa categoria a `finalizeReferences`, em vez de reconhecê-la por expressão regular sobre o texto do modelo.

### D3 — Perda de conteúdo quando "Referências" aparece no corpo

`REFERENCE_HEADING` (`references.ts:10`) é `/(?:^|\n)\s*(?:\*\*)?refer[êe]ncias:?\*{0,2}\s*/i` — casa com **qualquer linha iniciada pela palavra "Referências"**, inclusive dentro de uma frase legítima. `removeModelReferences` corta tudo dali em diante e só recupera a cauda se o parágrafo seguinte começar com `deseja|gostaria de|por favor|qual tema|questão` (`references.ts:11`).

**Reprodução** (modo Informações):

Entrada:
```
O plano de ensino define os criterios de avaliacao.
Referencias bibliograficas basicas da disciplina estao listadas no Moodle e devem ser consultadas.

O estudante deve verificar o cronograma antes da prova.
```
Saída:
```
O plano de ensino define os criterios de avaliacao.
```

Duas frases perdidas silenciosamente. Como o Plano de Ensino tem uma seção "Referências bibliográficas básicas/complementares", esse caso é provável justamente em Informações da Disciplina.

**Correção.** Ancorar o cabeçalho: exigir fim de linha logo após (`^\s*(\*\*)?refer[êe]ncias:?(\*\*)?\s*$`) e, preferencialmente, casar apenas a **última** ocorrência do texto.

### D4 — Ordem da seção

O cliente especifica (Prompt 03, Exemplos A e H): conteúdo → `**Referências**` → pergunta de encerramento. O código faz o inverso: `route.ts:865-870` garante a pergunta de encerramento e só então `finalizeReferences` anexa a seção ao final (`references.ts:434`).

**Reprodução:**
```
Infeccao de sitio cirurgico e uma complicacao pos-operatoria relevante.

Deseja aprofundar este tema, escolher outro tema, voltar ao menu principal ou encerrar a sessao?

**Referências**
- Silva J (2020). Prevencao de infeccao de sitio cirurgico. p. 12.
```

**Correção.** Em `finalizeReferences`, destacar a pergunta de encerramento final (mesma família de `CONTINUATION`) antes de anexar a seção e recolocá-la depois.

### D5 — Limpador de marcadores numéricos apaga números legítimos

A regra 9 do cliente pede remover `[2]`, `[3, 4, 5]` herdados da fonte. A regex de `references.ts:363-364` remove **todo** colchete com dígitos.

**Reprodução:**
```
entrada: A escala de dor varia de [0] a [10]. O jejum pre-operatorio recomendado e de [8] horas.
saída:   A escala de dor varia de  a . O jejum pre-operatorio recomendado e de  horas.
```

Baixa frequência, mas produz erro clínico silencioso. **Correção:** exigir que o marcador esteja colado à palavra anterior ou a pontuação (`(?<=[\p{L}\p{P}])\[\d...\]`), e não isolado entre espaços.

### D6 — O nome do arquivo é enviado ao modelo

`formatContext` (`route.ts:376`) monta cada trecho como:

```
[1] Trecho RAG 1 (arquivo: apostila_final_v3.pdf; página: 12; trecho: 3; similaridade: 0.81)
```

Três problemas de uma vez: (a) o **nome técnico do arquivo** — que o cliente proíbe expressamente como referência (Exemplo F) — é entregue ao modelo em toda chamada; (b) o termo **"RAG"** aparece literalmente no contexto, e depois é limpo por `sanitizeStudentFacingText`, que é um remendo e não uma prevenção; (c) o prefixo `[1]`, `[2]` treina o modelo a produzir exatamente os marcadores numéricos inline que a regra 9 proíbe — e que D5 depois remove de forma agressiva demais.

**Correção.** Rotular os trechos como `--- Trecho 1 (página 12) ---`, sem nome de arquivo e sem a sigla. Nada nas referências depende do `source` textual do prompt: a identidade vem do catálogo, por `drive_file_id`.

---

## 3. Pontos de atenção (não são defeitos confirmados)

- **Comparação de `source` sensível a maiúsculas.** No banco o escopo é `lower(d.source) = lower(source_pattern)` (migrações 023/041); em `references.ts:400` é `item.source === explicitSourceScope`, sensível a caixa. Uma divergência de caixa entre a constante e a linha do banco zera as referências sem erro. Recomenda-se normalizar.
- **Referências em Informações da Disciplina.** `needsReferences` (`references.ts:52`) inclui `info`; o Prompt 03 seção 3 não menciona a seção, e a camada 3 é restrita a "Resumo, Pergunta Livre". Vale confirmar com o cliente se Informações deve ou não citar o Plano de Ensino.
- **Dedupe por documento.** Funciona (chave = `drive_file_id`), mas a página exibida é a do primeiro chunk da lista, não a mais relevante — `p. 200` em vez de `p. 12` no teste G. Sem impacto normativo.
- **Frontend.** `MessageBubble.tsx:114` só age se houver `Referências:` **com dois-pontos**; o backend já emite sem. É código morto, mas dispara indevidamente se a palavra com dois-pontos aparecer em uma frase comum. Sugere-se remover.

---

## 4. Distância entre o código e o prompt v1.5.0

`PROMPT_VERSION` é **v1.3.0** (`lib/chat/prompts/core.ts:4`). Pendências da v1.4.0/v1.5.0 ainda não implementadas:

1. **Categoria "fora do escopo" (3.2) não existe.** O código só tem recusa por guardrail e conteúdo insuficiente. Além de D2, isso significa que um pedido sobre pediatria hoje é tratado como recusa ética ou como falta de material.
2. **Escopo ainda é decidido pelo RAG.** `route.ts:1291` usa `docs.length === 0` para disparar "conteúdo insuficiente" — o cliente determina expressamente que escopo vem do Plano de Ensino e que disponibilidade de material é questão independente.
3. **Encerramento do Quiz.** `modes.ts:nextQuizInstruction` ainda oferece "continuar, trocar tema, voltar ao menu ou encerrar"; a v1.4.0 exige ir **direto ao menu curto** (correção do TC-RF-007).
4. **Comandos de navegação nunca acionam guardrail** (v1.4.0) — não há regra correspondente no prompt embarcado.
5. **Nota técnica da v1.5.0:** aplicar guardrail/escopo **antes** da busca no RAG, para não gastar recuperação em pedido que será recusado.

---

## 5. Ordem sugerida de correção

1. **D2** — detector de fora de escopo (1 linha de regex; corrige violação normativa direta).
2. **D3** — ancorar `REFERENCE_HEADING` (corrige perda de conteúdo).
3. **D1** — reescrever o portão de relevância para "usado na resposta" + ordenar por `similarity` + corte 2–3 (é o que o cliente enxerga como "referências erradas").
4. **D4** — reposicionar a seção antes da pergunta de encerramento.
5. **D6** — limpar `formatContext` (remove a causa-raiz de D5 e do jargão interno).
6. **D5** — restringir a regex de marcadores.
7. Implementar a categoria 3.2 e subir `PROMPT_VERSION` para v1.5.0.

Cada correção acima é acompanhável por teste: os seis casos foram reproduzidos em execução direta contra `finalizeReferences` e podem virar casos em `tests/references.test.ts`, que hoje passa 62/62 sem cobrir nenhum deles.
