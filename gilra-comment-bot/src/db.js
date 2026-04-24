import mysql from "mysql2/promise";
import "dotenv/config";
import { CONFIG } from "./config.js";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 3306,
});

export async function getRandomBot() {
  const [rows] = await pool.query(
    `SELECT id, name FROM ${CONFIG.DB_MAIN}.users WHERE email LIKE '%@gilra.kr' ORDER BY RAND() LIMIT 1`,
  );
  return rows[0];
}

export async function getRandomSummary(whereClause) {
  const [rows] = await pool.query(
    `SELECT route_name, params, params_hash FROM ${CONFIG.DB_MAIN}.content_reaction_summaries ${whereClause} ORDER BY RAND() LIMIT 1`,
  );
  return rows[0];
}

export async function getCelebrityInfo(id) {
  const [rows] = await pool.query(
    `SELECT name, job_title FROM ${CONFIG.DB_MAIN}.celebrities WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0];
}

export async function insertComment(data) {
  return await pool.query(
    `INSERT INTO ${CONFIG.DB_MAIN}.content_reactions (user_id, route_name, params, params_hash, content, ip_address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      data.user_id,
      data.route_name,
      data.params,
      data.params_hash,
      data.content,
      "127.0.0.1",
    ],
  );
}

// [추가] 심리테스트 제목 가져오기
export async function getPsychTestInfo(slug) {
  const [rows] = await pool.query(
    `SELECT title FROM ${CONFIG.DB_MAIN}.psych_tests WHERE slug = ? LIMIT 1`,
    [slug],
  );
  return rows[0];
}
