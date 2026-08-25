# Relatório Executivo de Atualizações e Guia do Painel

**Tutor de Inteligência Artificial — Disciplina INT 5224 (UFSC)**  
**Data:** 18 de agosto de 2026  
**Versão do Sistema:** v2.4 (Produção)

---

### Links de Acesso
- **Assistente do Estudante:** https://tutor-de-enfermagem.vercel.app
- **Painel Administrativo:** https://tutor-de-enfermagem.vercel.app/admin

---

## 1. Novas Mudanças e Melhorias Implementadas

### a) Estabilidade e Resiliência da IA (Multi-Model Fallback)
Para evitar interrupções causadas por instabilidades temporárias de tráfego na API da Google (como erros de alta demanda 503), criamos uma esteira automática de contingência com 4 modelos (Gemini 3.7 Flash -> Gemini 3.6 Flash -> Gemini 3.5 Flash -> Gemini Flash Latest). Caso ocorra lentidão externa, o sistema chaveia em milissegundos sem que o usuário perceba nenhuma falha.

### b) Refinamento da Avaliação por Estrelas (Escala Likert 1 a 5)
O quadro de avaliação por estrelas agora aparece de forma contextual apenas nas etapas de conclusão do estudo (ao final de um Resumo de Conteúdo, ao final de uma questão do Simulado ou na consulta às Informações da Disciplina), mantendo o diálogo limpo nas conversas intermediárias.

### c) Registro de Notas Vinculadas por Conversa no Painel
O identificador de cada sessão agora é associado diretamente à nota fornecida pelo aluno. Isso permite visualizar a média individual de satisfação de cada estudante na tabela de conversas e no cabeçalho do dossiê.

### d) Auditoria Completa da Base RAG e Pasta Biblioteca
Realizamos a verificação detalhada de todos os 122 materiais indexados na base vetorial (36.004 fragmentos de texto). A pasta Biblioteca (com livros integrais como Brunner & Suddarth, Morton & Fontaine, SOCERJ, NANDA-I e Medcel) compõe 85,2% de todo o conhecimento da ferramenta (30.685 fragmentos) e participa de 100% das consultas realizadas pelos estudantes.

---

## 2. Guia de Funcionalidades do Painel Administrativo (/admin)

O painel administrativo foi estruturado em três abas temáticas para facilitar o acompanhamento pedagógico e técnico da disciplina:

### Aba 1: Dashboard Geral (Indicadores de Uso e Desempenho)
- **Indicadores Principais (Cards de KPI):** Apresenta o total de conversas, total de mensagens, tempo médio de resposta da IA, percentual de precisão do RAG e nota média de satisfação dos alunos.
- **Gráfico de Acessos por Dia:** Exibe a curva diária de mensagens trocadas, permitindo identificar picos de estudo antes de provas e entregas.
- **Modos de Estudo:** Gráfico de setores que divide o uso entre Resumos, Quizes, Informações da Disciplina e Perguntas Livres.
- **Temas Mais Consultados:** Ranking clínico dos assuntos mais estudados (Hemostasia, Feridas, Cirurgia Bariátrica, Anestesia, Estomas, etc.), funcionando como termômetro das principais dúvidas da turma.
- **Quadro de Avaliação de Satisfação:** Exibe o histograma completo de notas de 1 a 5 estrelas e o percentual de aprovação geral.

### Aba 2: Registro de Conversas e Dossiês Pedagógicos
- **Busca e Filtros Rápidos:** Permite localizar sessões por palavra-chave, tema clínico ou filtrar apenas conversas de quiz ou resumo.
- **Tabela Dinâmica:** Lista todas as sessões com identificador, primeira mensagem, tema detectado, data/hora, quantidade de interações e a nota atribuída pelo aluno.
- **Visualização de Dossiê:** Ao clicar em "Ver Dossiê", a coordenação pode ler toda a transcrição da conversa entre o estudante e o tutor, com a opção de baixar o histórico completo em arquivo de texto (.TXT).

### Aba 3: Sistema e Telemetria da Base RAG
- **Status da Infraestrutura:** Monitoramento em tempo real do banco de dados vetorial, da API do Google Gemini e dos servidores em nuvem.
- **Telemetria de Segurança:** Contador de ativação das regras de proteção e limites éticos da disciplina (Seção 5 do prompt).
- **Inventário de Documentos e Livros:** Tabela completa com todos os 122 materiais indexados, detalhando o volume de fragmentos e o status ativo de cada livro da pasta Biblioteca.

---

## 3. Novo Recurso: Exportação Completa para Excel (.XLSX)

O botão **"Exportar Excel"** localizado no canto superior direito do painel foi atualizado para gerar uma planilha estruturada com duas abas prontas para relatórios e análises aprofundadas:

1. **Aba "Indicadores & Métricas":** Consolida todos os dados quantitativos em tabelas executivas (Totais de sessões e mensagens, nota média, taxa de aprovação, distribuição percentual por modo pedagógico, ranking de temas clínicos e inventário da base de livros).
2. **Aba "Registro de Conversas":** Contém a relação completa de todas as conversas com data/hora de início, última atividade, número de interações, tema detectado, nota de avaliação recebida e o texto da pergunta inicial do estudante.
