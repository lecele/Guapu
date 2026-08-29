-- Catálogo bibliográfico verificável por arquivo do Drive.
--
-- O nome do arquivo continua sendo apenas uma chave técnica. As referências
-- exibidas ao estudante vêm deste catálogo somente quando os campos foram
-- conferidos no conteúdo do documento (verification_status = 'verified').
BEGIN;

CREATE TABLE IF NOT EXISTS public.rag_document_catalog (
    drive_file_id TEXT PRIMARY KEY,
    reference_title TEXT NOT NULL,
    reference_author TEXT,
    reference_year TEXT,
    reference_edition TEXT,
    reference_publisher TEXT,
    verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    verified_from TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rag_document_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rag_document_catalog FROM anon, authenticated;
GRANT ALL ON TABLE public.rag_document_catalog TO service_role;

-- Registros conferidos nas páginas bibliográficas dos dois livros que
-- aparecem no teste de referências da Fase 3. Os IDs são os IDs técnicos do
-- Drive; nenhum nome de arquivo é usado como texto de referência.
INSERT INTO public.rag_document_catalog (
    drive_file_id, reference_title, reference_author, reference_year,
    reference_edition, reference_publisher, verification_status, verified_from,
    notes
)
VALUES
(
    '1rsAmg3UK8m_2fP4STqoiB_Zhyktnlw-W',
    'Brunner & Suddarth: Tratado de enfermagem médico-cirúrgica',
    'Lillian Sholtis Brunner; Doris Smith Suddarth; Suzanne C. Smeltzer (ed.)',
    '2014', '12ª ed. [reimpr.]', 'Rio de Janeiro: Guanabara Koogan',
    'verified', 'documentos, p. 6',
    'Título, edição, ano, editora e responsáveis conferidos na ficha catalográfica.'
),
(
    '1YUfjf2WG5FonQaOImCsAY6aHSuyK7XNL',
    'Práticas Recomendadas SOBECC',
    NULL, '2013', '6ª ed.', NULL,
    'verified', 'documentos, p. 1',
    'Título, edição e ano conferidos na folha inicial do documento OCR.'
)
ON CONFLICT (drive_file_id) DO UPDATE SET
    reference_title = EXCLUDED.reference_title,
    reference_author = EXCLUDED.reference_author,
    reference_year = EXCLUDED.reference_year,
    reference_edition = EXCLUDED.reference_edition,
    reference_publisher = EXCLUDED.reference_publisher,
    verification_status = EXCLUDED.verification_status,
    verified_from = EXCLUDED.verified_from,
    notes = EXCLUDED.notes,
    updated_at = now();

-- Propaga a identidade para os chunks já indexados. O conteúdo e os vetores
-- não são alterados; apenas os metadados de proveniência são enriquecidos.
UPDATE public.documents AS d
SET metadata = COALESCE(d.metadata, '{}'::jsonb) || jsonb_strip_nulls(
    jsonb_build_object(
        'reference_title', c.reference_title,
        'reference_author', c.reference_author,
        'reference_year', c.reference_year,
        'reference_edition', c.reference_edition,
        'reference_publisher', c.reference_publisher,
        'reference_source', 'catalog',
        'reference_verified', (c.verification_status = 'verified'),
        'reference_key', c.drive_file_id
    )
)
FROM public.rag_document_catalog AS c
WHERE d.metadata->>'drive_file_id' = c.drive_file_id
  AND c.verification_status = 'verified';

COMMIT;
