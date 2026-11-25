// 成就规则：统计项注册表、规则校验与按规则计数
// rule: { metric, count, window?: { start, end }, agg?: 'days' | 'cats', filter?: { catId } }
// window 的 start / end 是北京时间的日期字符串（YYYY-MM-DD，含首尾两天）
const MAX_COUNT = 100000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
// 兜底同步在窗口结束后继续检查的天数，覆盖审核延迟
const GRACE_DAYS = 30;

const AGGS = {
  days: { unit: '天' },
  cats: { unit: '只' },
};

async function findAll(collection, query = {}, options = {}) {
  const { result: total } = await collection.count(query);
  const rows = [];
  while (rows.length < total) {
    const { result } = await collection.find(query, { ...options, skip: rows.length, limit: 100 });
    if (!result || !result.length) break;
    rows.push(...result);
  }
  return rows;
}

function uniqueCount(list) {
  return Array.isArray(list) ? new Set(list.filter(Boolean)).size : 0;
}

// 北京时间日期 → 时间范围 [start, end)
function windowRange(window) {
  if (!window) return null;
  return {
    start: new Date(Date.parse(`${window.start}T00:00:00+08:00`)),
    end: new Date(Date.parse(`${window.end}T00:00:00+08:00`) + DAY_MS),
  };
}

function beijingDay(date) {
  return new Date(+new Date(date) + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

// 记录集合类统计项的通用计数：按窗口、筛选条件查询，再按聚合方式计数
function recordCounter(collection, baseQuery, catField) {
  return async (db, openid, rule) => {
    const query = { ...baseQuery(openid) };
    const range = windowRange(rule.window);
    if (range) query.create_date = { $gte: range.start, $lt: range.end };
    if (rule.filter?.catId) query[catField] = rule.filter.catId;
    if (!rule.agg) return (await db.collection(collection).count(query)).result || 0;
    const field = rule.agg === 'days' ? 'create_date' : catField;
    const rows = await findAll(db.collection(collection), query, { projection: { [field]: 1 } });
    const values = rows.map(row => row[field]).filter(Boolean);
    return new Set(rule.agg === 'days' ? values.map(beijingDay) : values).size;
  };
}

// 用户身上的猫 ID 列表类统计项：没有时间记录，只支持按猫筛选
function listCounter(field) {
  return async (db, openid, rule, user) => {
    const list = user?.[field] || [];
    if (rule.filter?.catId) return list.includes(rule.filter.catId) ? 1 : 0;
    return uniqueCount(list);
  };
}

// supports：该统计项可用的规则条件。window 时间窗口、days / cats 聚合、catId 按猫筛选
const METRICS = {
  view: {
    label: '浏览猫猫', name: '猫口普查', unit: '只', desc: '看过 {} 只不同的猫猫',
    supports: ['catId'],
    count: listCounter('viewedCats'),
  },
  follow: {
    label: '关注猫猫', name: '吸猫', unit: '只', desc: '关注 {} 只猫猫',
    supports: ['catId'],
    count: listCounter('followCats'),
  },
  photo: {
    label: '上传照片', name: '留影', unit: '张', desc: '上传 {} 张审核通过的照片',
    supports: ['window', 'days', 'cats', 'catId'],
    count: recordCounter('photo', openid => ({ _openid: openid, verified: true }), 'cat_id'),
  },
  comment: {
    label: '发布便利贴', name: '便利贴', unit: '张', desc: '发出 {} 张审核通过的便利贴',
    supports: ['window', 'days', 'cats', 'catId'],
    // 累计曾通过审核的便利贴，软删除不扣减。
    count: recordCounter('comment', openid => ({ _openid: openid, $or: [
      { approvedOnce: true },
      { review_action: 'pass' },
      { needVerify: { $ne: true }, deleted: { $ne: true }, review_action: { $ne: 'delete' } },
    ] }), 'cat_id'),
  },
  like: {
    label: '点赞', name: '点赞', unit: '个', desc: '给出 {} 个点赞',
    supports: ['window', 'days'],
    count: recordCounter('inter', openid => ({ _openid: openid, type: 10000 }), 'item_id'),
  },
};

// 下发给前端的统计项说明（不含计数函数）
function metricsMeta() {
  return Object.fromEntries(Object.entries(METRICS).map(([key, { count, ...meta }]) => [key, meta]));
}

function validDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

// 校验并规整规则，只保留有效字段；失败返回 { error }
function normalizeRule(input) {
  const metricKey = typeof input?.metric === 'string' ? input.metric.trim() : '';
  const metric = METRICS[metricKey];
  const count = Number(input?.count);
  if (!metric || !Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    return { error: '请选择统计项并填写 1 以上的整数门槛' };
  }
  const rule = { metric: metricKey, count };

  if (input.window) {
    if (!metric.supports.includes('window')) return { error: `「${metric.label}」不支持时间窗口` };
    const { start, end } = input.window;
    if (!validDate(start) || !validDate(end)) return { error: '时间窗口请填写 YYYY-MM-DD 格式的日期' };
    if (start > end) return { error: '时间窗口的开始日期不能晚于结束日期' };
    rule.window = { start, end };
  }

  if (input.agg && input.agg !== 'total') {
    if (!AGGS[input.agg] || !metric.supports.includes(input.agg)) return { error: `「${metric.label}」不支持该统计方式` };
    rule.agg = input.agg;
  }

  const catId = typeof input.filter?.catId === 'string' ? input.filter.catId.trim() : '';
  if (catId) {
    if (!metric.supports.includes('catId')) return { error: `「${metric.label}」不支持按猫筛选` };
    if (rule.agg === 'cats') return { error: '按猫筛选时不能再按不同猫数统计' };
    rule.filter = { catId };
  }
  return { rule };
}

// 规则的规范化标识：字段顺序固定，缺省字段不出现，旧规则与新规则可直接比较
function ruleKey(rule) {
  return JSON.stringify([
    rule?.metric, rule?.count,
    rule?.window ? [rule.window.start, rule.window.end] : null,
    rule?.agg || null,
    rule?.filter?.catId || null,
  ]);
}

// 计数用的标识：不含门槛，同条件不同门槛的徽章共用一次计数
function countKey(rule) {
  return JSON.stringify([
    rule.metric,
    rule.window ? [rule.window.start, rule.window.end] : null,
    rule.agg || null,
    rule.filter?.catId || null,
  ]);
}

function sameRule(a, b) {
  return ruleKey(a) === ruleKey(b);
}

// 时间状态：upcoming 未开始 / open 进行中 / grace 已结束仍可补发 / closed 已结束
function windowStatus(rule, now = new Date()) {
  const range = windowRange(rule?.window);
  if (!range) return 'open';
  if (now < range.start) return 'upcoming';
  if (now < range.end) return 'open';
  if (+now < +range.end + GRACE_DAYS * DAY_MS) return 'grace';
  return 'closed';
}

// 同一次检查内复用计数结果
function createCounter(db, openid, user) {
  const cache = new Map();
  return rule => {
    const key = countKey(rule);
    if (!cache.has(key)) cache.set(key, Promise.resolve().then(() => METRICS[rule.metric].count(db, openid, rule, user)));
    return cache.get(key);
  };
}

function describeRule(rule) {
  const metric = METRICS[rule?.metric];
  if (!metric) return '';
  let text;
  if (rule.agg === 'days') text = `${metric.label}累计 ${rule.count} 天`;
  else if (rule.agg === 'cats') text = `为 ${rule.count} 只不同的猫猫${metric.label}`;
  else text = metric.desc.replace('{}', rule.count);
  if (rule.filter?.catId) text = `${text}（限指定猫猫）`;
  if (rule.window) {
    const span = rule.window.start === rule.window.end ? rule.window.start : `${rule.window.start} 至 ${rule.window.end}`;
    text = `${span} 期间${text}`;
  }
  return text;
}

module.exports = {
  METRICS, GRACE_DAYS,
  findAll, uniqueCount, metricsMeta, normalizeRule, sameRule, ruleKey, countKey,
  windowRange, windowStatus, createCounter, describeRule, beijingDay,
};
