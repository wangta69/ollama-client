import axios from 'axios';
import { ChromaClient } from 'chromadb';

// ✅ 사전 FAQ 데이터
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

// ✅ Ollama Embedding
async function getEmbedding(text) {
  const res = await axios.post('http://localhost:11434/api/embeddings', {
    // model: 'nomic-embed-text',
    model: 'nomic-embed-text',
    prompt: text,
  });
  return res.data.embedding;
}

// ✅ llama3 또는 mistral로 자연스러운 문장 생성
async function paraphraseAnswer(answer, userQuestion) {
  const prompt = `
사용자 질문: "${userQuestion}"
기본 답변: "${answer}"

위 답변을 한 문장으로, 간결하고 자연스럽게 한국어로 다시 표현해줘.
중복된 정보나 번역, 설명은 제거해줘. 핵심 내용만 정확하게 전달해줘.
  `.trim();

  const res = await axios.post('http://localhost:11434/api/generate', {
    model: 'mistral', // llama3 도 가능
    prompt: prompt,
    stream: false
  });

  // return res.data.response.trim();
  // 🔧 괄호 안 부가 정보 제거
  return res.data.response.trim().replace(/\s*\(.*?\)\s*/g, '').trim();
}

// ✅ ChromaDB 초기화 및 FAQ 데이터 삽입
async function initChroma() {
  const client = new ChromaClient();
  const collectionName = 'faq-data';

  // 🧹 기존 컬렉션 삭제 (차원 불일치 방지용)
  try {
    await client.deleteCollection({ name: collectionName });
    console.log('🗑️ 기존 컬렉션 삭제 완료');
  } catch (e) {
    console.log('ℹ️ 컬렉션이 없거나 삭제 실패:', e.message);
  }

  // ✅ 새로 생성
  const collection = await client.getOrCreateCollection({ name: collectionName });


  console.log('📝 FAQ 데이터 저장 중...');
  
  console.log('faqData:', faqData);
  const embeddings = await Promise.all(
    faqData.map(item => getEmbedding(item.question))
  );


  await collection.add({
    ids: faqData.map((_, i) => 'faq_' + i),
    documents: faqData.map(item => item.question),
    metadatas: faqData.map(item => ({ answer: item.answer })),
    embeddings
  });

  console.log('✅ 컬렉션 생성 완료: 임베딩 저장됨');
  console.log(collection)

  return collection;
}

async function getChromaCollection(collectionName) {
  const client = new ChromaClient();
  return await client.getCollection({ name: collectionName });
}

// ✅ 사용자 질문에 대해 최적의 답변 찾기
async function findBestAnswer(userQuestion, collection) {
  const queryEmbedding = await getEmbedding(userQuestion);
  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: 1
  });

  const best = results?.metadatas?.[0]?.[0];
  const bestScore = results?.distances?.[0]?.[0];

  if (!best) {
    console.log(`\n🟠 질문: ${userQuestion}`);
    console.log('⚠️  답변을 찾지 못했습니다.');
    return;
  }

  const final = await paraphraseAnswer(best.answer, userQuestion);
  console.log(`\n🟢 질문: ${userQuestion}`);
  console.log(`💬 답변: ${final} (유사도: ${bestScore.toFixed(3)})`);
}

// ✅ 메인 실행
(async () => {
  // const collection = await initChroma();
  const collection = await getChromaCollection('faq-data');
  // 테스트용 질문
  await findBestAnswer('전화번호 알려줘', collection);
  await findBestAnswer('메일 주소는 뭔가요?', collection);
  await findBestAnswer('운영시간은 어떻게 돼?', collection);
})();
