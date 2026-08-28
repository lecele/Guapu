# Verificação final da Fase 1 — 28/08/2026

Status técnico: **APROVADA nos testes executados; aguardando aprovação formal de Leonardo para avançar**.

## Estado real do corpus

- Ambiente consultado: produção (`https://guapu.vercel.app`).
- Arquivos vivos no Google Drive: 119.
- Arquivos com vetores ativos no Supabase: 119.
- Chunks ativos gerenciados: 57.796.
- Chunks em staging: 0.
- Vetores ativos sem arquivo vivo: 0.
- Arquivos vivos sem vetores ativos: 0.
- Jobs pendentes: 0.
- Jobs falhos: 0.
- Chunks ativos sem `drive_file_id`: 0.
- Worker e timer de sincronização: ativos e habilitados.

## Testes executados

- Verificador estrito Drive → manifesto → Supabase: aprovado, código de saída 0.
- Suíte real do RAG: 9/9 aprovados, três repetições dos três casos críticos.
- Testes locais de fluxo, sessão, prompts, referências e escopo administrativo: 31/31 aprovados.
- ESLint: aprovado.
- Build de produção: aprovado.
- Teste real de remoção: o arquivo `glossario` foi retirado da pasta monitorada; o job `removed` terminou com sucesso, os chunks foram zerados e o manifesto desapareceu. O app não utilizou a fonte removida.
- Teste real de retorno: o mesmo conteúdo foi recolocado como `glossario.docx`; o job `new` terminou com sucesso, 17 chunks foram ativados, o manifesto ficou `active` e o app voltou a recuperar a fonte.
- Teste do plano vigente: resposta real recuperou exclusivamente `administrativo__plano_ensino_INT55224__plano__ufsc__2026_2.pdf`; Ana Graziela Alvarez foi identificada como coordenadora e Alexandre Caminha não apareceu no conteúdo ativo.
- Teste de plano antigo: após a correção do guard de consulta histórica, a pergunta sobre o plano anterior retornou fallback seguro, sem usar livros genéricos como substituição.

## Correção aplicada durante o aceite

Foi corrigido o comportamento que aceitava contexto irrelevante em perguntas sobre planos antigos. Essas perguntas agora são tratadas como sem evidência disponível quando a versão histórica não está no corpus vigente, evitando resposta factual apoiada em documentos genéricos.

Também foi ajustado o teste de fonte para tratar `.pdf` e `.docx` como a mesma identidade documental quando o conteúdo é baixado e reenviado, sem aceitar fontes diferentes.

Código publicado na Vercel: `dpl_8mF9XFUZsZVQ8bdLGgqsqKFFjjUy`.
Commit local correspondente: `8cdcf2d`.

## Observação de homologação

O arquivo baixado e reenviado ao Drive recebeu um novo ID, comportamento normal da conversão Google Docs → DOCX. O ciclo add/remove/re-add foi validado com o conteúdo retornado e a nova identidade documental. A matriz histórica e os relatórios anteriores devem ser considerados evidências de diagnóstico, não como contagem atual.

## Pendência formal antes de avançar

Os testes técnicos da Fase 1 estão aprovados. Falta apenas a aprovação formal de Leonardo e a atualização do controle de status do plano. As fases seguintes continuam bloqueadas até essa aprovação.
