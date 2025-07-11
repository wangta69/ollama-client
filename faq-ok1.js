import axios from 'axios';

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

export async function getEmbedding(text) {
  const res = await axios.post('http://localhost:11434/api/embeddings', {
    model: 'nomic-embed-text',
    prompt: text,
  });

  return res.data.embedding; // 배열 형태
}


function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (normA * normB);
}

async function findBestAnswer(userQuestion) {
  const userEmbedding = await getEmbedding(userQuestion);

  let bestScore = -1;
  let bestAnswer = '죄송합니다. 답변을 찾을 수 없습니다.';

  for (const item of faqData) {
    const questionEmbedding = await getEmbedding(item.question); // ✅ 실제 구현 시엔 미리 캐싱!
    const score = cosineSimilarity(userEmbedding, questionEmbedding);
    if (score > bestScore) {
      bestScore = score;
      bestAnswer = item.answer;
    }
  }

  console.log(`Q: ${userQuestion}`);
  console.log(`A: ${bestAnswer} (유사도: ${bestScore.toFixed(3)})`);
}

// 예제 실행
findBestAnswer('고객지원팀 전화 번호는 뭐니?');

findBestAnswer('전화 번호는?');