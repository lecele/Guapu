-- A atualização atômica de um documento precisa localizar todos os chunks
-- pelo ID do Drive. Sem este índice, UPDATE/DELETE e a leitura de staging
-- percorrem a tabela inteira e podem atingir o statement_timeout do Supabase.
--
-- Esta migração deve ser executada fora de uma transação, pois CONCURRENTLY
-- mantém o serviço disponível durante a criação do índice.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_drive_file_id
    ON public.documents ((metadata->>'drive_file_id'));
