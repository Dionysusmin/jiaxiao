/**
 * Notion API 配置（中文注释）：
 * - 注意：将密钥写在前端仅用于演示/开发环境，正式环境建议走服务端代理以保护Token安全。
 * - 本文件提供全局配置对象，供 script.js 直接读取。
 */

window.APP_CONFIG = {
  /**
   * Notion API Token（请勿泄露）：
   * - 供接口鉴权使用，将在请求头中以 Authorization: Bearer <token> 形式传递。
   * - 生产环境建议存储在服务端或环境变量中，通过后端中转。
   */
  NOTION_API_TOKEN: "ntn_b49875196459EJm3PUmI9T54UpfkqmybDzIa7b2O7vncIl",

  /**
   * 目标数据库ID（训练与考勤）：
   * - 直接用于 /v1/databases/{database_id}/query 接口查询课程数据。
   */
  DATABASE_ID: "28c12947829d81469c95d6d95b6698cd",

  /**
   * Notion API 基础URL与版本：
   * - base: API的根路径。
   * - version: Notion-Version请求头，决定接口返回结构版本。此处使用较稳定的版本。
   */
  NOTION_API_BASE_URL: "https://api.notion.com/v1",
  NOTION_API_VERSION: "2022-06-28",
};