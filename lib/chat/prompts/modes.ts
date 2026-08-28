import type { GenerationMode } from '../session-flow';

interface ModePromptInput {
  mode: GenerationMode;
  question: string;
  topic: string;
  quizQuestion: number;
}

function nextQuizInstruction(questionNumber: number, topic: string): string {
  if (questionNumber >= 3) {
    return 'Não gere outra questão. Informe que as três questões foram concluídas e ofereça continuar, trocar tema, voltar ao menu ou encerrar.';
  }
  const next = questionNumber + 1;
  return `Gere em seguida a **Questão ${next}:** sobre "${topic}", com alternativas A, B, C e D em linhas separadas.`;
}

function quizScopeGuard(topic: string): string {
  return `REGRA CRÍTICA DE ESCOPO: o tema imutável deste quiz é "${topic}". Cada enunciado, alternativa, correção e explicação deve tratar exclusivamente desse tema. Ignore temas de quizzes anteriores presentes no histórico. Não substitua o tema por outro conteúdo cirúrgico relacionado e não invente informações que não estejam sustentadas pelos trechos RAG recuperados.`;
}

export function buildModePrompt({ mode, question, topic, quizQuestion }: ModePromptInput): string {
  const currentQuestion = Math.min(3, Math.max(1, quizQuestion || 1));
  const targetTopic = topic || question;

  switch (mode) {
    case 'simulado_tema':
      return `[MODO ATIVO: INICIAR QUIZ]
Tema: ${targetTopic}
${quizScopeGuard(targetTopic)}
Crie somente a **Questão ${currentQuestion}:**, clara e baseada nos materiais RAG.
Use exatamente quatro alternativas, cada uma em linha separada: **A)**, **B)**, **C)** e **D)**.
Não revele a resposta, não inclua referências e solicite apenas a letra escolhida.`;

    case 'simulado_respondendo':
      return `[MODO ATIVO: AVALIAR PRIMEIRA TENTATIVA DO QUIZ]
Tema: ${targetTopic}
${quizScopeGuard(targetTopic)}
Questão atual: ${currentQuestion}
Resposta do estudante: ${question}
Avalie usando a última questão visível no histórico.
Se estiver incorreta, responda exatamente: "Sua resposta está incorreta. Tente novamente! Qual das alternativas você escolheria agora?"
Se estiver correta, confirme em no máximo duas frases. ${nextQuizInstruction(currentQuestion, targetTopic)}
Não inclua referências.`;

    case 'simulado_segunda_tentativa':
      return `[MODO ATIVO: AVALIAR SEGUNDA TENTATIVA DO QUIZ]
Tema: ${targetTopic}
${quizScopeGuard(targetTopic)}
Questão atual: ${currentQuestion}
Segunda resposta do estudante: ${question}
Se estiver correta, confirme em uma frase.
Se estiver incorreta, revele a alternativa correta e explique em no máximo duas frases.
${nextQuizInstruction(currentQuestion, targetTopic)}
Não inclua referências.`;

    case 'resumo':
      return `[MODO ATIVO: RESUMO]
Tema: ${targetTopic}
Produza aproximadamente 250 a 400 palavras, em quatro parágrafos desenvolvidos e obrigatórios: **Explicação:**, **Exemplo clínico:** sustentado pelos materiais, **Relação com a prática de enfermagem:** com ações concretas e **Sugestão de estudo complementar:** quando houver base no RAG. Não reduza nenhum desses blocos a uma frase isolada.
Finalize exatamente com uma única frase corrida, sem lista ou marcadores: "Deseja aprofundar este tema, escolher outro tema, voltar ao menu principal ou encerrar a sessão?"`;

    case 'resumo_aprofundar':
      return `[MODO ATIVO: APROFUNDAR RESUMO]
Tema atual: ${targetTopic}
Não pergunte o tema novamente. Aprofunde apenas conceitos sustentados pelos materiais.
Use: **Explicação aprofundada:**, **Aspectos avançados:**, **Implicações clínicas:** e **Sugestões de estudo complementar:**.
Finalize exatamente com uma única frase corrida, sem lista ou marcadores: "Deseja aprofundar este tema, escolher outro tema, voltar ao menu principal ou encerrar a sessão?"`;

    case 'resumo_reformular':
      return `[MODO ATIVO: REFORMULAR COM CONCISÃO]
Tema atual: ${targetTopic}
Reescreva somente a resposta atual em um parágrafo de 2 a 4 frases. Não aprofunde nem troque o tema. Mantenha os conceitos essenciais e a relação com a prática quando couber.`;

    case 'info':
      return `[MODO ATIVO: INFORMAÇÕES DA DISCIPLINA]
Pergunta: ${targetTopic}
Responda diretamente com base no plano de ensino recuperado. Não invente nomes, datas, horários ou critérios.
Antes de responder sobre notas, pesos ou médias, confira a soma aritmética dos valores citados. Diferencie o peso total de uma categoria dos pesos dos itens visíveis. Se a tabela recuperada estiver truncada, incompleta ou inconsistente, não reconstrua a fórmula e não atribua um total aos itens listados; explique objetivamente a limitação e oriente a consulta ao plano completo no Moodle.
Se faltar qualquer outra informação, oriente a consulta ao plano de ensino no Moodle.
Ofereça outra pergunta, menu ou encerramento.`;

    case 'livre':
    default:
      return `[MODO ATIVO: PERGUNTA LIVRE]
Pergunta do estudante: ${question}
Responda apenas ao que estiver sustentado pelos materiais RAG. Antes de finalizar, confira se todos os elementos centrais da pergunta foram tratados explicitamente; não omita um aspecto relevante quando ele estiver presente nos trechos recuperados. Em perguntas sobre cuidados de enfermagem no pós-operatório imediato, inclua avaliação da dor e do conforto quando houver base no material, junto aos demais cuidados sustentados pelos trechos. Sem pedido explícito de concisão, responda de forma detalhada e objetiva, com explicação, exemplo contextualizado quando houver base e relação com a prática de enfermagem.`;
  }
}
