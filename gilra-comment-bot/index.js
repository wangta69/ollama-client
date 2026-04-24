import {
  getRandomBot,
  getRandomSummary,
  getCelebrityInfo,
  insertComment,
} from "./src/db.js";
import { resolveUrl, scrapeContent, normalizeParams } from "./src/parser.js";
import { generateAiComment } from "./src/ai.js";

async function execute(targetCategory = null) {
  const isTestMode = targetCategory !== null;
  console.log(
    `\n[${new Date().toLocaleString()}] 🚀 댓글 봇 작업 시작 (${targetCategory || "자동"})`,
  );

  try {
    const bot = await getRandomBot();

    let whereClause = "";
    if (targetCategory === "star")
      whereClause = "WHERE route_name LIKE '%star-fortune%'";
    else if (targetCategory === "tarot")
      whereClause = "WHERE route_name LIKE '%tarot%'";
    else if (targetCategory === "fortune")
      whereClause =
        "WHERE route_name NOT LIKE '%star-fortune%' AND route_name NOT LIKE '%tarot%'";

    const target = await getRandomSummary(whereClause);
    if (!bot || !target) {
      console.log("❌ 조건을 만족하는 데이터를 찾을 수 없습니다.");
      return isTestMode ? process.exit(0) : retry();
    }

    const paramsObj = normalizeParams(target.params);
    let comment = null;

    if (target.route_name.includes("star-fortune")) {
      const celeb = await getCelebrityInfo(paramsObj.celebrity);
      if (celeb)
        comment = await generateAiComment(
          target.route_name,
          { title: celeb.name, body: `${celeb.name} 연예인` },
          paramsObj,
        );
    } else if (target.route_name.includes("tarot")) {
      comment = await generateAiComment(target.route_name, null, paramsObj);
    } else {
      const url = resolveUrl(target.route_name, paramsObj);
      if (url) {
        console.log(`🔗 파싱 URL: ${url}`);
        const pageData = await scrapeContent(url);
        if (pageData)
          comment = await generateAiComment(
            target.route_name,
            pageData,
            paramsObj,
          );
      }
    }

    if (comment) {
      await insertComment({
        user_id: bot.id,
        route_name: target.route_name,
        params: target.params,
        params_hash: target.params_hash,
        content: comment,
      });
      console.log(`✅ [${bot.name}] 작성: "${comment}"`);
    }
  } catch (err) {
    console.error("🔥 실행 에러:", err.message);
  }

  if (isTestMode) process.exit(0);
  else retry();
}

function retry() {
  const next = Math.floor(Math.random() * 31 + 30);
  console.log(`⏰ 다음 작업은 ${next}분 뒤에 진행됩니다.`);
  setTimeout(() => execute(), next * 60 * 1000);
}

execute(process.argv[2] || null);
