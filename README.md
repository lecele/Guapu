# Guapu - Tutor de Enfermagem

Versão independente do assistente educacional da disciplina INT 5224 - *O cuidado no processo de viver humano II: a condição cirúrgica*, da UFSC. O aplicativo legado permanece no diretório pai e não deve receber novas alterações funcionais.

## Produção

- Chat: https://guapu.vercel.app
- Painel administrativo protegido: https://guapu-painel.vercel.app
- Banco e RAG: Supabase com pgvector
- Sincronização de documentos: worker persistente na VPS

## Arquitetura atual

- **Chat:** Next.js 16, rota `app/api/chat/route.ts`, estado de sessão persistente e fluxos determinísticos para resumo, quiz, informações da disciplina e encerramento.
- **RAG:** embeddings `gemini-embedding-2` com 768 dimensões, busca vetorial HNSW e referências acrescentadas deterministicamente a partir dos trechos realmente recuperados.
- **Informações da disciplina:** consultas desse modo são restritas aos arquivos oficiais do plano de ensino antes do ranking vetorial. O assistente não reconstrói notas ou fórmulas quando a tabela recuperada estiver incompleta.
- **Geração:** modelo configurado por `GEMINI_CHAT_MODEL` (padrão operacional atual: `gemini-2.5-flash-lite`), com fallbacks controlados e telemetria por turno.
- **Qualidade:** cada resposta com RAG é avaliada em segundo plano usando os mesmos trechos recuperados. A avaliação não aumenta o tempo de resposta do estudante.
- **Painel:** exibe conversas reais, telemetria de embedding/recuperação/geração, fontes RAG, avaliação automática e avaliações por estrelas. Sessões sintéticas de QA são excluídas das métricas, mas permanecem no banco para auditoria.
- **Drive:** a VPS detecta arquivos novos, alterados e removidos, registra o manifesto e atualiza ou elimina apenas os chunks afetados. O chat não espera esse processamento.

## Operação do Drive

O worker deve permanecer ativo na VPS. Consulte [deploy/VPS_WORKER.md](deploy/VPS_WORKER.md) para instalação, atualização e diagnóstico.

O teste de ponta a ponta validado em 26 de agosto de 2026 confirmou:

1. arquivo inserido no Drive;
2. trabalho criado e processado pela VPS;
3. trecho recuperado e citado pelo chat;
4. arquivo atualizado e trecho substituído;
5. arquivo removido, com exclusão do trecho e do manifesto.

## Testes

```bash
npm run test:flow        # máquina de estados, prompts, referências e escopo do painel
npm run lint
npm run build
npm run test:acceptance  # cenários de produção em https://guapu.vercel.app
```

Os casos de aceitação estão em [qa/acceptance-cases.json](qa/acceptance-cases.json). Eles validam fluxo, fontes, fatos mínimos e tempo máximo. Amplie essa lista sempre que um novo comportamento relevante for aprovado pelo cliente.

## Segurança

- Nunca versionar `.env`, `.env.local`, credenciais ou chaves de serviço.
- Nunca enviar arquivos `.env` no deploy; a Vercel deve receber variáveis exclusivamente pelas configurações protegidas de cada projeto.
- A VPS usa `/etc/guapu/worker.env`, fora do repositório, com permissões restritas.
- Não usar variáveis `NEXT_PUBLIC_*` para chaves de Supabase, Gemini ou Google Drive.

## Banco e migrações

As migrações ficam em [db/migrations](db/migrations). A estrutura em produção inclui estado persistente de sessão, manifesto e fila do Drive, avaliações automáticas de qualidade, vínculo de feedback por resposta e busca filtrada do plano de ensino.

Antes de aplicar uma nova migração, faça backup do Supabase e registre a aplicação no histórico operacional.
