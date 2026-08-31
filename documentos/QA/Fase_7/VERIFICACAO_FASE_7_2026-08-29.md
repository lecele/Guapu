# Verificação da Fase 7 — homologação e liberação controlada

**Data:** 29/08/2026  
**Ambiente:** `https://guapu.agentesnasaude.com.br` na VPS  
**Status:** **EM HOMOLOGAÇÃO INTERNA**; aceite de Leonardo, atuando como cliente, pendente.

## Bateria técnica publicada

A bateria padrão foi executada contra o domínio público após a publicação do ajuste de rodapé:

- **8/8 casos aprovados**.
- Fluxos de menu, resumo, aprofundamento, troca de tema, quiz, informações da disciplina e encerramento aprovados.
- Pergunta clínica com recuperação de contexto aprovada com 5 fontes.
- Referências presentes nos fluxos fundamentados e ausentes nos fluxos que não devem citá-las.
- Latências observadas: 300 ms a 33,3 s; nenhum caso ultrapassou o limite definido para sua categoria.
- Nenhum erro HTTP ou caso reprovado.

Uma segunda rodada foi executada após a homologação interna ser definida, na mesma versão publicada: **8/8 aprovados** novamente. As latências ficaram entre 304 ms e 15,1 s, com 5 fontes nos quatro casos fundamentados e 0 fonte nos fluxos que não devem consultar o RAG.

| Caso | Resultado | Latência | Fontes |
|---|---:|---:|---:|
| FLOW-001 — resumo sem tema | aprovado | 748 ms | 0 |
| FLOW-002 — resumo com tema | aprovado | 14,4 s | 5 |
| FLOW-003 — aprofundar | aprovado | 7,1 s | 5 |
| FLOW-005 — trocar tema | aprovado | 300 ms | 0 |
| FLOW-006 — quiz com tema | aprovado | 4,8 s | 5 |
| FLOW-009 — informações da disciplina | aprovado | 5,5 s | 5 |
| FLOW-011 — encerrar sessão | aprovado | 308 ms | 0 |
| RAG-001 — pergunta clínica | aprovado | 33,3 s | 5 |

## Homologação interna

O roteiro para teste funcional está em `documentos/QA/Fase_7/ROTEIRO_HOMOLOGACAO_CLIENTE.md` e é de uso interno, não será enviado ao cliente externo. Ainda falta Leonardo executar a bateria no uso real e confirmar:

- comportamento esperado dos conteúdos e respostas;
- correção das referências para as perguntas que ele utiliza;
- experiência em desktop e celular;
- ausência de erro crítico conhecido.

A integração adicional do executor de homologação com o Telegram/Elle foi deixada para depois da entrega do app. Ela não é dependência para o funcionamento do Guapu nem para o aceite desta fase; a prioridade permanece sendo a estabilidade do aplicativo e a validação funcional direta.

## Critério de saída

A Fase 7 permanece aberta. Ela será marcada como aprovada somente após o registro da homologação interna conduzida por Leonardo, com a versão publicada identificada e sem falha crítica pendente.

## Atualização da validação ao vivo — 30/08/2026

- Acesso à VPS revalidado via Tailscale; app e painel responderam HTTP 200 nos endpoints públicos de saúde.
- A bateria real de referências executada no runtime publicado passou em **6/6**: duas repetições do plano vigente, duas do glossário DOCX e duas do cenário de plano antigo bloqueado.
- Nos casos fundamentados, as fontes retornadas foram compatíveis com a pergunta e a seção de referências foi gerada. No caso do glossário, a fonte retornada foi `glossario.docx`; no caso do plano vigente, a fonte foi o plano 2026-2. O plano antigo retornou `NO_RELEVANT_CONTEXT`, sem fonte ou referência indevida.
- Latências observadas nessa bateria: 0,890 s a 7,625 s; P50 de 2,922 s e P95 aproximado de 3,616 s. A amostra confirma o funcionamento, mas a medição operacional maior continua sendo uma melhoria de acompanhamento.
- A bateria técnica passou; o único item ainda necessário para fechar formalmente esta fase é o aceite funcional de Leonardo, atuando como cliente, registrado com a versão publicada.

## Correção administrativa e referências — 30/08/2026

- O fluxo de carga horária/período do plano vigente foi corrigido para usar os dados conferidos no chunk ativo da p. 1, sem geração livre de números pelo modelo.
- A bateria real repetida no domínio publicado passou em **6/6**: plano vigente (2/2), glossário DOCX (2/2) e bloqueio do plano antigo (2/2).
- As referências do plano vigente ficaram restritas ao documento administrativo correto, com página 1; o Brunner não apareceu nessa resposta. O plano antigo continuou sem contexto e sem referência.
- O aceite técnico está aprovado; permanece pendente apenas a homologação funcional final de Leonardo, atuando como cliente.
