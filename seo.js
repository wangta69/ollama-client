const axios = require('axios');
const cheerio = require('cheerio'); // HTML 파싱용
require('dotenv').config();
const mysql = require('mysql');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'db_user',
  password: process.env.DB_PASSWORD || 'db_password',
  database: process.env.DB_DATABASE || 'database',
  port: process.env.DB_PORT || '3306',
  multipleStatements: true
});

// DB 쿼리 헬퍼
function query(sql, params, callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  pool.getConnection((err, connection) => {
    if (err) return callback(err);
    connection.query(sql, params, (err, results) => {
      connection.release();
      if (err) return callback(err);
      callback(null, results);
    });
  });
}

function truncate(text, maxLength) {
  if (!text) return '';
  return text.length <= maxLength ? text : text.slice(0, maxLength).trim();
}

function cleanValue(text) {
  return text.replace(/^["']+|["']+$/g, '').trim(); // 앞뒤 " 또는 ' 제거
}
// Ollama 응답 파싱 도우미
function extractField(text, label) {
  const match = text.match(new RegExp(`${label}\\s*[:：\\-–]\\s*(.+)`, 'i'));
  return match ? cleanValue(match[1]) : '';
}

// 메타 태그 생성
async function fetchAndGenerateMeta(url) {
  try {
    const html = await axios.get(url).then(res => res.data);
    const $ = cheerio.load(html);

    // 🔽 본문 기반 콘텐츠만 추출
    const content = [
      $('h1').first().text(),
      $('h2').first().text(),
      $('article').text(),
      $('section').text(),
      $('p').slice(0, 5).text()
    ].join('\n').replace(/\s+/g, ' ').trim(); // 공백 정리

    const prompt = `
다음은 웹 페이지의 본문 내용입니다:

"${content}"

이 내용을 바탕으로 아래의 메타 정보를 한국어로 자연스럽게 생성해 주세요. 그리고 seo 태그 형식에 맞춰 작성해 주세요.:

title:
- 30자 내외
- 존재하지 않으면 "온스토리" 같은 문구로 작성
- 문장을 ""로 감싸지 말 것

keywords:
- 100자 내외
- 핵심 단어들을 나열
- 쉼표 없이 띄어쓰기로 구분
- 평점, 평점남기기, 리뷰, 후기 등은 제외

description:
- 약 100자 이내의 자연스러운 문장
- 끝에 마침표는 생략

아래 형식으로 출력해 주세요:

title: (생성된 제목)
keywords: (단어 나열)
description: (문장)
`;

    const response = await axios.post('http://localhost:11434/api/generate', {
      model: "mistral",
      prompt,
      stream: false
    });

    const result = response.data.response;
    console.log("✅ 메타태그 결과:\n", result);

    const title = truncate(extractField(result, 'title'), 100);
    const keywords = truncate(extractField(result, 'keywords'), 250);
    const description = extractField(result, 'description');

    console.log({ title, keywords, description });
    return { title, keywords, description };

  } catch (err) {
    console.error(`❌ ${url} 처리 실패:`, err.message);
    return null;
  }
}

// 전체 실행 로직
// query('SELECT id, path FROM metas WHERE path IS NOT NULL', [], async (err, result) => {
query('SELECT id, path FROM metas WHERE path IS NOT NULL and id >=398 order by id asc', [], async (err, result) => {
  if (err) return console.error(err);

  for (const row of result) {
    const rawPath = row.path;
    let url = rawPath.startsWith('/') ? rawPath : '/' + rawPath;
    url = 'https://www.onstory.fun'+url;
    console.log(`🚀 Processing: ${url}`);

    const meta = await fetchAndGenerateMeta(url);
    if (!meta) continue;

    const { title, keywords, description } = meta;

    // 최종 업데이트는 25-07-09 이고 다음에는 이 이후에 업데이트 된 것에 대해 처리
    query(
      'UPDATE metas SET title = ?, keywords = ?, description = ? WHERE id = ?',
      [title, keywords, description, row.id],
      err => {
        if (err) {
          console.error(`❌ UPDATE 실패 (id: ${row.id}):`, err.message);
        } else {
          console.log(`✅ UPDATED id: ${row.id}`);
        }
      }
    );

  }
});
