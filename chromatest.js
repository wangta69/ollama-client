// import fetch from 'node-fetch';
// // 글로벌 fetch 지정 (중요)
// if (!globalThis.fetch) {
//   globalThis.fetch = fetch;
// }
import { ChromaClient } from 'chromadb';

const client = new ChromaClient({url: 'http://127.0.0.1:8000'});
// const client = new ChromaClient({ host: 'http://localhost:8000' });

// const client = new ChromaClient({ host: 'http://192.168.0.36:8000' });
// const client = new ChromaClient({ host: 'http://host.docker.internal:8000' });

async function testChromaConnection() {
  try {
    const collections = await client.listCollections();
    console.log('✅ 연결 성공! 현재 컬렉션 목록:', collections);
  } catch (err) {
    console.error('❌ 연결 실패:', err.message);
  }
}

testChromaConnection();