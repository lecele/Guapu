-- A ativacao em massa de um documento grande tambem atualiza o indice HNSW
-- parcial. O limite anterior de 120s era insuficiente para livros extensos e
-- deixava o documento inteiro em staging depois de todos os embeddings prontos.
-- O worker continua protegido por lotes, leases e retries; este limite apenas
-- permite que a finalizacao conclua em uma unica transacao.

ALTER FUNCTION public.finalize_drive_document_sync(TEXT, UUID[])
    SET statement_timeout = '600s';

