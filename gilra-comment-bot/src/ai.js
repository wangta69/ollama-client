import axios from "axios";
import { CONFIG, TAROT_CONTEXT_GUIDE } from "./config.js";

function generateAiTarotComment(tarotType) {
  console.log(
    "==========================================" +
      tarotType +
      "==========================================",
  );
  const guide = TAROT_CONTEXT_GUIDE[tarotType] || "타로 운세입니다.";
  return `- 당신은 방금 [${guide}] 점을 본 실제 유저입니다.
- 어떤 카드가 나왔을지 100가지 정도 상상해서 그 결과에 대해 감정적으로 리액션하세요. 
- 단, 너무 카드에 몰두하지는 말고 일반적인 코멘트에 감정만을 약간 섞어서 작성하세요.`;
}

export async function generateAiComment(routeName, content, params) {
  let categoryRole = "";
  const safeContent = content || {
    title: "운세 결과",
    body: "점술 결과입니다.",
  };

  if (routeName.includes("star-fortune")) {
    categoryRole = `- 당신은 연예인(${safeContent.title})의 팬입니다`;
    categoryRole += `- (${safeContent.title}) 에 대한 당신의 상식의 활용하세요 `;
  } else if (routeName.includes("tarot")) {
    const serviceKey = routeName.split(".")[2];
    const guideKey =
      serviceKey === "theme"
        ? `tarot_theme_${params.type}`
        : `tarot_${serviceKey.replace(/-/g, "_")}`;
    const guide = TAROT_CONTEXT_GUIDE[guideKey] || "타로 운세";

    categoryRole = `- 당신은 방금 [${guide}] 타로 점을 본 유저입니다. 어떤 카드를 뽑았나요?
- " 뽑은 카드에 마추어 간단한 감정적 반응을 해주세요. 너무 카드에 몰두하지는 말고 일반적인 코멘트에 감정만을 약간 섞어서 작성하세요.`;
  } else if (routeName.includes("tojeong") || routeName.includes("myungban")) {
    categoryRole = `- 당신은 본인의 운세를 확인한 유저입니다. 결과에 신기해하거나 걱정하세요.`;
  } else {
    categoryRole = `- 당신은 심리테스트 유저입니다. 친구에게 말하듯 가볍게 소감을 말하세요.`;
  }

  categoryRole += `
- 문장 시작을 다양하게 하세요.
- 매번 똑같이 "누구님 ~"으로 시작하면 절대 안 됩니다.`;

  const prompt = `당신은 한국의 20~30대 이용자입니다. 커뮤니티 말투를 사용하세요.
아래 [내용]을 읽고 아주 짧은(15~25자) 댓글 한 문장을 쓰세요. 
[내용]: ${safeContent.body}
[지침]: ${categoryRole}

1. 문장 구조를 매번 바꾸세요.
2. **절대로 이모지나 특수 기호를 사용하지 마세요.** 오직 텍스트만 사용하세요
3. 친구한테 톡 보내듯이 짧게 한마디만 하세요.`;

  console.log(`🧠 AI 프롬프트:\n${prompt}\n`);

  try {
    const response = await axios.post(CONFIG.OLLAMA_API, {
      model: CONFIG.AI_MODEL,
      prompt: prompt,
      stream: false,
      options: { temperature: 0.85 },
    });
    return response.data.response.replace(/["]/g, "").trim();
  } catch (err) {
    return null;
  }
}
