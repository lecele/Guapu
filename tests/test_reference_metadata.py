from reference_metadata import extract_reference_metadata, propose_cover_title


def test_proposes_multiline_cover_title_without_filename():
    assert propose_cover_title("GLOBAL GUIDELINES\nFOR THE PREVENTION OF\nSURGICAL SITE INFECTION") == (
        "GLOBAL GUIDELINES FOR THE PREVENTION OF SURGICAL SITE INFECTION"
    )


def test_proposes_title_case_cover_title_without_filename():
    assert propose_cover_title("Guia de Cuidados em Feridas\nA enfermagem é essencial na prevenção e tratamento.") == (
        "Guia de Cuidados em Feridas"
    )


def test_rejects_editorial_credits_as_reference():
    assert propose_cover_title("DIREÇÃO EDITORIAL\nGláucia Maria Moraes de Oliveira\nREVISÃO ACADÊMICA\nMaria Lucia Brandão") == ""


def test_does_not_store_cover_heuristic_as_bibliographic_metadata():
    assert extract_reference_metadata([
        {"text": "Guia de Cuidados em Feridas\nA enfermagem é essencial na prevenção e tratamento."}
    ]) == {}
