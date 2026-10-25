import { spawn } from "child_process";
import net from "net";
import axios from "axios";
import mysql from "mysql2/promise";
import "dotenv/config";

const LOCAL_TUNNEL_PORT = 33307;
const CHUNK_SIZE = 50;

function waitForPort(port, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const sock = new net.Socket();
      sock.setTimeout(1000);
      sock.on("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`SSH 터널 포트(${port}) 연결 시간 초과`));
        } else {
          setTimeout(check, 500);
        }
      });
      sock.on("timeout", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`SSH 터널 포트(${port}) 연결 시간 초과`));
        } else {
          setTimeout(check, 500);
        }
      });
      sock.connect(port, "127.0.0.1");
    };
    check();
  });
}

function startSshTunnel() {
  const plinkPath =
    process.env.PLINK_PATH || "C:/Program Files/PuTTY/plink.exe";
  const ppkPath = process.env.PPK_KEY_PATH;
  const sshUser = process.env.SSH_USER;
  const sshHost = process.env.SSH_HOST;
  const sshPort = process.env.SSH_PORT || "22";
  const dbRemotePort = process.env.DB_PORT || "3306";

  const args = [
    "-P",
    sshPort,
    "-i",
    ppkPath,
    "-N",
    "-L",
    `${LOCAL_TUNNEL_PORT}:127.0.0.1:${dbRemotePort}`,
    `${sshUser}@${sshHost}`,
    "-batch",
  ];

  console.log("🔑 [시스템] Plink를 통해 SSH 터널을 생성합니다...");
  const tunnelProcess = spawn(plinkPath, args, {
    stdio: "ignore",
    windowsHide: true,
  });
  tunnelProcess.on("error", (err) =>
    console.error("❌ Plink 실행 오류:", err.message),
  );
  return tunnelProcess;
}

async function createDbConnection() {
  return await mysql.createConnection({
    host: "127.0.0.1",
    port: LOCAL_TUNNEL_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectTimeout: 20000,
  });
}

function stripHtmlTags(text) {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function postProcessText(text) {
  if (!text) return "";
  return (
    text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[BR\]/gi, "")
      .replace(/###|##|#/g, "")
      // 혹시 남았을지 모를 프롬프트 소제목 잔재 자동 제거
      .replace(/<strong>.*?상징.*?기원.*?<\/strong>:?/gi, "")
      .replace(/<strong>.*?현실.*?운세.*?<\/strong>:?/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * 중국어/소제목 원천 차단 프롬프트
 */
function buildJsonPrompt(title, cleanInterpretation) {
  return `
당신은 한국의 정통 꿈 해몽과 심층 심리학 전문가입니다.
제공된 꿈 정보를 분석하여 사용자에게 깊은 통찰과 위안을 주는 자연스러운 한국어 해몽을 작성하세요.

[입력 데이터]
- 꿈 제목: ${title}
- 핵심 내용: ${cleanInterpretation}

[작성 규칙 - 엄격 준수]
1. [언어 제한] 반드시 오직 자연스러운 한국어로만 작성하세요. 중국어 한자(漢字)나 시스템 메타 문구는 절대 쓰지 마세요.
2. [소제목 절대 금지] "소제목", "1문단:", "상징 분석:" 같은 머리말이나 라벨을 일절 붙이지 말고 바로 부드러운 줄글로 시작하세요.
3. [필수 강조] 각 항목마다 상징어나 핵심 단어를 2개 이상 반드시 **단어** 형태로 강조 마크다운을 적용하세요.
4. [full_interpretation 필수 사항]
   - 앞선 요약(positive_point, negative_point, advice) 문장을 그대로 복사하거나 반복하지 마세요.
   - 반드시 \\n\\n 줄바꿈을 사용하여 정확히 2개의 문단으로 나누어 작성하세요.
   - 공백 포함 최소 350자 이상 500자 내외로 풍성하게 작성하세요.
5. 반드시 아래 JSON 형식으로만 응답하세요.

{
  "fortune_type": "길몽, 흉몽, 반길반흉, 심리몽 중 1개 선택",
  "positive_point": "이 꿈의 **핵심 긍정 요소**와 상징적 의미 (2문장)",
  "negative_point": "현실에서 경계해야 할 **구체적 주의점** (2문장)",
  "advice": "방문자에게 전하는 **실천적인 행동 가이드** (2문장)",
  "full_interpretation": "앞선 내용과 문장이 겹치지 않게, 상징 분석과 현실 운세를 **핵심어 강조**와 함께 2개 문단(\\n\\n)으로 깊이 있게 서술한 종합 해몽"
}
`.trim();
}

function formatRemainingTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}시간 ${m}분`;
}

/**
 * 1개 꿈 처리 (최대 3회 재시도 + 품질 검증 가드)
 */
async function processSingleDream(row, retryCount = 0) {
  const MAX_RETRIES = 3;
  const cleanInterpretation = stripHtmlTags(row.interpretation);

  try {
    const response = await axios.post(
      "http://localhost:11434/api/generate",
      {
        model: "qwen2.5:7b",
        prompt: buildJsonPrompt(row.title, cleanInterpretation),
        format: "json",
        stream: false,
        options: {
          temperature: 0.75, // 0.8보다 약간 안정적으로 조절
          repeat_penalty: 1.12, // 500 에러 및 JSON 파싱 에러 방지를 위해 살짝 완화 (1.18 -> 1.12)
          top_p: 0.9,
          num_predict: 850,
        },
      },
      { timeout: 70000 },
    );

    const rawResponse = response.data.response;

    // 1차 방어: 중국어/한자(CJK) 포함 시 즉시 폐기 및 재시도
    if (/[\u4E00-\u9FFF]/.test(rawResponse)) {
      throw new Error("중국어 한자 감지됨");
    }

    const parsedData = JSON.parse(rawResponse);
    const fortune_type = parsedData.fortune_type || "반길반흉";
    const positive_point = postProcessText(parsedData.positive_point);
    const negative_point = postProcessText(parsedData.negative_point);
    const advice = postProcessText(parsedData.advice);
    const full_interpretation = postProcessText(parsedData.full_interpretation);

    // 2차 방어: 필수 분량(최소 200자) 미달 시 폐기 및 재시도
    if (!full_interpretation || full_interpretation.length < 200) {
      throw new Error(
        `종합해석 분량 미달 (${full_interpretation ? full_interpretation.length : 0}자)`,
      );
    }

    return {
      fortune_type,
      positive_point,
      negative_point,
      advice,
      full_interpretation,
    };
  } catch (err) {
    if (retryCount < MAX_RETRIES) {
      console.warn(
        `⚠️ [ID: ${row.id}] ${err.message} 발생 -> 3초 후 재시도 (${retryCount + 1}/${MAX_RETRIES})`,
      );
      await new Promise((res) => setTimeout(res, 3000));
      return await processSingleDream(row, retryCount + 1);
    }
    throw err; // 3회 모두 실패 시 throw
  }
}

async function main() {
  let tunnelProcess = null;
  let connection = null;

  try {
    tunnelProcess = startSshTunnel();
    await waitForPort(LOCAL_TUNNEL_PORT);
    console.log(`✅ [시스템] SSH 터널 활성화 (Port: ${LOCAL_TUNNEL_PORT})`);

    connection = await createDbConnection();
    console.log("🐬 [시스템] MariaDB 연결 성공!");

    const [countResult] = await connection.query(
      `SELECT COUNT(*) as cnt FROM dreams_intermediate WHERE full_interpretation IS NULL OR full_interpretation = ''`,
    );
    const totalRemaining = countResult[0].cnt;
    console.log(
      `📊 [작업 현황] 처리 대기 데이터: 총 ${totalRemaining.toLocaleString()}건\n`,
    );

    if (totalRemaining === 0) {
      console.log("🎉 보강할 데이터가 없습니다.");
      return;
    }

    let processedCount = 0;
    const batchStartTime = Date.now();

    while (true) {
      let rows = [];
      try {
        [rows] = await connection.query(
          `SELECT id, title, interpretation 
           FROM dreams_intermediate 
           WHERE full_interpretation IS NULL OR full_interpretation = '' 
           ORDER BY id ASC 
           LIMIT ?`,
          [CHUNK_SIZE],
        );
      } catch (dbErr) {
        console.error("⚠️ DB 연결 끊김 감지. 재연결 중...", dbErr.message);
        await new Promise((res) => setTimeout(res, 5000));
        try {
          await connection.end();
        } catch (_) {}
        connection = await createDbConnection();
        continue;
      }

      if (rows.length === 0) {
        console.log("\n🎉 [완료] 모든 데이터 보강 작업이 완벽하게 끝났습니다!");
        break;
      }

      for (const row of rows) {
        const itemStart = Date.now();

        try {
          const result = await processSingleDream(row);

          // 검증을 통과한 데이터만 DB 업데이트
          await connection.execute(
            `UPDATE dreams_intermediate 
             SET fortune_type = ?,
                 positive_point = ?,
                 negative_point = ?,
                 advice = ?,
                 full_interpretation = ?,
                 updated_at = NOW() 
             WHERE id = ?`,
            [
              result.fortune_type,
              result.positive_point,
              result.negative_point,
              result.advice,
              result.full_interpretation,
              row.id,
            ],
          );

          processedCount++;
          const duration = ((Date.now() - itemStart) / 1000).toFixed(1);

          const elapsedSec = (Date.now() - batchStartTime) / 1000;
          const avgPerItem = elapsedSec / processedCount;
          const remainingSec = avgPerItem * (totalRemaining - processedCount);
          const percent = ((processedCount / totalRemaining) * 100).toFixed(2);

          console.log(
            `[${processedCount}/${totalRemaining} | ${percent}%] ID: ${row.id} 완료 (${duration}초) | 남은시간: 약 ${formatRemainingTime(remainingSec)}`,
          );
        } catch (itemErr) {
          console.error(
            `❌ [ID: ${row.id}] 최종 실패 건너뜀: ${itemErr.message}`,
          );
          await new Promise((res) => setTimeout(res, 2000));
        }
      }
    }
  } catch (err) {
    console.error("🔥 [치명적 오류]:", err);
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (_) {}
    }
    if (tunnelProcess) {
      tunnelProcess.kill();
      console.log("🔒 SSH 터널 안전 종료.");
    }
    process.exit(0);
  }
}

main();
