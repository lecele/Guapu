-- 043 — Citação ABNT NBR 6023 no catálogo bibliográfico
--
-- A catalogação do cliente (planilha de 02/09/2026) entrega, para cada
-- documento, uma referência pronta em ABNT NBR 6023 conferida dentro do próprio
-- arquivo. Guardá-la como texto único elimina a remontagem da referência em
-- tempo de resposta e garante formato idêntico em qualquer modalidade e
-- qualquer modelo (Prompt 01, seção 4, item 8).
--
-- A coluna é opcional: documentos sem citação ABNT continuam usando os campos
-- estruturados já existentes. Nada é apagado por esta migração.

ALTER TABLE rag_document_catalog
  ADD COLUMN IF NOT EXISTS reference_abnt TEXT;

COMMENT ON COLUMN rag_document_catalog.reference_abnt IS
  'Citação pronta em ABNT NBR 6023 conferida no documento. Quando preenchida, é usada literalmente na seção Referências.';

-- Propagação para os chunks já indexados. Idempotente: só escreve quando o
-- valor difere, preservando embeddings, conteúdo, status e demais metadados.
CREATE OR REPLACE FUNCTION sync_abnt_reference_to_documents()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE documents d
     SET metadata = d.metadata || jsonb_build_object('reference_abnt', c.reference_abnt)
    FROM rag_document_catalog c
   WHERE c.verification_status = 'verified'
     AND c.reference_abnt IS NOT NULL
     AND c.reference_abnt <> ''
     AND d.metadata->>'drive_file_id' = c.drive_file_id
     AND COALESCE(d.metadata->>'reference_abnt', '') <> c.reference_abnt;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

COMMENT ON FUNCTION sync_abnt_reference_to_documents() IS
  'Copia reference_abnt do catálogo para os chunks correspondentes. Executar após cada importação da planilha de catalogação.';
