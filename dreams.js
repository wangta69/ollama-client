import axios from "axios";
import mysql from "mysql";
import "dotenv/config";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER || "db_user",
  password: process.env.DB_PASSWORD || "db_password",
  database: process.env.DB_DATABASE || "database",
  port: process.env.DB_PORT || "3306",
  connectionLimit: 10,
});

const query = (sql, params) =>
  new Promise((res, rej) => {
    pool.query(sql, params, (err, results) => (err ? rej(err) : res(results)));
  });

/**
 * 라라벨 nl2br 최적화 포맷팅 함수
 * 1. **강조** -> <strong>강조</strong>
 * 2. [BR] 기호가 혹시 있으면 삭제
 * 3. 연속된 줄바꿈(3개 이상)을 딱 2개(\n\n)로 표준화
 */
function formatForLaravel(text) {
  if (!text) return "";

  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // 강조 처리
    .replace(/\[BR\]/gi, "") // 혹시 남은 [BR] 제거
    .replace(/###|##|#/g, "") // 마크다운 제목 제거
    .replace(/\n{3,}/g, "\n\n") // 3개 이상의 줄바꿈은 2개로 축소
    .trim();
}

async function startBatchProcess() {
  try {
    const rows = await query(
      "SELECT id, title, interpretation FROM dreams_intermediate WHERE full_interpretation IS NULL OR full_interpretation = '' LIMIT 15000",
    );

    if (rows.length === 0) {
      console.log("✨ 모든 데이터 보강 완료");
      process.exit(0);
    }

    console.log(`🚀 ${rows.length}개의 데이터를 처리합니다.`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const startTime = Date.now();

      // 프롬프트를 더 단순하고 명확하게 수정
      const prompt = `
당신은 전문 꿈 해몽가입니다. 다음 정보를 바탕으로 풍성한 해몽을 작성하세요.

[지침]
1. 내용을 2~3개의 의미 있는 단락으로 구성하세요.
2. 번호(1., 2.)나 소제목은 절대 쓰지 마세요.
3. 중요 키워드는 **강조** 처리하세요.
4. 전체 분량은 한국어 400자 내외로 작성하세요.

[꿈 제목]: ${row.title}
[기존 짧은 해석]: ${row.interpretation}
`;

      try {
        const response = await axios.post(
          "http://localhost:11434/api/generate",
          {
            model: "gemma3:4b",
            prompt: prompt,
            stream: false,
            options: {
              temperature: 0.6, // 약간의 창의성을 위해 살짝 높임
              num_predict: 800,
            },
          },
          { timeout: 60000 },
        );

        const rawAiResponse = response.data.response;

        // 가공 (줄바꿈 정규화 및 강조 처리)
        const finalContent = formatForLaravel(rawAiResponse);

        // DB 업데이트
        await query(
          "UPDATE dreams_intermediate SET full_interpretation = ?, updated_at = NOW() WHERE id = ?",
          [finalContent, row.id],
        );

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(
          `[${i + 1}/${rows.length}] ID: ${row.id} ✅ 완료 (${duration}초)`,
        );
      } catch (err) {
        console.error(`❌ ID: ${row.id} 에러:`, err.message);
        await new Promise((res) => setTimeout(res, 2000));
      }
    }

    console.log("\n✅ 배치 작업 완료");
    process.exit(0);
  } catch (err) {
    console.error("🔥 오류:", err);
    process.exit(1);
  }
}

startBatchProcess();
