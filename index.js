const axios = require('axios');
const cheerio = require('cheerio'); // HTML 파싱용
require('dotenv').config();
const mysql = require('mysql');
const pool = mysql.createPool(
  {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'db_user',
    password: process.env.DB_PASSWORD || 'db_password',
    database: process.env.DB_DATABASE || 'database',
    multipleStatements: true
  }); // [실서버용]

async function fetchAndGenerateMeta(url) {
  const html = await axios.get(url).then(res => res.data);
  const $ = cheerio.load(html);

  const content = [
    $('title').text(),
    $('meta[name="description"]').attr('content') || '',
    $('h1').first().text(),
    $('p').slice(0, 3).text()
  ].join('\n');

  const prompt = `
다음은 웹 페이지 내용입니다.

"${content}"

위 내용을 바탕으로 다음을 생성해 주세요, 되도록 한글로 표현해줘:

- title (30자 이내)
- keywords (쉼표로 구분된 단어)
- description (자연스럽고 명확한 100자 이내 문장)
`;

  const response = await axios.post('http://localhost:11434/api/generate', {
    model: "mistral",
    prompt,
    stream: false
  });

  console.log("✅ 메타태그 결과:\n", response.data.response);
}



fetchAndGenerateMeta('https://www.onstory.fun/doc/programming/angular/http-interceptor')