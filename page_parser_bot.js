import axios from "axios";
import mysql from "mysql2/promise";
import * as cheerio from "cheerio";
import "dotenv/config";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

const SITE_URL = "https://www.gilra.kr"; // 실제 운영 도메인 또는 로컬 도메인

/**
 * 1. 라우트 정보를 URL로 변환
 */
function resolveUrl(routeName, paramsJson) {
  const params = JSON.parse(paramsJson || "{}");
  let path = "";

  // 마스터님의 web.php 구조에 따른 매핑
  switch (routeName) {
    case "fortune-play.star-fortune.show":
      path = `/fortune-play/star-fortune/${params.celebrity}`;
      break;
    case "fortune-play.psychology.result":
      path = `/fortune-play/psychology/${params.slug}/result`;
      // 심리테스트 결과는 type 파라미터가 필요한 경우가 많음
      if (params.type) path += `?type=${params.type}`;
      break;
    case "my-universe.myungban":
      path = `/my-universe/myungban`;
      break;
    // 추가적인 라우트 패턴들을 여기에 등록
    default:
      return null;
  }

  // 공유 모드(sm=1)를 붙여서 미들웨어 통과
  const connector = path.includes("?") ? "&" : "?";
  return `${SITE_URL}${path}${connector}sm=1`;
}

/**
 * 2. 페이지에 접속해서 주요 텍스트(운세 내용) 추출
 */
async function scrapePageContent(url) {
  try {
    const { data } = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(data);

    // 길라의 디자인 구조상 .story-body 또는 .interpretation-text에 핵심 내용이 있음
    let mainText =
      $(".story-body").text().trim() || $(".interpretation-text").text().trim();

    // 너무 길면 AI가 힘들어하므로 앞부분 500자만 추출
    return mainText.substring(0, 500).replace(/\s+/g, " ");
  } catch (err) {
    console.error(`Scraping failed for ${url}:`, err.message);
    return null;
  }
}

/**
 * 3. Ollama에게 페이지 내용을 주고 댓글 생성
 */
async function generateAiComment(scrapedText, routeName) {
  if (!scrapedText) return "와, 정말 신기하네요! 잘 보고 갑니다.";

  const prompt = `
당신은 운세 사이트 이용자입니다. 아래의 [운세 결과 내용]을 읽고, 
마치 본인이 직접 점을 본 것처럼 자연스러운 소감 한 문장을 댓글로 남기세요.

[운세 결과 내용]: ${scrapedText}

[지침]:
1. 반드시 한국어로 작성.
2. 30자 내외의 짧고 간결한 구어체 (~네요, ~함, 대박 ㅋㅋ 등).
3. 위 내용 중 구체적인 키워드(예: 성격, 재물운, 특정 카드 이름 등)를 하나 언급하여 진짜 읽은 티를 내세요.
4. 너무 공손한 말투보다는 인터넷 커뮤니티 말투를 사용하세요.
`;

  try {
    const response = await axios.post("http://localhost:11434/api/generate", {
      model: "gemma3:4b",
      prompt: prompt,
      stream: false,
      options: { temperature: 0.7 },
    });
    return response.data.response.replace(/"/g, "").trim();
  } catch (err) {
    return null;
  }
}

/**
 * 메인 실행부
 */
async function runBot() {
  try {
    // (1) 봇 유저 랜덤 선택
    const [users] = await pool.query(
      "SELECT id, name FROM users WHERE email LIKE '%@gilra.kr' ORDER BY RAND() LIMIT 1",
    );
    // (2) 대상 콘텐츠 랜덤 선택
    const [summaries] = await pool.query(
      "SELECT route_name, params FROM content_reaction_summaries ORDER BY RAND() LIMIT 1",
    );

    const target = summaries[0];
    const bot = users[0];

    // (3) URL 생성 및 파싱
    const targetUrl = resolveUrl(target.route_name, target.params);
    console.log(`🔗 분석 대상 URL: ${targetUrl}`);

    if (targetUrl) {
      const pageContent = await scrapePageContent(targetUrl);
      const comment = await generateAiComment(pageContent, target.route_name);

      if (comment) {
        // (4) DB 저장
        await pool.query(
          "INSERT INTO content_reactions (user_id, route_name, params, content, ip_address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
          [bot.id, target.route_name, target.params, comment, "127.0.0.1"],
        );
        console.log(`✅ [${bot.name}] 댓글 등록: ${comment}`);
      }
    }
  } catch (err) {
    console.error("Bot Error:", err);
  }

  // 30~60분 랜덤 대기
  const wait = Math.floor(Math.random() * (60 - 30 + 1) + 30);
  console.log(`⏰ ${wait}분 후 다시 실행합니다.`);
  setTimeout(runBot, wait * 60 * 1000);
}

runBot();
