-- Gerado a partir de reference_catalog.json; somente entradas verified.
-- Revisar no Supabase SQL Editor antes de executar.
-- Não inclui documentos pendentes, conteúdo, embeddings ou índices.
BEGIN;

CREATE TABLE IF NOT EXISTS public.rag_document_catalog (
    drive_file_id TEXT PRIMARY KEY,
    reference_title TEXT NOT NULL,
    reference_author TEXT, reference_year TEXT, reference_edition TEXT,
    reference_publisher TEXT,
    verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
    verified_from TEXT, notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;

-- LOTE 1: 10 documentos
BEGIN;
INSERT INTO public.rag_document_catalog (drive_file_id, reference_title, reference_author, reference_year, reference_edition, reference_publisher, verification_status, verified_from, notes)
VALUES
('1-xhx4ifwQCUbz_keirJIz6UQSQ8a5sUE', 'Diretrizes de Atenção à Pessoa Amputada', 'Ministério da Saúde', '2013', NULL, 'Ministério da Saúde', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('10fr5jLhUgQBUgPEg_NfvH_oNCrqmwo_S', 'Cirurgia Bariátrica: Técnicas e Resultados: revisão das técnicas cirúrgicas no tratamento da obesidade e seus resultados a longo prazo', 'Luana Novaes de Almeida et al.', '2023', NULL, 'Brazilian Journal of Implantology and Health Sciences, 5(4), 2580-2594', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('133kL-UwvYfUO3tFNwnfryDUY_RmpK5gH', 'Inovações na cirurgia bariátrica: comparação entre técnicas restritivas e malabsortivas em pacientes com obesidade mórbida', 'Matheus Henrique Gama Helmer; João Alberto Brant Souza Pontes; Mauricio Mendes Melo; Matheus Teixeira Rosa Santana', NULL, NULL, 'Revista Ibero-Americana de Humanidades, Ciências e Educação', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('143CGBAnOovTJzVyaoxGVsz1ipFVRYbHo', 'Manejo de via aérea no paciente obeso: uma revisão de literatura', 'Paula de A. F. Antunes; Guilherme A. de B. C. de Alencar', '2023', NULL, 'Revista de Medicina, 102(1), e199864', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('14FpkEkVZ8rQQQ6bS9Sw3m1bfWXykFSQR', 'Guia para preparo de medicamentos injetáveis', 'Empresa Brasileira de Serviços Hospitalares (Ebserh)', '2019', '1ª ed.', 'Hospital Universitário da Universidade Federal de Santa Catarina', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('14JMPrRcdyR0xl1N90XQ5tOLfARHnmgOW', 'Assistência de enfermagem ao paciente oncológico submetido à anestesia', 'Jonas Magno dos Santos Cesário et al.', '2021', NULL, 'Research, Society and Development, 10(5), e31310514798', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('14j2akP9bZLD6Q85b7gvMJf4ULWCMSBY3', 'O papel do enfermeiro na prevenção de infecção no sítio cirúrgico', NULL, '2020', NULL, 'Brazilian Journal of Health Review, 3(6), 16969-16977', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('15c3UdgWIO_hpDM5qFP0cuoBCxVpwSH4E', 'Protocolo de Enfermagem Volume 6: cuidado à pessoa com ferida', 'Alessandra de Q. Esmeraldino et al.', '2019', NULL, 'Prefeitura de Florianópolis', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('15cHzlZGfKjdm_Ml92ZMUUPQBSK-VoCzX', 'Dicionário de termos médicos e de enfermagem', 'Deocleciano Torrieri Guimarães (org.)', '2002', '1. ed.', 'São Paulo: Rideel', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('16j4EkVAvJLsAr-Fd0CzC6kbgYf9m1_Bx', 'Avaliação das sensações referidas pelo paciente após sedação para anestesia regional', 'João Felipe Schadeck Locatelli; Luiz Fernando Soares; Douglas Preigschadt Martins; Rodrigo de Marchi Teixeira', '2018', NULL, 'Arquivos Catarinenses de Medicina, 47(2), 13-22', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.')
ON CONFLICT (drive_file_id) DO UPDATE SET
reference_title=EXCLUDED.reference_title, reference_author=EXCLUDED.reference_author,
reference_year=EXCLUDED.reference_year, reference_edition=EXCLUDED.reference_edition,
reference_publisher=EXCLUDED.reference_publisher, verification_status='verified',
verified_from=EXCLUDED.verified_from, notes=EXCLUDED.notes, updated_at=now();
COMMIT;

-- LOTE 2: 10 documentos
BEGIN;
INSERT INTO public.rag_document_catalog (drive_file_id, reference_title, reference_author, reference_year, reference_edition, reference_publisher, verification_status, verified_from, notes)
VALUES
('17qpoGMDN4iu6_dGZl1L620eCwxOeypvr', 'Comunicação e orientação na transição do cuidado domiciliar em pacientes pós alta', 'Valéria de Freitas Ferreira; Wesley Martins; Josiane Andrade', '2022', NULL, 'Research, Society and Development, 11(8), e55611831341', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('18vXR395kiMezxuA4TcaQQJUmwOUsq8Bb', 'Diagnósticos de Enfermagem: definições e classificação 2021-2023', 'NANDA International, Inc.', '2021-2023', '12ª ed.', 'Thieme', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('19X545ckd-ZnfYbo73Tz2glTklUiDA9qd', 'Cuidados críticos de enfermagem: abordagem holística', NULL, NULL, NULL, NULL, 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1AgmiMWrMdEsKTJuyY89oN3ldd6w__Pbg', 'Cirurgias Seguras Salvam Vidas: manual — segundo desafio global para a segurança do paciente', 'Organização Mundial da Saúde (OMS)', '2009', NULL, 'Organização Mundial da Saúde', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1B6zSzhdLAkuIo6tAsxUEjnvdu5sparL5', 'Cicatrização e tratamento de feridas: a interface do conhecimento à prática do enfermeiro', 'Carlos Matheus Pierson Colares; Cristiana da Costa Luciano; Heliny Carneiro Cunha Neves; Anaclara Ferreira Veiga Tipple; Hélio Galdino Júnior', '2019', NULL, 'Enfermagem em Foco, 10(3), 52-58', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1FCdYFq79-qL4t0wgmmrOmaOnU_p9vDwv', 'A atuação da Angiologia e da Cirurgia Vascular na pandemia de COVID-19', 'Bernardo Cunha Senra Barros; Aline Barbosa Maia; Marcos Arêas Marques; Paulo Roberto Prette-Junior; Stenio Karlos Alvim Fiorelli; Fernanda de Castro Cerqueira', NULL, NULL, 'Rev Col Bras Cir, 47, e20202595', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1GTAHERp-d3jlwo9iPV2fobEiYdm_NmkA', 'Cuidado de enfermagem ao paciente cirúrgico no período pós-operatório', NULL, NULL, NULL, NULL, 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1I5nkO-d9qMt_s1r3x4cPCJt29IgkIhtl', 'Cirurgia Bariátrica: Indicações e Técnicas Cirúrgicas', 'Isabella Rodrigues Magalhães et al.', '2024', NULL, 'Brazilian Journal of Implantology and Health Sciences, 6(2), 469-483', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1IEpBXcCPCvgrivRH57lEmK_0i_7Jr-Tf', 'Manual Técnico de Arquitetura, Engenharia e Operação: Tutor de Enfermagem', NULL, NULL, NULL, NULL, 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1JQkYmjfUSx_Nhhh-z2PxKs_RG5s_8p2z', 'Protocolo para Cirurgia Segura', 'Ministério da Saúde; Agência Nacional de Vigilância Sanitária (Anvisa); Fundação Oswaldo Cruz (Fiocruz)', '2013', NULL, 'Ministério da Saúde', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.')
ON CONFLICT (drive_file_id) DO UPDATE SET
reference_title=EXCLUDED.reference_title, reference_author=EXCLUDED.reference_author,
reference_year=EXCLUDED.reference_year, reference_edition=EXCLUDED.reference_edition,
reference_publisher=EXCLUDED.reference_publisher, verification_status='verified',
verified_from=EXCLUDED.verified_from, notes=EXCLUDED.notes, updated_at=now();
COMMIT;

-- LOTE 3: 10 documentos
BEGIN;
INSERT INTO public.rag_document_catalog (drive_file_id, reference_title, reference_author, reference_year, reference_edition, reference_publisher, verification_status, verified_from, notes)
VALUES
('1JVN_nsRJnsqjoo8DuKWaPVEHZF0QAeyr', 'Resolução Cofen nº 696/2022: atuação da Enfermagem na Saúde Digital, normatizando a Telenfermagem', 'Conselho Federal de Enfermagem (Cofen)', '2022', NULL, 'Cofen', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1LlsbycBZNCPGzO4vAndxTBUKLVLsiZa7', 'Diretrizes Brasileiras de Ventilação Mecânica 2013', 'Associação de Medicina Intensiva Brasileira (AMIB); Sociedade Brasileira de Pneumologia e Tisiologia (SBPT)', '2013', NULL, NULL, 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1Mh_V8u_FP1r92gRcRHiR8P9DHC4rHGQy', 'Enfermagem em Centro Cirúrgico', NULL, NULL, NULL, NULL, 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1OhZNLuFYSKQFvrT7E2q8OSEkKd9YIByq', 'Obesidade controlada: para você entender uma nova forma de classificar a obesidade, baseada na trajetória do peso', NULL, NULL, NULL, 'Abeso', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1Otw5FXgeZJGUbhakBu-M56rpoUVgznpS', 'Pacientes em pós-operatório imediato: recepção na unidade clínico-cirúrgica', NULL, NULL, NULL, NULL, 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1P43NFM7XoK2UXMhagEztOGYD8_r9OKZM', 'O avanço nas técnicas de cirurgia bariátrica no Brasil: uma revisão integrativa', 'Vitor Araújo Vieira et al.', '2023', NULL, 'Research, Society and Development, 12(9), e9412943212', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1QIm6St6nnOIf7JXFwoXCy6-InqKhF2WI', 'Incision care and dressing selection in surgical incision wounds: findings from an international meeting of surgeons from Northern Europe', 'Rhidian Morgan-Jones (chair) et al.', '2022', NULL, 'Wounds International', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1RCyHau7fNnNhRka-atSPhppmAuW6JeRH', 'Preparo do paciente e sua família para a alta hospitalar', 'Neide da Silva Knihs', NULL, NULL, NULL, 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1TiWjB4dsk0mmiuDFZ1raAmjjSnWGQtVG', 'Embedding Wound Hygiene into a proactive wound healing strategy', 'Chris Murphy; Angela Walker', NULL, NULL, 'International Consensus Document', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1U34n6mhBI7TKPrrOJH77dErEq4MyOXTR', 'Prevenção e tratamento da obesidade: 10 ações nutricionais práticas', 'Departamento de Nutrição da Abeso', NULL, NULL, 'Abeso', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.')
ON CONFLICT (drive_file_id) DO UPDATE SET
reference_title=EXCLUDED.reference_title, reference_author=EXCLUDED.reference_author,
reference_year=EXCLUDED.reference_year, reference_edition=EXCLUDED.reference_edition,
reference_publisher=EXCLUDED.reference_publisher, verification_status='verified',
verified_from=EXCLUDED.verified_from, notes=EXCLUDED.notes, updated_at=now();
COMMIT;

-- LOTE 4: 10 documentos
BEGIN;
INSERT INTO public.rag_document_catalog (drive_file_id, reference_title, reference_author, reference_year, reference_edition, reference_publisher, verification_status, verified_from, notes)
VALUES
('1Um9T9xAIcWTPoL44NBgQQNMOz4V_IjQW', 'Global Guidelines for the Prevention of Surgical Site Infection', 'World Health Organization', '2018', '2nd ed.', 'World Health Organization', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1WZJNFwRSIvqsTzE3YlPo-kT9rBzfQKOO', 'Complicações no pós-operatório tardio em pacientes cirúrgicos: revisão integrativa', 'Álvaro Francisco Lopes de Sousa; Lucas Lazarini Bim; Paula Regina de Souza Hermann; Inês Fronteira; Andrade D.', '2020', NULL, 'Rev Bras Enferm, 73(5), e20190290', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1YUfjf2WG5FonQaOImCsAY6aHSuyK7XNL', 'Práticas Recomendadas SOBECC', NULL, '2013', '6ª ed.', NULL, 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1YZBXloGp4a2-hYLNDvlzZe-RwqQ_82bG', 'O pós-operatório da cirurgia bariátrica: um guia para resolver as principais dúvidas dos pacientes', 'Jacqueline Rizzolli (coord.); Denis Pajecki; Álvaro Albano; Sylka Rodovalho', NULL, NULL, 'Departamento de Cirurgia Bariátrica da Abeso', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1Zr2cWKl5SsHDYTNdiRLLHNFLI0JM2O7v', 'Nota Técnica GVIMS/GGTES nº 04/2017: práticas seguras para prevenção de retenção não intencional de objetos após realização de procedimento cirúrgico em serviços de saúde', 'Agência Nacional de Vigilância Sanitária (Anvisa)', '2017', NULL, 'Anvisa', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1Zs9Egj29vROqQ5Jc_drE6Jr5-0_ai4j6', 'Obesidade e cirurgia bariátrica no olhar dos ex-obesos mórbidos', 'Ana Valéria Carvalho Pires Yokokura et al.', NULL, NULL, 'Saúde em Debate', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1_8WY52g7BmnDCgiOeCVR5Adm3rhaTlTz', 'Feridas complexas e o biofilme: atualização de saberes e práticas para enfermagem', 'Ronny Anderson de Oliveira Cruz; Cizone Maria Carneiro Acioly; Vannucia Karla de Medeiros da Nóbrega; Patrícia Simplício de Oliveira', NULL, NULL, 'Revista Rede de Cuidados em Saúde', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1_WY-Q4LoAi4Fkd5paSX5-Ckx7S922iSP', 'International Consensus Document: Use of wound antiseptics in practice', 'Harikrishna K. R. Nair et al.', '2023', NULL, 'Wounds International', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1asX74LMu-mPVLx0kJ9HqoX_R2LgPIctF', 'Estratégias cirúrgicas e anestésicas no manejo da obesidade mórbida por cirurgia bariátrica', 'Priscylla Lucena Santos et al.', NULL, NULL, 'Journal of Medical and Biosciences Research', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1bAv0yjFJyAn6T--LXc3KCNFEsIt3wiTF', 'Guia para entender o tratamento com cirurgia bariátrica e metabólica', 'Departamento de Cirurgia Bariátrica', NULL, NULL, 'Abeso', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.')
ON CONFLICT (drive_file_id) DO UPDATE SET
reference_title=EXCLUDED.reference_title, reference_author=EXCLUDED.reference_author,
reference_year=EXCLUDED.reference_year, reference_edition=EXCLUDED.reference_edition,
reference_publisher=EXCLUDED.reference_publisher, verification_status='verified',
verified_from=EXCLUDED.verified_from, notes=EXCLUDED.notes, updated_at=now();
COMMIT;

-- LOTE 5: 10 documentos
BEGIN;
INSERT INTO public.rag_document_catalog (drive_file_id, reference_title, reference_author, reference_year, reference_edition, reference_publisher, verification_status, verified_from, notes)
VALUES
('1cvepErJkxwdGQqpbFa9XsKNEXupDtVpM', 'Resolução Cofen nº 731/2023: regulamenta a realização de sutura simples pelo Enfermeiro', 'Conselho Federal de Enfermagem (Cofen)', '2023', NULL, 'Cofen', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1daAAVEUbXVkW77c7qhpW1jJx0MuWsMNj', 'Cirurgia bariátrica: uma revisão bibliográfica', 'Lais Soares Morales et al.', '2023', NULL, 'Brazilian Journal of Health Review, 6(5), 20743-20750', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1dm45OLuwp1TysqvkOfc60v7yAsFthCBX', 'Atuação do enfermeiro na assistência pré e pós-operatória ao paciente de cirurgia bariátrica: uma revisão integrativa', 'Nayara Lucia do Nascimento et al.', '2025', NULL, 'Revista JRG de Estudos Acadêmicos, 8(18), e181826', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1eEE2VGeeqeY0G4xCeqAAmdituf7WsjVv', 'Glossário Técnico', NULL, NULL, NULL, NULL, 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1fK0AF3jec4OrQtIAROJPKMrdU8VWv89F', 'Assistência de Enfermagem e Intercorrências no Pós-Operatório Imediato (POI)', 'Keyla Nascimento', NULL, NULL, NULL, 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1gBvFE2DRjXYHLP-Qspksx7t3GiBEfyjI', 'Anestesia: classificação dos tipos e atuação da Enfermagem', NULL, '2017', '7ª ed. rev. e ampl.', 'SOBECC. Diretrizes de Práticas em Enfermagem Cirúrgica e Processamento de Produtos de Saúde', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1gu0sH0qoUa1kVbqtv0-Zz33OC4vvSEYD', 'Surgical wound dehiscence: improving prevention and outcomes', 'World Union of Wound Healing Societies', '2018', NULL, NULL, 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1hPPWPIJJ6zc-C0Tnihf6fpVwlE13HaoL', 'Nutrition Assessment: Clinical and Research Applications', 'Nancy Munoz; Melissa Bernstein (ed.)', '2019', NULL, 'Burlington, MA: Jones & Bartlett Learning', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1if-C_IzjQFeg3nPTTcXNWJKT8YooUHIR', 'Plano de Ensino 2026-2 — INT 5224: O cuidado no processo de viver humano II — a condição cirúrgica', NULL, '2026-2', NULL, 'Universidade Federal de Santa Catarina (UFSC)', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1kxe4y0u6waPpmW3VJFlZ7eGTam0959gI', 'Guia de Cuidados em Feridas', 'Conselho Regional de Enfermagem de São Paulo (Coren-SP)', '2025', NULL, 'Coren-SP', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.')
ON CONFLICT (drive_file_id) DO UPDATE SET
reference_title=EXCLUDED.reference_title, reference_author=EXCLUDED.reference_author,
reference_year=EXCLUDED.reference_year, reference_edition=EXCLUDED.reference_edition,
reference_publisher=EXCLUDED.reference_publisher, verification_status='verified',
verified_from=EXCLUDED.verified_from, notes=EXCLUDED.notes, updated_at=now();
COMMIT;

-- LOTE 6: 10 documentos
BEGIN;
INSERT INTO public.rag_document_catalog (drive_file_id, reference_title, reference_author, reference_year, reference_edition, reference_publisher, verification_status, verified_from, notes)
VALUES
('1lyRAPNXfNubucSWp6tbrE_fjNCFh3fTd', 'Construção e validação de um protocolo assistencial de enfermagem em anestesia', 'Cassiane de Santana Lemos; Vanessa de Brito Poveda; Aparecida de Cassia Giane Peniche', '2017', NULL, 'Revista Latino-Americana de Enfermagem, 25, e2952', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1m_HSGwUzG5sl9cy09ExR1YxXuR4KjBfh', 'Manual prático: da avaliação ao tratamento — os cuidados de enfermagem às pessoas com feridas oncológicas', 'Camila Vicente et al.', '2018', '1ª ed.', 'Florianópolis: Camila Vicente', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1nS-uUqHc6djf4-sf_oCg89yeyX7U1Vqh', 'Papel da Enfermagem perioperatória na anestesia: panorama nacional', 'Cassiane de Santana Lemos; Vanessa de Brito Poveda', '2022', NULL, 'Revista da Escola de Enfermagem da USP, 56, e20210465', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1nibYV0oDN8fWL_sVezweYwDXVQ4-7J-p', 'Complicações na sala de recuperação pós-anestésica: uma revisão integrativa', 'Maria Pontes de Aguiar Campos et al.', NULL, NULL, 'Revista SOBECC', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1oRkNX9x71DIl6EunfzmAPyGiXsbUUyW7', 'Transtornos alimentares e obesidade', 'Adriano Segal; Priscilla Gil; José C. Appolinário; Ana Clara Floresi', NULL, NULL, 'Departamento de Psiquiatria e Transtornos Alimentares; Abeso', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1qdnqA_uxbTzakZ1sv3nSpObmOGMH_PF3', 'Guia de Exame Físico para Enfermagem: guia de bolso', 'Carolyn Jarvis', NULL, '6ª ed.', 'Elsevier', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1qm9DPpaum7YUlIiYiD8cjibHvnHSHvY6', 'Anestesia geral é preditiva para a ocorrência de dor pós-operatória', 'Thaise Loyanne Felix Dias; Amanda Paula Mendonça Costa; Celio Melo Anjos; Joanlise Marco de Leon Andrade; Mani Indiana Funez', '2020', NULL, 'Brazilian Journal of Pain, 3(2), 113-117', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1rPHkdjmqyCHJYZZBJuYbFpTkSXo1gItE', 'Resumo Tipos de Anestesia e Atuação da Enfermagem', NULL, NULL, NULL, 'Universidade Federal de Santa Catarina, Departamento de Enfermagem', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1rZB8ydMuHYnWCe_r-NQEn5XT_Ynh3M6w', 'Fatores de risco da cirurgia bariátrica: uma revisão sistemática', 'Heloise Modolo de Melo et al.', '2023', NULL, 'Brazilian Journal of Health Review, 6(2)', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1rsAmg3UK8m_2fP4STqoiB_Zhyktnlw-W', 'Brunner & Suddarth: Tratado de enfermagem médico-cirúrgica', 'Lillian Sholtis Brunner; Doris Smith Suddarth; Suzanne C. Smeltzer (ed.)', '2014', '12ª ed. [reimpr.]', 'Rio de Janeiro: Guanabara Koogan', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.')
ON CONFLICT (drive_file_id) DO UPDATE SET
reference_title=EXCLUDED.reference_title, reference_author=EXCLUDED.reference_author,
reference_year=EXCLUDED.reference_year, reference_edition=EXCLUDED.reference_edition,
reference_publisher=EXCLUDED.reference_publisher, verification_status='verified',
verified_from=EXCLUDED.verified_from, notes=EXCLUDED.notes, updated_at=now();
COMMIT;

-- LOTE 7: 10 documentos
BEGIN;
INSERT INTO public.rag_document_catalog (drive_file_id, reference_title, reference_author, reference_year, reference_edition, reference_publisher, verification_status, verified_from, notes)
VALUES
('1sZ-qNwzDCdhcj1osXoe3SQx-B6Nmikf9', 'Diretriz BRASPEN de Enfermagem em Terapia Nutricional Oral, Enteral e Parenteral', 'Claudia Satiko Takemura Matsuba et al.', '2021', NULL, 'BRASPEN Journal, 36(3), Suplemento 3', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1s_GOMN45mxvxZwbH00bL71gcHRr9V8eD', 'Manual de Boas Práticas de Telemedicina e Telessaúde', 'Saúde Digital Brasil', '2025-2026', NULL, 'Saúde Digital Brasil', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1thXt7VYhkq97lqBrzin2Fu3KiLajarG-', 'O que usar no preparo cirúrgico da pele: povidona-iodo ou clorexidina?', 'Adriana Cristina de Oliveira; Camila Sarmento Gama', '2018', NULL, 'Revista SOBECC, 23(3), 155-159', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1vhBGYtuJbVsg2k8fh5x8ZFvL6SDC81fY', 'Resultado de enfermagem “permeabilidade das vias aéreas” em pacientes no pós-operatório', 'Giana Gislanne da Silva de Sousa et al.', '2020', NULL, 'Revista Brasileira de Enfermagem, 73(3), e20180355', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1wfGN61loXz7AcLSqxsqWZ1S639SBcymR', 'Linha de Cuidados da Pessoa Estomizada', NULL, '2015', NULL, 'Secretaria de Estado de Saúde de Minas Gerais', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1x6ItDqToXxEVWogytRPZIMvj0k9s_eT3', 'Implicações políticas, técnicas e socioculturais da sutura simples como atribuição do enfermeiro', 'Lucas Matheus Silva Dantas et al.', '2023', NULL, 'III Simpósio de Pesquisa Científica e II Congresso de Enfermagem do UNIRIOS', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1yAYbvBHEf6A_xWlq9f-xjBk4BTgtABnN', 'Boas Práticas em Sutura Simples: Guia para Enfermeiros', 'Conselho Regional de Enfermagem de São Paulo (Coren-SP)', '2025', NULL, 'Coren-SP', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1yNf2wjEd6Kh_6ws3A_aNhtCBF_rQ-Dy7', 'Fios e padrões de sutura', 'Keyla Cristiane do Nascimento', '2020-1', NULL, NULL, 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1ylCscDwfJvWf0BnRcKVBol8GfilwPNuk', 'Manual de Rotinas do Centro Cirúrgico', 'Ana Karina Silva da Rocha Tanaka et al.', '2022', NULL, 'Porto Alegre: Universidade Federal do Rio Grande do Sul, Escola de Enfermagem', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1ymUqtCBbHKAKBUqyuAgCrN4zfdps7LfE', 'Papel do enfermeiro na integridade emocional e física dos pacientes no pós cirúrgico: um estudo de revisão de literatura', 'Eliane de Oliveira Silva; Suely Amorim de Araújo', '2022', NULL, 'Research, Society and Development, 11(10), e143111031884', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.')
ON CONFLICT (drive_file_id) DO UPDATE SET
reference_title=EXCLUDED.reference_title, reference_author=EXCLUDED.reference_author,
reference_year=EXCLUDED.reference_year, reference_edition=EXCLUDED.reference_edition,
reference_publisher=EXCLUDED.reference_publisher, verification_status='verified',
verified_from=EXCLUDED.verified_from, notes=EXCLUDED.notes, updated_at=now();
COMMIT;

-- LOTE 8: 2 documentos
BEGIN;
INSERT INTO public.rag_document_catalog (drive_file_id, reference_title, reference_author, reference_year, reference_edition, reference_publisher, verification_status, verified_from, notes)
VALUES
('1z24RFyNSXK70wgr9-a3KZ9257xGsRJTD', 'Cuidados de enfermagem a pacientes em pré-operatório: proposta de checklist', 'Neiva Junkes Hoepers; Hercília Machado Baccin; Valdemira Santina Dagostin; Paula Iopi Zugnio; Maria Salete Salvaro', '2021', NULL, 'Revista Inova Saúde, 11(2)', 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'),
('1z_YMS4BiOR5VPF_bpTCBcqH1dnsd6KwT', 'Resumo 4 tempos cirúrgicos: fundamentais para a organização da assistência de enfermagem no centro cirúrgico', 'Vanessa Martinhago Borges Fernandes', NULL, NULL, NULL, 'verified', 'reference_catalog.json', 'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.')
ON CONFLICT (drive_file_id) DO UPDATE SET
reference_title=EXCLUDED.reference_title, reference_author=EXCLUDED.reference_author,
reference_year=EXCLUDED.reference_year, reference_edition=EXCLUDED.reference_edition,
reference_publisher=EXCLUDED.reference_publisher, verification_status='verified',
verified_from=EXCLUDED.verified_from, notes=EXCLUDED.notes, updated_at=now();
COMMIT;

-- Aplique 040_sync_catalog_reference_metadata_to_chunks.sql antes deste bloco
-- se o trigger ainda não existir. O trigger preserva content, embeddings e demais metadados.

-- EXPECTED_VERIFIED_CATALOG_ROWS: 72
