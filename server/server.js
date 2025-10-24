/**
 * Notion API 代理服务（中文注释）
 * - 背景：前端H5直接调用Notion API会遇到CORS限制，因此通过Express后端代理。
 * - 功能：提供 /api/courses 接口，读取数据库并返回前端所需的精简字段；并提供 /health 健康检查。
 * - 安全：Token应在生产环境以环境变量方式存储，这里仅为演示加入默认值。
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3000; // 要求运行在3000端口

// 允许跨域（默认允许所有来源；生产可按需限制）
app.use(cors());

// 解析JSON请求体（尽管当前仅用到Notion的代理转发）
app.use(express.json());

/**
 * Notion 配置（优先读取环境变量，其次使用演示默认值）
 */
const NOTION_API_TOKEN = process.env.NOTION_API_TOKEN || 'ntn_b49875196459EJm3PUmI9T54UpfkqmybDzIa7b2O7vncIl';
const DATABASE_ID = process.env.NOTION_DATABASE_ID || '28c12947829d81469c95d6d95b6698cd';
const NOTION_API_BASE_URL = process.env.NOTION_API_BASE_URL || 'https://api.notion.com/v1';
const NOTION_API_VERSION = process.env.NOTION_API_VERSION || '2022-06-28';

/**
 * 健康检查：用于确认服务存活
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/**
 * 辅助：读取通用文本属性（兼容常见类型）
 */
function readPropertyText(props, key) {
  const p = props?.[key];
  if (!p || !p.type) return '';

  switch (p.type) {
    case 'title':
      return (p.title || []).map(t => t.plain_text || '').filter(Boolean).join('');
    case 'rich_text':
      return (p.rich_text || []).map(t => t.plain_text || '').filter(Boolean).join('');
    case 'select':
      return p.select?.name || '';
    case 'multi_select':
      return (p.multi_select || []).map(s => s.name).filter(Boolean).join('、');
    case 'date': {
      const d = p.date || {};
      return { start: d.start || null, end: d.end || null };
    }
    case 'people': {
      const list = p.people || [];
      return list.length ? `${list.length}位老师` : '';
    }
    case 'relation': {
      const list = p.relation || [];
      return list.length ? `${list.length}个班级` : '';
    }
    default:
      return '';
  }
}

/**
 * 读取数值/百分比属性：兼容 number、rollup、formula 以及富文本中的百分数字符串
 */
function readNumberLike(props, key) {
  const p = props?.[key];
  if (!p || !p.type) return null;
  switch (p.type) {
    case 'number':
      return typeof p.number === 'number' ? p.number : null;
    case 'rollup':
      // rollup 可能是数字；若是数组或其他类型，可根据需要扩展
      return typeof p.rollup?.number === 'number' ? p.rollup.number : null;
    case 'formula':
      return typeof p.formula?.number === 'number' ? p.formula.number : null;
    case 'rich_text': {
      const txt = (p.rich_text || []).map(t => t.plain_text || '').join('');
      if (!txt) return null;
      const m = txt.match(/([0-9]+(?:\.[0-9]+)?)%/);
      if (m) return parseFloat(m[1]);
      const n = parseFloat(txt);
      return isNaN(n) ? null : n;
    }
    default:
      return null;
  }
}

/**
 * /api/courses：查询Notion数据库并返回精简数据
 * 返回字段（前端需要）：name, dateStart, dateEnd, teacher, room, clazz, status
 * - room：此处用“关联班级”名称串做占位；如数据库有真实“教室”字段，可替换为该字段
 * - clazz：与room同值，便于兼容现有前端render逻辑（若使用“班级”）
 */
app.get('/api/courses', async (req, res) => {
  try {
    const url = `${NOTION_API_BASE_URL}/databases/${DATABASE_ID}/query`;
    const notionRes = await axios.post(url, {
      // 恢复默认分页大小，避免一次抓取过多
      page_size: 50,
      // 按“日期”字段升序排序，便于前端直接使用
      sorts: [
        { property: '日期', direction: 'ascending' }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${NOTION_API_TOKEN}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json',
      },
    });

    const results = notionRes.data?.results || [];
    console.log('[Notion] 查询结果数量:', results.length);
    if (results[0]?.properties) {
      console.log('[Notion] 示例属性键:', Object.keys(results[0].properties));
    }

    const courses = results.map(page => {
      const props = page.properties || {};
      const title = readPropertyText(props, '课程主题/日期') || readPropertyText(props, '课程主题') || readPropertyText(props, '名称');
      const teacher = readPropertyText(props, '老师');
      const clazzText = readPropertyText(props, '关联班级');
      // 精确映射（按你的Notion字段）：课程状态、出勤率、日期
      const status = props['课程状态']?.status?.name || '';
      const attendance = (typeof props['出勤率']?.formula?.number === 'number') ? props['出勤率'].formula.number : null;

      // 计算课程时长（分钟）
      const startISO = props['日期']?.date?.start || null;
      const endISO = props['日期']?.date?.end || null;
      let durationMinutes = null;
      if (startISO && endISO) {
        const start = new Date(startISO);
        const end = new Date(endISO);
        const diff = Math.max(0, end - start);
        durationMinutes = Math.round(diff / 60000);
      }

      // room使用关联班级名称串作为占位（若你有“教室”字段可改为该字段）
      const room = clazzText || '';

      const course = {
        name: title || '未命名课程',
        dateStart: startISO,
        dateEnd: endISO,
        teacher: teacher || '未指定老师',
        room,              // 作为教室占位
        clazz: room,       // 同步提供clazz以兼容前端“班级”展示
        status: status || '',
        durationMinutes,   // 新增：课程时长（分钟）
        attendanceRate: attendance, // 新增：出勤率（可能是百分比或0-1，需要前端格式化）
      };

      return course;
    });

    console.log('[Courses] 映射后数量:', courses.length);
    console.log('[Courses] 前2项预览:', courses.slice(0, 2));

    res.json({ ok: true, data: courses });
  } catch (err) {
    console.error('Notion代理错误:', err?.response?.data || err?.message || err);
    const code = err?.response?.status || 500;
    const detail = err?.response?.data || err?.message || '未知错误';
    res.status(code).json({ ok: false, error: `代理请求失败(${code})`, detail });
  }
});

// 启动服务
app.listen(PORT, () => {
  console.log(`Notion代理服务器已启动：http://localhost:${PORT}`);
});