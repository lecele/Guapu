export interface CatalogReference {
  reference_title: string;
  reference_author?: string;
  reference_year?: string;
  reference_edition?: string;
  reference_publisher?: string;
  reference_source: 'catalog';
  reference_verified: true;
  reference_key: string;
}

/**
 * Bootstrap versionado das identidades bibliográficas conferidas no próprio
 * documento. A migração 031 replica estes registros no catálogo do Supabase;
 * manter o bootstrap permite atualizar o app enquanto a ponte SQL estiver
 * indisponível, sem derivar uma referência do nome do arquivo.
 */
export const DOCUMENT_REFERENCE_CATALOG: Record<string, CatalogReference> = {
  '19X545ckd-ZnfYbo73Tz2glTklUiDA9qd': {
    reference_title: 'Cuidados críticos de enfermagem: abordagem holística',
    reference_source: 'catalog',
    reference_verified: true,
    reference_key: '19X545ckd-ZnfYbo73Tz2glTklUiDA9qd',
  },
  '1IEpBXcCPCvgrivRH57lEmK_0i_7Jr-Tf': {
    reference_title: 'Manual Técnico de Arquitetura, Engenharia e Operação: Tutor de Enfermagem',
    reference_source: 'catalog',
    reference_verified: true,
    reference_key: '1IEpBXcCPCvgrivRH57lEmK_0i_7Jr-Tf',
  },
  '1eEE2VGeeqeY0G4xCeqAAmdituf7WsjVv': {
    reference_title: 'Glossário Técnico',
    reference_source: 'catalog',
    reference_verified: true,
    reference_key: '1eEE2VGeeqeY0G4xCeqAAmdituf7WsjVv',
  },
  '1hPPWPIJJ6zc-C0Tnihf6fpVwlE13HaoL': {
    reference_title: 'Nutrition Assessment: Clinical and Research Applications',
    reference_author: 'Nancy Munoz; Melissa Bernstein (ed.)',
    reference_year: '2019',
    reference_publisher: 'Burlington, MA: Jones & Bartlett Learning',
    reference_source: 'catalog',
    reference_verified: true,
    reference_key: '1hPPWPIJJ6zc-C0Tnihf6fpVwlE13HaoL',
  },
  '1rsAmg3UK8m_2fP4STqoiB_Zhyktnlw-W': {
    reference_title: 'Brunner & Suddarth: Tratado de enfermagem médico-cirúrgica',
    reference_author: 'Lillian Sholtis Brunner; Doris Smith Suddarth; Suzanne C. Smeltzer (ed.)',
    reference_year: '2014',
    reference_edition: '12ª ed. [reimpr.]',
    reference_publisher: 'Rio de Janeiro: Guanabara Koogan',
    reference_source: 'catalog',
    reference_verified: true,
    reference_key: '1rsAmg3UK8m_2fP4STqoiB_Zhyktnlw-W',
  },
  '1YUfjf2WG5FonQaOImCsAY6aHSuyK7XNL': {
    reference_title: 'Práticas Recomendadas SOBECC',
    reference_year: '2013',
    reference_edition: '6ª ed.',
    reference_source: 'catalog',
    reference_verified: true,
    reference_key: '1YUfjf2WG5FonQaOImCsAY6aHSuyK7XNL',
  },
};

export function enrichDocumentReferenceMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const fileId = typeof metadata.drive_file_id === 'string' ? metadata.drive_file_id : '';
  const catalog = fileId ? DOCUMENT_REFERENCE_CATALOG[fileId] : undefined;
  if (!catalog || metadata.reference_verified === true) return metadata;
  return { ...metadata, ...catalog };
}
