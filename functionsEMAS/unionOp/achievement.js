// 用户成就：读取目录、服务端统计并发放、记录浏览
// achievement_def：徽章定义；achievement：获得记录 { openid, key, create_date, serialNo, _openid }
// 浏览记录存在 user.viewedCats（猫的 _id 数组）
const { createHash } = require('crypto');
const serials = require('./achievementSerial');
const rules = require('./achievementRules');
const { METRICS, findAll, metricsMeta, sameRule, windowStatus, createCounter, describeRule } = rules;

const MAX_MIGRATE_CATS = 500;

function describe(def) {
  return def.description || describeRule(def.rule);
}

// 下发给前端的规则：只带已设置的可选条件
function publicRule(rule) {
  return {
    metric: rule.metric,
    count: rule.count,
    ...(rule.window && { window: { start: rule.window.start, end: rule.window.end } }),
    ...(rule.agg && { agg: rule.agg }),
    ...(rule.filter?.catId && { filter: { catId: rule.filter.catId } }),
  };
}

function publicDef(def) {
  return {
    key: def.key,
    series: def.series,
    sort: def.sort || 0,
    name: def.name,
    description: describe(def),
    materialKey: def.materialKey,
    materialColor: def.materialColor || '',
    frontImage: def.frontImage,
    backImage: def.backImage,
    model3dUrl: def.model3dUrl || '',
    rule: publicRule(def.rule),
    timeStatus: windowStatus(def.rule),
    ...(def.status === 'test' && { testing: true }),
  };
}

function bySeriesAndSort(a, b) {
  return String(a.series).localeCompare(String(b.series)) || (a.sort || 0) - (b.sort || 0) || a.key.localeCompare(b.key);
}

// 测试状态的徽章只对超级管理员（99）展示和发放，用于在正式环境验收
const TEST_VIEWER_LEVEL = 99;
const visibleStatuses = user => Number(user?.manager) >= TEST_VIEWER_LEVEL ? ['active', 'test'] : ['active'];

async function loadActiveDefs(db, user) {
  const [defs, materials] = await Promise.all([
    findAll(db.collection('achievement_def'), { status: { $in: visibleStatuses(user) } }),
    findAll(db.collection('achievement_material')),
  ]);
  // 成就名称按材质着色：带上材质的文字色（旧材质未取色时为空，前端用默认色）
  const colors = Object.fromEntries(materials.map(item => [item.key, item.color || '']));
  return defs
    .filter(def => METRICS[def.rule?.metric] && def.frontImage && def.backImage)
    .map(def => ({ ...def, materialColor: colors[def.materialKey] || '' }))
    .sort(bySeriesAndSort);
}

const isPlainRule = rule => !rule.window && !rule.agg && !rule.filter;

async function loadDisplaySettings(db) {
  const { result } = await db.collection('setting').findOne({ _id: 'achievement_display' });
  return { thicknessMm: result?.thicknessMm ?? .6 };
}

// 达标即发放：检查未获得、且时间窗口仍可发放的徽章。metric 只检查该统计项（事件触发用）
// 新记录带 notified: false，由下次同步取出并弹解锁提示；老记录没有该字段，视为已通知
async function award(db, openid, user, { defs, records, count, metric } = {}) {
  defs = defs || await loadActiveDefs(db, user);
  records = records || await findAll(db.collection('achievement'), { openid });
  count = count || createCounter(db, openid, user);
  const owned = new Set(records.map(record => record.key));
  // 未开始或已过补发期的时间窗口不统计
  const candidates = defs.filter(def => !owned.has(def.key) && (!metric || def.rule.metric === metric)
    && ['open', 'grace'].includes(windowStatus(def.rule)));
  const candidateCounts = await Promise.all(candidates.map(def => count(def.rule)));

  const awarded = [];
  const failedKeys = [];
  for (const [index, def] of candidates.entries()) {
    if (candidateCounts[index] < def.rule.count) continue;
    try {
      await serials.allocate(db, def.key, async serialNo => {
        const { result: current } = await db.collection('achievement_def').findOne({ key: def.key });
        if (!current || !visibleStatuses(user).includes(current.status) || !sameRule(current.rule, def.rule)) return;
        const id = 'achv_' + createHash('sha256').update(`${openid}\0${def.key}`).digest('hex').slice(0, 40);
        const record = { _id: id, openid, _openid: openid, key: def.key, create_date: new Date(), serialNo, notified: false };
        try {
          const { result: inserted } = await db.collection('achievement').insertOne(record);
          if (!inserted?.insertedId) throw new Error('成就写入失败');
          owned.add(def.key);
          records.push(record);
          awarded.push(def.key);
        } catch (error) {
          const { result: existing } = await db.collection('achievement').findOne({ openid, key: def.key });
          if (!existing) throw error;
          // 并发请求先写入：沿用已有记录，是否提示由它的 notified 决定
          console.warn('[achievement] insert fallback', def.key, error?.message || error);
          owned.add(def.key);
          records.push(existing);
        }
      });
    } catch (error) {
      console.error('[achievement] award failed', def.key, error);
      failedKeys.push(def.key);
    }
  }
  return { defs, records, candidates, candidateCounts, awarded, failedKeys };
}

// 互动写入成功后调用：只检查该统计项。失败只记日志，不影响主操作，由兜底同步补发
async function awardMetric(db, openid, metric) {
  if (!openid || !METRICS[metric]) return [];
  try {
    const { result: user } = await db.collection('user').findOne({ openid });
    return (await award(db, openid, user, { metric })).awarded;
  } catch (error) {
    console.error('[achievement] event award failed', metric, openid, error);
    return [];
  }
}

// 取出未通知的获得记录并标记为已通知，前端据此弹解锁提示
async function takeUnnotified(db, records) {
  const pending = records.filter(record => record.notified === false);
  await Promise.all(pending.map(record => db.collection('achievement')
    .updateOne({ _id: record._id, notified: false }, { $set: { notified: true } })
    .then(() => { record.notified = true; })
    .catch(error => console.warn('[achievement] mark notified failed', record.key, error?.message || error))));
  return [...new Set(pending.map(record => record.key))];
}

// 兜底同步：补发全部统计项，返回进度与待提示的解锁
async function sync(db, openid, user) {
  const [defs, records, displaySettings] = await Promise.all([
    loadActiveDefs(db, user),
    findAll(db.collection('achievement'), { openid }),
    loadDisplaySettings(db),
  ]);
  const count = createCounter(db, openid, user);
  const metricKeys = Object.keys(METRICS);
  const [totals, result] = await Promise.all([
    Promise.all(metricKeys.map(metric => count({ metric }))),
    award(db, openid, user, { defs, records, count }),
  ]);
  // counts：各统计项的累计总数（阶梯进度用）；progress：带条件规则的当前进度
  const counts = Object.fromEntries(metricKeys.map((metric, index) => [metric, totals[index]]));
  const progress = {};
  result.candidates.forEach((def, index) => { if (!isPlainRule(def.rule)) progress[def.key] = result.candidateCounts[index]; });
  const newlyUnlocked = await takeUnnotified(db, records);
  return {
    ok: true,
    metrics: metricsMeta(),
    displaySettings,
    defs: defs.map(publicDef),
    unlocked: records.map(record => ({ key: record.key, create_date: record.create_date, serialNo: record.serialNo || null })),
    counts,
    progress,
    newlyUnlocked,
    failedKeys: result.failedKeys,
  };
}

async function existingCatIds(db, ids) {
  const found = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { result } = await db.collection('cat').find({ _id: { $in: chunk } }, { projection: { _id: 1 }, limit: 100 });
    found.push(...(result || []).map(cat => cat._id));
  }
  return found;
}

function cleanIds(value, max) {
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.filter(id => typeof id === 'string' && id && id.length <= 64))].slice(0, max);
}

async function recordView(db, openid, user, args) {
  if (!user) throw new Error('用户尚未初始化');
  const single = cleanIds(args.catId, 1);
  const batch = args.catIds !== undefined && !user.viewedCatsMigrated ? cleanIds(args.catIds, MAX_MIGRATE_CATS) : [];
  const known = new Set(user.viewedCats || []);
  const candidates = [...new Set([...single, ...batch])].filter(id => !known.has(id));
  const valid = candidates.length ? await existingCatIds(db, candidates) : [];
  const update = {};
  if (valid.length) update.$addToSet = { viewedCats: { $each: valid } };
  if (args.catIds !== undefined && !user.viewedCatsMigrated) update.$set = { viewedCatsMigrated: true };
  if (Object.keys(update).length) {
    await db.collection('user').updateOne({ openid }, update);
    user = { ...user, viewedCats: [...known, ...valid] };
  }
  return { user, migrated: args.catIds !== undefined };
}

async function handler(ctx) {
  const db = ctx.mpserverless.db;
  const op = ctx.args?.op;
  try {
    const openid = ctx.args?.openid;
    const user = openid ? (await db.collection('user').findOne({ openid })).result : null;
    if (op === 'catalog') {
      return { ok: true, metrics: metricsMeta(), displaySettings: await loadDisplaySettings(db), defs: (await loadActiveDefs(db, user)).map(publicDef) };
    }
    if (!openid) return { ok: false, error: '未登录' };
    if (op === 'view') {
      const viewed = await recordView(db, openid, user, ctx.args);
      return { ...(await sync(db, openid, viewed.user)), migrated: viewed.migrated };
    }
    if (op === 'sync') return await sync(db, openid, user);
    return { ok: false, error: '未知操作' };
  } catch (error) {
    console.error('[achievement]', op, error);
    return { ok: false, error: '成就读取失败' };
  }
}

module.exports = handler;
module.exports.METRICS = METRICS;
module.exports.findAll = findAll;
module.exports.describe = describe;
module.exports.awardMetric = awardMetric;

module.exports.loadDisplaySettings = loadDisplaySettings;
