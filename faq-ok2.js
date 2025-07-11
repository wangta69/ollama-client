import axios from 'axios';

// 📌 사전 FAQ 데이터 (추후 DB 또는 JSON에서 로딩 가능)
const faqData = [
  {
    question: '고객센터 전화번호 알려줘',
    answer: '고객지원팀 전화번호는 010-9999-0000 입니다.'
  },
  {
    question: '운영 시간은 언제야?',
    answer: '운영 시간은 평일 오전 9시부터 오후 6시까지입니다.'
  },
  {
    question: '이메일 주소가 뭐야?',
    answer: 'support@onstory.fun 으로 이메일 주세요.'
  }
];

// ✅ Ollama Embedding 호출
export async function getEmbedding(text) {
  const res = await axios.post('http://localhost:11434/api/embeddings', {
    model: 'nomic-embed-text',
    prompt: text,
  });
  return res.data.embedding; // 벡터 배열 반환
}

// ✅ 두 벡터 간 코사인 유사도 계산
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (normA * normB);
}

// ✅ 답변을 자연스럽게 표현하도록 llama3 호출
async function paraphraseAnswer(answer, userQuestion) {
  const prompt = `
사용자 질문: "${userQuestion}"
기본 답변: "${answer}"
위 답변에서 핵심 정보는 유지하되, 자연스럽고 사람 말처럼 하나의 문장으로 다시 표현해줘.
되도록 한글로 표현해줘
  `.trim();

  const res = await axios.post('http://localhost:11434/api/generate', {
    // model: 'llama3',
    // model: 'nomic-embed-text',
    model: 'mistral',
    prompt: prompt,
    stream: false
  });

  return res.data.response.trim();
}

// ✅ 전체 프로세스 실행
async function findBestAnswer(userQuestion) {
  const userEmbedding = await getEmbedding(userQuestion);

  let bestScore = -1;
  let bestAnswer = '죄송합니다. 답변을 찾을 수 없습니다.';

  for (const item of faqData) {
    const questionEmbedding = await getEmbedding(item.question); // 실제 서비스에선 캐싱 권장
    const score = cosineSimilarity(userEmbedding, questionEmbedding);
    if (score > bestScore) {
      bestScore = score;
      bestAnswer = item.answer;
    }
  }

  const finalResponse = await paraphraseAnswer(bestAnswer, userQuestion);

  console.log(`\n🟢 질문: ${userQuestion}`);
  console.log(`💬 답변: ${finalResponse} (유사도: ${bestScore.toFixed(3)})`);
}

// ✅ 테스트 실행
findBestAnswer('전화번호 알려줘');
findBestAnswer('전화 번호');
findBestAnswer('메일 주소는 뭔가요?');
findBestAnswer('운영시간은 어떻게 돼?');
findBestAnswer('메일좀 보내게 주소좀 알려줒세요');