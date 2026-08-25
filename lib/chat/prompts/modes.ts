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

export function buildModePrompt({ mode, question, topic, quizQuestion }: ModePromptInput): string {
  const currentQuestion = Math.min(3, Math.max(1, quizQuestion || 1));
  const targetTopic = topic || question;

  switch (mode) {
    case 'simulado_tema':
      return `[MODO ATIVO: INICIAR QUIZ]
Tema: ${targetTopic}
Crie somente a **Questão ${currentQuestion}:**, clara e baseada nos materiais RAG.
Use exatamente quatro alternativas, cada uma em linha separada: **A)**, **B)**, **C)** e **D)**.
Não revele a resposta, não inclua referências e solicite apenas a letra escolhida.`;

    case 'simulado_respondendo':
      return `[MODO ATIVO: AVALIAR PRIMEIRA TENTATIVA DO QUIZ]
Tema: ${targetTopic}
Questão atual: ${currentQuestion}
Resposta do estudante: ${question}
Avalie usando a última questão visível no histórico.
Se estiver incorreta, responda exatamente: "Sua resposta está incorreta. Tente novamente! Qual das alternativas você escolheria agora?"
Se estiver correta, confirme em no máximo duas frases. ${nextQuizInstruction(currentQuestion, targetTopic)}
Não inclua referências.`;

    case 'simulado_segunda_tentativa':
      return `[MODO ATIVO: AVALIAR SEGUNDA TENTATIVA DO QUIZ]
Tema: ${targetTopic}
Questão atual: ${currentQuestion}
Segunda resposta do estudante: ${question}
Se estiver correta, confirme em uma frase.
Se estiver incorreta, revele a alternativa correta e explique em no máximo duas frases.
${nextQuizInstruction(currentQuestion, targetTopic)}
Não inclua referências.`;

    case 'resumo':
      return `[MODO ATIVO: RESUMO]
Tema: ${targetTopic}
Responda com: **Explicação:**, **Exemplo clínico:**, **Relação com a prática:**, **Sugestões de estudo complementar:** e **Referências:**.
Finalize oferecendo aprofundar, escolher outro tema, voltar ao menu ou encerrar.`;

    case 'resumo_aprofundar':
      return `[MODO ATIVO: APROFUNDAR RESUMO]
Tema atual: ${targetTopic}
Não pergunte o tema novamente. Aprofunde apenas conceitos sustentados pelos materiais.
Use: **Explicação aprofundada:**, **Aspectos avançados:**, **Implicações clínicas:**, **Sugestões de estudo complementar:** e **Referências:**.
Finalize oferecendo aprofundar, escolher outro tema, voltar ao menu ou encerrar.`;

    case 'resumo_reformular':
      return `[MODO ATIVO: REFORMULAR COM CONCISÃO]
Tema atual: ${targetTopic}
Reescreva a resposta anterior de forma mais curta. Não aprofunde nem troque o tema.
Mantenha conceitos essenciais, relação com a prática e referências disponíveis.`;

    case 'info':
      return `[MODO ATIVO: INFORMAÇÕES DA DISCIPLINA]
Pergunta: ${targetTopic}
Responda diretamente com base no plano de ensino recuperado. Não invente nomes, datas, horários ou critérios.
Se faltar informação, oriente a consulta ao plano de ensino no Moodle.
Inclua referências e ofereça outra pergunta, menu ou encerramento.`;

    case 'livre':
    default:
      return `[MODO ATIVO: PERGUNTA LIVRE]
Pergunta do estudante: ${question}
Responda apenas ao que estiver sustentado pelos materiais RAG, de forma concisa, com referências ao final.`;
  }
}
