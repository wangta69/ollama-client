import axios from "axios";
import mysql from "mysql2/promise";
import crypto from "crypto";
import * as cheerio from "cheerio";
import "dotenv/config";

// --- [설정 영역] ---
const SITE_URL = "https://www.gilra.kr";
const OLLAMA_API = "http://localhost:11434/api/generate";
const AI_MODEL = "gemma3:4b";

const DB_MAIN = "db_saju_onstory";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 3306,
});

/**
 * 타로 카테고리별 AI 설명 가이드 (AI가 상황을 인지하도록 돕는 용도)
 */
const TAROT_CONTEXT_GUIDE = {
  tarot_today: "오늘의 운세입니다. 하루의 전반적인 기운을 봅니다.",
  tarot_yesno: "어떤 고민에 대해 할지 말지(Yes or No) 결론을 내는 점입니다.",
  tarot_theme_love: "연애운입니다. 솔로 탈출이나 썸, 연인 관계를 봅니다.",
  tarot_theme_money: "금전운입니다. 돈의 흐름이나 횡재수 등을 봅니다.",
  tarot_theme_work: "직업운입니다. 취업, 이직, 승진 등 커리어를 봅니다.",
  tarot_soul: "오늘 나에게 필요한 힐링과 조언, 소울 메시지를 듣는 점입니다.",
  tarot_timing: '그 일이 "언제" 일어날지 시기를 예측하는 점입니다.',
  tarot_inner_thoughts:
    "상대방이 나를 어떻게 생각하는지 속마음을 엿보는 점입니다.",
  tarot_counseling: "과거-현재-미래를 순서대로 짚어보는 심층 상담입니다.",
  tarot_choice: "A와 B 두 가지 선택지 중 무엇이 더 나을지 고르는 점입니다.",
};

/**
 * [신규] 연예인 정보 DB에서 직접 가져오기
 */
async function getCelebrityInfo(celebId) {
  try {
    const [rows] = await pool.query(
      `SELECT name, job_title FROM ${DB_MAIN}.celebrities WHERE id = ? LIMIT 1`,
      [celebId],
    );
    return rows.length ? rows[0] : null;
  } catch (err) {
    console.error("Celebrity DB Error:", err.message);
    return null;
  }
}

/**
 * 1. URL 리졸버: 라우트와 파라미터로 접속 가능한 주소 생성
 */
function resolveUrl(routeName, paramsJson) {
  let params =
    typeof paramsJson === "string" ? JSON.parse(paramsJson) : paramsJson;
  let path = "";

  switch (routeName) {
    case "fortune-play.star-fortune.show":
      path = `/fortune-play/star-fortune/${params.celebrity}`;
      break;
    case "fortune-play.star-fortune.chemistry": // [추가] 궁합 경로
      path = `/fortune-play/star-fortune/${params.celebrity}/chemistry`;
      break;
    case "fortune-play.psychology.result":
      path = `/fortune-play/psychology/${params.slug}/result`;
      if (params.type) path += `?type=${params.type}`;
      break;
    case "time-flow.tojeong":
      path = `/time-flow/tojeong/${params.year || "2026"}`;
      break;
    case "my-universe.myungban":
      path = `/my-universe/myungban`;
      break;
    case "master-hub.tarot.today.result":
      path = `/master-hub/tarot/today/result/${params.token || ""}`;
      break;
    case "master-hub.tarot.yes-no.result":
      path = `/master-hub/tarot/yes-no/result/${params.token || ""}`;
      break;
    case "master-hub.tarot.theme.result":
      path = `/master-hub/tarot/theme/${params.type}/result/${params.token || ""}`;
      break;
    default:
      return null;
  }
  const connector = path.includes("?") ? "&" : "?";
  return `${SITE_URL}${path}${connector}sm=1`;
}

/**
 * 2. 페이지 본문 파싱
 */
async function scrapeContent(url) {
  try {
    const { data } = await axios.get(url, { timeout: 15000 });
    const $ = cheerio.load(data);
    let title = $("h1, h2.story-title, .page-header h1").first().text().trim();
    let body = $(
      ".story-body, .interpretation-text, .verse-ko, .soul-text, .description-text",
    )
      .text()
      .trim();
    return {
      title: title || "운세 결과",
      body: body.substring(0, 700).replace(/\s+/g, " "),
    };
  } catch (err) {
    return null;
  }
}

function generateAiTarotComment(tarotType) {
  console.log(`🔮 타로 카테고리 감지: [${tarotType}]`);
  const guide = TAROT_CONTEXT_GUIDE[tarotType] || "타로 운세입니다.";

  // AI에게 상황만 던져주고, 어떤 카드를 뽑았을지 스스로 가정하게 만듭니다.
  let role = `- 당신은 방금 [${guide}] 점을 본 실제 유저입니다.`;
  role += `\n- 어떤 카드가 나왔을지 100가지 정도 상상해서 그 결과에 대해 감정적으로 리액션하세요. 단, 너무 카드에 몰두하지는 말고 일반적인 코멘트에 감정만을 약간 섞어서 작성하세요.`;

  return role;
}
/**
 * 3. AI 댓글 생성 (페르소나 강화)
 */
async function generateAiComment(routeName, content, params) {
  let categoryRole = "";
  const safeContent = content || {
    title: "운세 결과",
    body: "타로 점술 결과입니다.",
  };

  if (routeName.includes("star-fortune")) {
    categoryRole = `- 당신은 연예인(${safeContent.title})의 팬입니다. 선배(선배님)라는 표현 금지, 제3자 입장에서 응원하세요. "내 사주" 금지. 배우의 이름도 가급적 언급하지 말고 그냥 펜으로서 감탄과 걱정, 응원을 표현하세요.`;
  } else if (routeName.includes("tarot")) {
    // 마스터님 요청대로 tarotInfo 없이 카테고리 정보만 전달
    categoryRole = generateAiTarotComment(params.type);
  } else if (routeName.includes("tojeong") || routeName.includes("myungban")) {
    categoryRole = `- 당신은 본인의 운세를 확인한 유저입니다. 결과 내용에 대해 신기해하거나 걱정하세요.`;
  } else {
    categoryRole = `- 당신은 심리테스트 유저입니다. 친구에게 말하듯 가볍고 친근하게 소감을 말하세요.`;
  }

  const prompt = `
당신은 한국의 20대 여성 이용자입니다. 커뮤니티에 댓글을 남기는 말투를 사용하세요.
아래 [내용]을 읽고 아주 짧은(15~25자) 댓글 한 문장을 쓰세요.
절대 이모지, 이모티콘은   사용하지 말아주세요.
[내용]: ${safeContent.body}
[지침]:
${categoryRole}

- 분석하지 말고 감정을 표현하세요.
`;

  try {
    const response = await axios.post(OLLAMA_API, {
      model: AI_MODEL,
      prompt: prompt,
      stream: false,
      options: { temperature: 0.85 },
    });
    return response.data.response.replace(/["]/g, "").trim();
  } catch (err) {
    return null;
  }
}

/**
 * 4. 핵심 실행 엔진
 */
async function execute(targetCategory = null) {
  const isTestMode = targetCategory !== null;
  console.log(
    `\n[${new Date().toLocaleString()}] 🚀 작업 시작 (모드: ${isTestMode ? "테스트-" + targetCategory : "자동 루프"})`,
  );

  try {
    // (1) 봇 유저 랜덤 선택
    const [users] = await pool.query(
      `SELECT id, name FROM ${DB_MAIN}.users WHERE email LIKE '%@gilra.kr' ORDER BY RAND() LIMIT 1`,
    );

    // (2) 대상 카테고리 필터링
    let whereClause = "";
    if (targetCategory === "star")
      whereClause = "WHERE route_name LIKE '%star-fortune%'";
    else if (targetCategory === "tarot")
      whereClause = "WHERE route_name LIKE '%tarot%'";
    else if (targetCategory === "fortune")
      whereClause =
        "WHERE route_name NOT LIKE '%star-fortune%' AND route_name NOT LIKE '%tarot%'";

    const [summaries] = await pool.query(
      `SELECT route_name, params, params_hash FROM ${DB_MAIN}.content_reaction_summaries ${whereClause} ORDER BY RAND() LIMIT 1`,
    );

    if (!users.length || !summaries.length) {
      console.log("❌ 조건을 만족하는 데이터를 DB에서 찾을 수 없습니다.");
      return isTestMode ? process.exit(0) : retry();
    }

    const bot = users[0];
    const target = summaries[0];
    const currentHash = target.params_hash;

    // 파라미터 정제 (문자열인 경우 객체로 변환)
    const paramsObj =
      typeof target.params === "string"
        ? JSON.parse(target.params)
        : target.params;

    let comment = null;
    let pageData = null;

    // --- [분기 처리 핵심] ---
    if (target.route_name.includes("star-fortune")) {
      // 연예인: DB에서 정보 로드
      const celebInfo = await getCelebrityInfo(paramsObj.celebrity);
      if (celebInfo) {
        console.log(`⭐ 스타 감지: [${celebInfo.name}]`);
        comment = await generateAiComment(
          target.route_name,
          {
            title: celebInfo.name,
            body: `${celebInfo.name}(${celebInfo.job_title}) 스타 사주 분석 내용`,
          },
          paramsObj,
        );
      }
    } else if (target.route_name.includes("tarot")) {
      // 1. 타로: 페이지를 긁지 않고 바로 AI에게 넘김 (paramsObj 사용)
      console.log(`🔮 타로 카테고리 감지: [${paramsObj.type || "일반"}]`);
      comment = await generateAiComment(target.route_name, null, paramsObj);
    } else {
      // 2. 그 외(스타/운세): 기존처럼 페이지 파싱 진행
      const targetUrl = resolveUrl(target.route_name, paramsObj);
      if (!targetUrl) {
        console.log(`⚠️ URL 매핑 실패: ${target.route_name}`);
        return isTestMode ? process.exit(0) : retry();
      }

      console.log(`🔗 분석 대상 URL: ${targetUrl}`);
      pageData = await scrapeContent(targetUrl);

      if (!pageData) {
        console.log("⚠️ 페이지 본문을 읽어오지 못했습니다. (스킵)");
        return isTestMode ? process.exit(0) : retry();
      }
      comment = await generateAiComment(target.route_name, pageData, paramsObj);
    }

    // (3) DB 저장
    if (comment) {
      await pool.query(
        `INSERT INTO ${DB_MAIN}.content_reactions 
                (user_id, route_name, params, params_hash, content, ip_address, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          bot.id,
          target.route_name,
          target.params,
          currentHash,
          comment,
          "127.0.0.1",
        ],
      );
      console.log(`✅ [${bot.name}] 작성 성공: "${comment}"`);
      if (!target.route_name.includes("tarot")) {
        console.log(
          `📍 주소 확인: ${resolveUrl(target.route_name, paramsObj).split("?sm=1")[0]}`,
        );
      }
    } else {
      console.log("⚠️ AI가 댓글 생성에 실패했습니다.");
    }
  } catch (err) {
    console.error("🔥 실행 중 에러 발생:", err.message);
  }

  if (isTestMode) {
    console.log("\n✨ 테스트 실행 완료. 프로그램을 종료합니다.");
    process.exit(0);
  } else {
    retry();
  }
}
function retry() {
  const next = Math.floor(Math.random() * (60 - 30 + 1) + 30);
  console.log(`⏰ 다음 작업은 ${next}분 뒤에 진행됩니다.`);
  setTimeout(() => execute(), next * 60 * 1000);
}

// --- [실행 제어] ---
const categoryInput = process.argv[2]; // 터미널 인자 받기

if (categoryInput) {
  // 인자가 있으면 (star, tarot, fortune) 해당 카테고리만 한 번 실행
  execute(categoryInput);
} else {
  // 인자가 없으면 기존처럼 30~60분 간격 무한 루프
  execute();
}

function normalizeParams(paramsJson) {
  if (!paramsJson) return {};
  // 문자열이면 파싱, 이미 객체면 그대로 사용
  let params =
    typeof paramsJson === "string" ? JSON.parse(paramsJson) : paramsJson;

  // celebrity 값이 있으면 강제로 정수형(Int) 변환
  if (params.celebrity !== undefined) {
    params.celebrity = parseInt(params.celebrity, 10);
  }

  return params;
}

/**
 * 라라벨의 해시 생성 로직과 100% 일치하도록 구현
 */
function generateParamsHash(params) {
  if (!params || params === "null" || params === "{}" || params === "[]") {
    return crypto.createHash("md5").update("{}").digest("hex");
  }
  let paramsObj = typeof params === "string" ? JSON.parse(params) : params;

  // 키 정렬 (PHP의 ksort)
  const sortedKeys = Object.keys(paramsObj).sort();
  const sortedObj = {};
  sortedKeys.forEach((key) => {
    sortedObj[key] = paramsObj[key];
  });

  // 공백 제거 및 MD5 생성
  const normalized = JSON.stringify(sortedObj).replace(/\s/g, "");
  return crypto.createHash("md5").update(normalized).digest("hex");
}

/**
 * 연예인 멘트 확인:
node gilra_comment_bot.js star
타로 결과 멘트 확인:
node gilra_comment_bot.js tarot
일반 운세/심테 멘트 확인:
node gilra_comment_bot.js fortune
그냥 평소처럼 자동화 돌리기 (30분~1시간 간격):
node gilra_comment_bot.js
 */
