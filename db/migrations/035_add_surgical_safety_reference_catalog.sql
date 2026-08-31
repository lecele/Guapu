-- Identidades bibliográficas conferidas na primeira página dos documentos de
-- segurança cirúrgica. Os títulos não são derivados dos nomes de arquivo.
BEGIN;

INSERT INTO public.rag_document_catalog (
    drive_file_id, reference_title, reference_author, reference_year,
    reference_edition, reference_publisher, verification_status, verified_from,
    notes
)
VALUES
(
    '1JQkYmjfUSx_Nhhh-z2PxKs_RG5s_8p2z',
    'Protocolo para Cirurgia Segura',
    'Ministério da Saúde; Agência Nacional de Vigilância Sanitária (Anvisa); Fundação Oswaldo Cruz (Fiocruz)',
    '2013', NULL, 'Ministério da Saúde', 'verified', 'documentos, p. 1',
    'Título e instituições responsáveis conferidos no primeiro chunk ativo.'
),
(
    '1AgmiMWrMdEsKTJuyY89oN3ldd6w__Pbg',
    'Cirurgias Seguras Salvam Vidas: manual — segundo desafio global para a segurança do paciente',
    'Organização Mundial da Saúde (OMS)',
    '2009', NULL, 'Organização Mundial da Saúde', 'verified', 'documentos, p. 1',
    'Título, organização e ano conferidos na folha inicial do manual.'
),
(
    '1Zr2cWKl5SsHDYTNdiRLLHNFLI0JM2O7v',
    'Nota Técnica GVIMS/GGTES nº 04/2017: práticas seguras para prevenção de retenção não intencional de objetos após realização de procedimento cirúrgico em serviços de saúde',
    'Agência Nacional de Vigilância Sanitária (Anvisa)',
    '2017', NULL, 'Anvisa', 'verified', 'documentos, p. 1',
    'Título, órgão e identificação da nota técnica conferidos na capa.'
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

COMMIT;
