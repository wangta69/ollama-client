// ✅ Ollama + Chroma (v3.0.6) + Embedding + 고객FAQ 기반 RAG 챗봇 예제 (Node.js)
// 설치 필요: npm install axios chromadb@3.0.6 cheerio dotenv

// const axios = require('axios');
// const cheerio = require('cheerio');
// const { ChromaClient, OpenAIEmbeddingFunction } = require('chromadb');
// require('dotenv').config();

import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';
import 'dotenv/config';
// require('dotenv').config();

console.log(process.env.OPENAI_API_KEY);

// const client = new ChromaClient({ path: 'http://localhost:8000' });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const response = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: '대한민국의 수도는 어디인가요?'
});

const embedding = response.data[0].embedding;
console.log(embedding)
// const collection = await client.getOrCreateCollection({ name: 'my_collection' });

// await collection.add({
//   ids: ['doc1'],
//   embeddings: [embedding],
//   documents: ['대한민국의 수도는 서울입니다.']
// });

// const embedder = new OpenAIEmbeddingFunction({
//   openai_api_key: process.env.OPENAI_API_KEY
// });

// const collection = await client.getOrCreateCollection({
//   name: 'my_collection',
//   embeddingFunction: embedder
// });

// await collection.add({
//   ids: ['doc1'],
//   documents: ['대한민국의 수도는 서울입니다.']
// });

const results = await collection.query({
  queryTexts: ['한국의 수도는 어디인가요?'],
  nResults: 1
});

console.log(results);

/*
// const chroma = new ChromaClient();
const client = new ChromaClient({ path: 'http://localhost:8000' });
const collectionName = 'faq-collection';
let collection;

// ✅ 1. 벡터화 함수 (Ollama embedding 사용)
async function embed(text) {
  const res = await axios.post('http://localhost:11434/api/embeddings', {
    model: 'nomic-embed-text',
    prompt: text
  });
  return res.data.embedding;
}

// ✅ 2. FAQ 또는 웹에서 가져온 콘텐츠를 임베딩 후 저장
async function indexFAQData(faqArray) {
  collection = await chroma.getOrCreateCollection({ name: collectionName });
  for (const item of faqArray) {
    const id = item.id || item.question;
    const embedding = await embed(item.question + '\n' + item.answer);
    await collection.add({
      ids: [id],
      documents: [item.answer],
      embeddings: [embedding],
      metadatas: [item]
    });
    console.log(`✅ Indexed: ${id}`);
  }
}

// ✅ 3. 질문 → 검색 → 답변 생성
async function answerQuestion(userQuestion) {
  const questionEmbedding = await embed(userQuestion);
  const results = await collection.query({
    queryEmbeddings: [questionEmbedding],
    nResults: 1
  });

  const context = results.documents[0];
  const prompt = `고객 질문: ${userQuestion}\n\n기존 자료:\n${context}\n\n이 내용을 바탕으로 친절하게 답변해 주세요.`;
  const res = await axios.post('http://localhost:11434/api/generate', {
    model: 'mistral',
    prompt,
    stream: false
  });
  console.log('🤖 답변:', res.data.response);
}

// ✅ 4. 웹페이지에서 내용 스크래핑하여 임베딩
async function embedFromWebpage(url) {
  const html = await axios.get(url).then(res => res.data);
  const $ = cheerio.load(html);
  const title = $('title').text();
  const h1 = $('h1').first().text();
  const content = $('p').slice(0, 5).map((i, el) => $(el).text()).get().join('\n');
  const fullText = `${title}\n${h1}\n${content}`;

  const embedding = await embed(fullText);
  collection = await chroma.getOrCreateCollection({ name: collectionName });
  await collection.add({
    ids: [url],
    documents: [fullText],
    embeddings: [embedding],
    metadatas: [{ source: url }]
  });
  console.log(`🌐 Indexed Web: ${url}`);
}
*/
// ✅ 예제 실행
// (async () => {
//   const faqData = [
//     { id: 'faq1', question: '반품은 어떻게 하나요?', answer: '7일 이내 마이페이지에서 신청 가능합니다.' },
//     { id: 'faq2', question: '배송은 얼마나 걸리나요?', answer: '1~3일 내 도착합니다.' }
//   ];

//   await indexFAQData(faqData);
//   await embedFromWebpage('https://www.onstory.fun/doc/programming/jquery/ajax');
//   await answerQuestion('jQuery로 ajax 요청하려면 어떻게 해?');
// })();