import axios from 'axios';

const chroma = axios.create({
  baseURL: 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json'
  }
});

async function test() {
  try {
    const res = await chroma.get('/api/v2/heartbeat');
    console.log('✅ 서버 응답:', res.data);
  } catch (err) {
    console.error('❌ 연결 실패:', err.message);
  }
}

test();