/**
 * 家长端课表前端逻辑（通过Node代理调用Notion）
 * - 目标：调用 http://localhost:3000/api/courses 获取课程数据，避免前端直连Notion导致CORS问题。
 * - 保持 renderSchedule() 函数不变；仅替换数据来源与日期格式化。
 * - 交互体验：移动端友好，包含加载状态与友好错误提示。
 */

/**
 * DOM辅助
 */
function $(id) {
  return document.getElementById(id);
}

/**
 * 加载与错误提示
 */
function showLoading(text = "正在加载课程…") {
  const el = $("loading");
  if (el) {
    el.textContent = text;
    el.style.display = "block";
  }
}
function hideLoading() {
  const el = $("loading");
  if (el) el.style.display = "none";
}
function showError(message = "加载失败，请稍后重试") {
  const el = $("error");
  if (el) {
    el.textContent = message;
    el.style.display = "block";
  }
}
function hideError() {
  const el = $("error");
  if (el) el.style.display = "none";
}

/**
 * 渲染课表卡片（保持不变）
 * @param {Array} classes - 课程数组，每项包含 name(课程主题), datetime(日期), teacher(老师), clazz(关联班级/教室)
 */
function renderSchedule(classes) {
  const container = $("schedule");
  if (!container) return;
  container.innerHTML = "";

  if (!classes || classes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "本周暂无课程";
    container.appendChild(empty);
    return;
  }

  classes.forEach((item) => {
    const card = document.createElement("section");
    card.className = "class-card";

    // 左侧：课程主题 + 日期
    const left = document.createElement("div");
    left.className = "card-left";

    // 状态标签：根据课程状态显示不同颜色
    if (item.status) {
      const statusBadge = document.createElement("span");
      statusBadge.className = `status-badge ${mapStatusToClass(item.status)}`;
      statusBadge.textContent = item.status;
      left.appendChild(statusBadge);
    }

    const nameEl = document.createElement("div");
    nameEl.className = "course-name";
    nameEl.textContent = item.name || "未命名课程";

    const timeEl = document.createElement("div");
    timeEl.className = "course-datetime";
    const durationText = typeof item.durationMinutes === "number" && item.durationMinutes > 0
      ? ` · ${item.durationMinutes}分钟`
      : "";
    timeEl.textContent = (item.datetime || "未设置时间") + durationText;

    left.appendChild(nameEl);
    left.appendChild(timeEl);

    // 右侧：老师 + 班级（或教室）
    const right = document.createElement("div");
    right.className = "card-right";

    const teacherMeta = document.createElement("div");
    teacherMeta.className = "meta";
    const teacherLabel = document.createElement("span");
    teacherLabel.className = "meta-label";
    teacherLabel.textContent = "老师";
    const teacherValue = document.createElement("span");
    teacherValue.className = "meta-value";
    teacherValue.textContent = item.teacher || "未指定老师";
    teacherMeta.appendChild(teacherLabel);
    teacherMeta.appendChild(teacherValue);

    const classMeta = document.createElement("div");
    classMeta.className = "meta";
    const classLabel = document.createElement("span");
    classLabel.className = "meta-label";
    classLabel.textContent = "班级"; // 若你更偏好显示教室，可将文案改为“教室”
    const classValue = document.createElement("span");
    classValue.className = "meta-value";
    classValue.textContent = item.clazz || "未关联班级";
    classMeta.appendChild(classLabel);
    classMeta.appendChild(classValue);

    right.appendChild(teacherMeta);
    right.appendChild(classMeta);

    // 出勤率：显示在卡片右下角（存在时）
    if (typeof item.attendanceRate === "number") {
      const att = document.createElement("div");
      att.className = "attendance-badge";
      att.textContent = formatAttendance(item.attendanceRate);
      card.appendChild(att);
    }

    card.appendChild(left);
    card.appendChild(right);
    container.appendChild(card);
  });
}

/**
 * 日期格式化：转为“周X HH:MM”或“周X HH:MM - HH:MM”
 * @param {string|null} startISO 开始时间ISO字符串
 * @param {string|null} endISO 结束时间ISO字符串
 */
function formatWeekTime(startISO, endISO) {
  if (!startISO) return "未设置时间";
  const weekMap = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const pad = (n) => String(n).padStart(2, "0");

  const start = new Date(startISO);
  const week = weekMap[start.getDay()];
  const startStr = `${week} ${pad(start.getHours())}:${pad(start.getMinutes())}`;

  if (!endISO) return startStr;
  const end = new Date(endISO);
  const endStr = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
  return `${startStr} - ${endStr}`;
}

/**
 * 从代理API获取课程数据，并转换为渲染所需格式
 * - 接口：GET http://localhost:3000/api/courses
 * - 返回：{ ok: true, data: [ { name, dateStart, dateEnd, teacher, room, clazz, status } ] }
 */
async function fetchCoursesFromAPI() {
  const url = "http://localhost:3000/api/courses";
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`代理接口错误(${res.status}): ${text}`);
  }
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || "接口返回失败");
  }

  // 转换为renderSchedule需要的字段：name, datetime, teacher, clazz + 新增状态/时长/出勤率
  return (json.data || []).map((item) => ({
    name: item.name || "未命名课程",
    datetime: formatWeekTime(item.dateStart, item.dateEnd),
    teacher: item.teacher || "未指定老师",
    clazz: item.clazz || item.room || "未关联班级",
    status: item.status || "",
    durationMinutes: typeof item.durationMinutes === 'number' ? item.durationMinutes : null,
    attendanceRate: typeof item.attendanceRate === 'number' ? item.attendanceRate : null,
    dateStart: item.dateStart || null,
    dateEnd: item.dateEnd || null,
  }));
}

// 计算本周/下周的起止范围（周一开始，周日结束）
function getWeekRange(offset = 0) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (d.getDay() + 6) % 7; // 0=周一, ..., 6=周日
  const monday = new Date(d);
  monday.setDate(d.getDate() - day + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

// 新增：统一将日期（纯日期或ISO带时区）转换为本地时间戳
function isDateOnlyString(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function toLocalStartOfDayTs(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}
function toLocalEndOfDayTs(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}
function normalizeToTimestamp(input, asEnd = false) {
  if (!input) return null;
  if (isDateOnlyString(input)) {
    return asEnd ? toLocalEndOfDayTs(input) : toLocalStartOfDayTs(input);
  }
  const t = new Date(input).getTime();
  return Number.isFinite(t) ? t : null;
}
function getWeekRangeTs(offset = 0) {
  const { start, end } = getWeekRange(offset);
  return { startTs: start.getTime(), endTs: end.getTime() };
}

// 替换：使用时间戳比较判断重叠
function overlapsTs(aStartTs, aEndTs, bStartTs, bEndTs) {
  const s = aStartTs;
  const e = aEndTs ?? aStartTs; // 无结束时间则按瞬时事件处理
  return s <= bEndTs && e >= bStartTs;
}

// 替换：过滤指定周内课程（基于时间戳）
function filterByWeek(list, offset = 0) {
  const { startTs, endTs } = getWeekRangeTs(offset);
  return (list || []).filter(item => {
    const s = normalizeToTimestamp(item?.dateStart, false);
    if (s == null) return false;
    const hasEnd = !!item?.dateEnd;
    const e = normalizeToTimestamp(item?.dateEnd || null, hasEnd);
    return overlapsTs(s, e, startTs, endTs);
  });
}

function setPageTitle(which) {
  const title = document.querySelector('.page-title');
  if (title) {
    title.textContent = which === 'next' ? '下周课表' : '本周课表';
  }
}

// 新增：确保周标签上存在计数徽标元素
function ensureTabCountElements() {
  const currentBtn = document.querySelector('.week-tab[data-week="current"]');
  const nextBtn = document.querySelector('.week-tab[data-week="next"]');
  if (currentBtn && !currentBtn.querySelector('.tab-count')) {
    const span = document.createElement('span');
    span.className = 'tab-count';
    span.textContent = '0';
    currentBtn.appendChild(span);
  }
  if (nextBtn && !nextBtn.querySelector('.tab-count')) {
    const span = document.createElement('span');
    span.className = 'tab-count';
    span.textContent = '0';
    nextBtn.appendChild(span);
  }
}

function updateWeekCounts() {
  const list = window.ALL_CLASSES || [];
  const currentCount = filterByWeek(list, 0).length;
  const nextCount = filterByWeek(list, 1).length;

  const currentBtn = document.querySelector('.week-tab[data-week="current"]');
  const nextBtn = document.querySelector('.week-tab[data-week="next"]');
  const currentEl = currentBtn?.querySelector('.tab-count');
  const nextEl = nextBtn?.querySelector('.tab-count');

  if (currentEl) {
    currentEl.textContent = String(currentCount);
    currentEl.style.display = currentCount === 0 ? 'none' : '';
  }
  if (nextEl) {
    nextEl.textContent = String(nextCount);
    nextEl.style.display = nextCount === 0 ? 'none' : '';
  }

  if (currentBtn) currentBtn.setAttribute('aria-label', `本周（${currentCount}节课）`);
  if (nextBtn) nextBtn.setAttribute('aria-label', `下周（${nextCount}节课）`);

  console.log('[周标签计数]', { 本周: currentCount, 下周: nextCount });
}

// 在渲染完成或数据更新后调用
function renderCoursesByWeek(weekType) {
  const offset = weekType === 'next' ? 1 : 0;
  const list = window.ALL_CLASSES || [];
  const filtered = filterByWeek(list, offset);
  console.log('[周切换] weekType=', weekType, 'offset=', offset, '原始条数=', list.length, '过滤后=', filtered.length);

  const container = $("schedule");
  if (!container) return;
  container.classList.add('is-fading');
  setTimeout(() => {
    if (filtered.length === 0) {
      renderEmptyState(weekType);
    } else {
      renderSchedule(filtered);
    }
    setPageTitle(weekType);
    updateWeekCounts(); // 同步更新徽标计数
    void container.offsetWidth;
    container.classList.remove('is-fading');
  }, 150);
}

function animateSwap(renderFn) {
  const container = $("schedule");
  if (!container) { renderFn(); return; }
  container.classList.add('is-fading');
  setTimeout(() => {
    renderFn();
    // 强制reflow以确保过渡生效
    void container.offsetWidth;
    container.classList.remove('is-fading');
  }, 150);
}

function renderWeek(which) {
  const offset = which === 'next' ? 1 : 0;
  const filtered = filterByWeek(window.ALL_CLASSES || [], offset);
  animateSwap(() => renderSchedule(filtered));
  setPageTitle(which);
}

function setupWeekToggle() {
  const tabs = document.querySelectorAll('.week-tab');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      tabs.forEach(b => {
        const isActive = b === btn;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      const weekType = btn.dataset.week === 'next' ? 'next' : 'current';
      renderCoursesByWeek(weekType); // 修复：传递正确的weekType，并使用新渲染逻辑
    });
  });
}

// 页面加载后：显示loading，调用API，缓存数据并初始化周切换
window.addEventListener("DOMContentLoaded", async () => {
  hideError();
  showLoading();
  try {
    const classes = await fetchCoursesFromAPI();
    window.ALL_CLASSES = classes;
    setupWeekToggle();
    ensureTabCountElements();
    updateWeekCounts();
    renderCoursesByWeek('current');
  } catch (err) {
    console.error(err);
    showError(
      typeof err?.message === "string"
        ? err.message
        : "加载课程数据失败，请稍后重试或联系管理员"
    );
  } finally {
    hideLoading();
  }
});

/**
 * 状态到样式类名的映射：进行中/计划中/已完成/已取消
 */
function mapStatusToClass(statusText) {
  const s = String(statusText || '').trim();
  // 明确映射四种标准名称
  const directMap = {
    '进行中': 'status-ongoing',
    '计划中': 'status-planned',
    '已完成': 'status-completed',
    '已取消': 'status-cancelled',
  };
  if (directMap[s]) return directMap[s];
  // 兼容其他可能的中文文案（如“未开始”等）
  if (/进行/.test(s)) return 'status-ongoing';
  if (/计划|未开始/.test(s)) return 'status-planned';
  if (/完成/.test(s)) return 'status-completed';
  if (/取消/.test(s)) return 'status-cancelled';
  return 'status-planned'; // 默认当做计划中
}
/**
 * 出勤率格式化：支持0-1或百分值，统一显示为“xx%”
 */
function formatAttendance(value) {
  if (typeof value !== 'number') return '';
  const v = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return `出勤率 ${v}%`;
}