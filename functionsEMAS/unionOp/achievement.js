// 用户成就：读取目录、服务端统计并发放、记录浏览
// achievement_def：徽章定义；achievement：获得记录 { openid, key, create_date, serialNo, _openid }
// 浏览记录存在 user.viewedCats（猫的 _id 数组）
const { createHash } = require('crypto');
const serials = require('./achievementSerial');
const METRICS = {
  view: { label: '浏览猫猫', name: '猫口普查', unit: '只', desc: '看过 {} 只不同的猫猫' },
  follow: { label: '关注猫猫', name: '吸猫', unit: '只', desc: '关注 {} 只猫猫' },
  photo: { label: '上传照片', name: '留影', unit: '张', desc: '上传 {} 张审核通过的照片' },
  comment: { label: '发布便利贴', name: '便利贴', unit: '张', desc: '发出 {} 张审核通过的便利贴' },
  like: { label: '点赞', name: '点赞', unit: '个', desc: '给出 {} 个点赞' },
};

const MAX_MIGRATE_CATS = 500;

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

function describe(def) {
  const metric = METRICS[def.rule?.metric];
  return def.description || (metric ? metric.desc.replace('{}', def.rule.count) : '');
}

function publicDef(def) {
  return {
    key: def.key,
    series: def.series,
    sort: def.sort || 0,
    name: def.name,
    description: describe(def),
    materialKey: def.materialKey,
    frontImage: def.frontImage,
    backImage: def.backImage,
    model3dUrl: def.model3dUrl || '',
    rule: { metric: def.rule.metric, count: def.rule.count },
  };
}

function bySeriesAndSort(a, b) {
  return String(a.series).localeCompare(String(b.series)) || (a.sort || 0) - (b.sort || 0) || a.key.localeCompare(b.key);
}

async function loadActiveDefs(db) {
  const defs = await findAll(db.collection('achievement_def'), { status: 'active' });
  return defs.filter(def => METRICS[def.rule?.metric] && def.frontImage && def.backImage).sort(bySeriesAndSort);
}

function uniqueCount(list) {
  return Array.isArray(list) ? new Set(list.filter(Boolean)).size : 0;
}

async function countMetrics(db, openid, user) {
  const count = async (name, query) => (await db.collection(name).count(query)).result || 0;
  const [photo, comment, like] = await Promise.all([
    count('photo', { _openid: openid, verified: true }),
    count('comment', { _openid: openid, deleted: { $ne: true }, needVerify: { $ne: true } }),
    count('inter', { _openid: openid, type: 10000 }),
  ]);
  return {
    view: uniqueCount(user?.viewedCats),
    follow: uniqueCount(user?.followCats),
    photo, comment, like,
  };
}

async function loadDisplaySettings(db) {
  const { result } = await db.collection('setting').findOne({ _id: 'achievement_display' });
  return { thicknessMm: result?.thicknessMm ?? .6 };
}

async function sync(db, openid, user) {
  const [defs, counts, records] = await Promise.all([
    loadActiveDefs(db),
    countMetrics(db, openid, user),
    findAll(db.collection('achievement'), { openid }),
  ]);
  const owned = new Set(records.map(record => record.key));
  const newlyUnlocked = [];
  for (const def of defs) {
    if (owned.has(def.key) || counts[def.rule.metric] < def.rule.count) continue;
    const sequence = await serials.state(db, def.key);
    if (sequence && !sequence.ready) continue;
    const serialNo = sequence ? await serials.allocate(db, def.key) : null;
    const id = 'achv_' + createHash('sha256').update(`${openid}\0${def.key}`).digest('hex').slice(0, 40);
    const record = { _id: id, openid, _openid: openid, key: def.key, create_date: new Date(), ...(serialNo ? { serialNo } : {}) };
    try {
      const inserted = await db.collection('achievement').insertOne(record);
      if (!inserted?.insertedId) throw new Error('成就写入失败');
      owned.add(def.key);
      records.push(record);
      newlyUnlocked.push(def.key);
    } catch (error) {
      const { result: existing } = await db.collection('achievement').findOne({ openid, key: def.key });
      if (!existing) throw error;
      owned.add(def.key);
      records.push(existing);
    }
  }
  return {
    ok: true,
    metrics: METRICS,
    displaySettings: await loadDisplaySettings(db),
    defs: defs.map(publicDef),
    unlocked: records.map(record => ({ key: record.key, create_date: record.create_date, serialNo: record.serialNo || null })),
    counts,
    newlyUnlocked,
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
    if (op === 'catalog') {
      return { ok: true, metrics: METRICS, displaySettings: await loadDisplaySettings(db), defs: (await loadActiveDefs(db)).map(publicDef) };
    }
    const openid = ctx.args?.openid;
    if (!openid) return { ok: false, error: '未登录' };
    let user = (await db.collection('user').findOne({ openid })).result;
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

module.exports.loadDisplaySettings = loadDisplaySettings;
