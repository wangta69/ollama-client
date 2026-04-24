import axios from "axios";
import * as cheerio from "cheerio";
import { CONFIG } from "./config.js";

export function resolveUrl(routeName, params) {
  let path = "";
  switch (routeName) {
    case "fortune-play.star-fortune.show":
      path = `/fortune-play/star-fortune/${params.celebrity}`;
      break;
    case "fortune-play.star-fortune.chemistry":
      path = `/fortune-play/star-fortune/${params.celebrity}/chemistry`;
      break;
    case "fortune-play.psychology.result":
      path = `/fortune-play/psychology/${params.slug}/result${params.type ? "?type=" + params.type : ""}`;
      break;
    case "time-flow.tojeong":
      path = `/time-flow/tojeong/${params.year || "2026"}`;
      break;
    case "my-universe.myungban":
      path = `/my-universe/myungban`;
      break;
    case "master-hub.tarot.today.result":
    case "master-hub.tarot.yes-no.result":
    case "master-hub.tarot.theme.result":
      path = `/master-hub/tarot/${routeName.split(".")[2]}/result/${params.token || ""}`;
      break;
    default:
      return null;
  }
  return `${CONFIG.SITE_URL}${path}${path.includes("?") ? "&" : "?"}sm=1`;
}

export async function scrapeContent(url) {
  try {
    const { data } = await axios.get(url, { timeout: 10000 });
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

export function normalizeParams(paramsJson) {
  if (!paramsJson) return {};
  let params =
    typeof paramsJson === "string" ? JSON.parse(paramsJson) : paramsJson;
  if (params.celebrity !== undefined)
    params.celebrity = parseInt(params.celebrity, 10);
  return params;
}
