// 管理员维护成就目录：材质库 achievement_material、徽章 achievement_def
const { createInternalCtx } = require('./_helper.js');
const isManager = require('./isManager.js');
const { generateBack } = require('./achievementBack.js');
const { METRICS, findAll } = require('./achievement.js');

const KEY_PATTERN = /^[a-z][a-z0-9_-]{1,39}$/;
const STATUSES = ['draft', 'active'];

function clean(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isCosUrl(url) {
  return /^https:\/\//.test(url || '');
}

function sameRule(a, b) {
  return a?.metric === b?.metric && a?.count === b?.count;
}

async function holderCount(db, key) {
  return (await db.collection('achievement').count({ key })).result || 0;
}

async function holderCounts(db) {
  const { result } = await db.collection('achievement').aggregate([
    { $group: { _id: '$key', count: { $sum: 1 } } },
  ]);
  return (result || []).reduce((map, row) => { map[row._id] = row.count; return map; }, {});
}

async function list(db) {
  const [materials, badges, counts] = await Promise.all([
    findAll(db.collection('achievement_material')),
    findAll(db.collection('achievement_def')),
    holderCounts(db),
  ]);
  return {
    ok: true,
    metrics: METRICS,
    materials: materials.sort((a, b) => a.key.localeCompare(b.key)),
    badges: badges.map(badge => ({ ...badge, holders: counts[badge.key] || 0 })),
  };
}

// 重新生成引用该材质、且背面不是用当前材质图生成的徽章
async function regenerateBacks(ctx, material) {
  const db = ctx.mpserverless.db;
  const badges = await findAll(db.collection('achievement_def'), { materialKey: material.key });
  const result = { regenerated: 0, failed: 0, skipped: 0 };
  for (const badge of badges) {
    if (!isCosUrl(badge.frontImage)) { result.skipped++; continue; }
    if (badge.backMaterialImage === material.image) continue;
    try {
      const backImage = await generateBack(ctx, badge.frontImage, material.image, badge.key);
      await db.collection('achievement_def').updateOne({ _id: badge._id }, {
        $set: { backImage, backMaterialImage: material.image, updated_at: new Date() },
      });
      result.regenerated++;
    } catch (error) {
      console.error('[achievement catalog] regenerate', badge.key, error);
      result.failed++;
    }
  }
  return result;
}

async function saveMaterial(ctx, input) {
  const db = ctx.mpserverless.db;
  const key = clean(input.key, 40);
  const name = clean(input.name, 20);
  const image = clean(input.image, 500);
  if (!KEY_PATTERN.test(key)) return { ok: false, error: '标识只能使用小写字母、数字、短横线和下划线' };
  if (!name) return { ok: false, error: '请填写材质名称' };
  if (!isCosUrl(image)) return { ok: false, error: '请上传材质 PNG' };
  const collection = db.collection('achievement_material');
  const current = (await collection.findOne({ key })).result;
  if (input.isNew && current) return { ok: false, error: '材质标识已存在' };
  if (!input.isNew && !current) return { ok: false, error: '材质不存在' };
  const data = { key, name, image, updated_at: new Date() };
  if (current) await collection.updateOne({ _id: current._id }, { $set: data });
  else await collection.insertOne({ ...data, created_at: new Date() });
  return { ok: true, ...(await regenerateBacks(ctx, data)) };
}

async function saveBadge(ctx, input) {
  const db = ctx.mpserverless.db;
  const key = clean(input.key, 40);
  if (!KEY_PATTERN.test(key)) return { ok: false, error: '标识只能使用小写字母、数字、短横线和下划线' };
  const collection = db.collection('achievement_def');
  const current = (await collection.findOne({ key })).result;
  if (input.isNew && current) return { ok: false, error: '徽章标识已存在' };
  if (!input.isNew && !current) return { ok: false, error: '徽章不存在' };
  const holders = current ? await holderCount(db, key) : 0;

  const rule = { metric: clean(input.rule?.metric, 20), count: Number(input.rule?.count) };
  if (!METRICS[rule.metric] || !Number.isInteger(rule.count) || rule.count < 1 || rule.count > 100000) {
    return { ok: false, error: '请选择统计项并填写 1 以上的整数门槛' };
  }
  if (current && (current.status === 'active' || holders > 0) && !sameRule(current.rule, rule)) {
    return { ok: false, error: '徽章上线或已有人获得后，规则不能修改' };
  }

  const series = clean(input.series, 20);
  const name = clean(input.name, 20);
  const sort = Number(input.sort) || 0;
  const status = STATUSES.includes(input.status) ? input.status : 'draft';
  if (!series || !name) return { ok: false, error: '请填写系列和名称' };
  if (current?.status === 'active' && status === 'draft' && holders > 0) {
    return { ok: false, error: '已有人获得的徽章不能退回草稿' };
  }

  const materialKey = clean(input.materialKey, 40);
  const material = (await db.collection('achievement_material').findOne({ key: materialKey })).result;
  if (!material) return { ok: false, error: '请选择材质' };

  const frontImage = clean(input.frontImage, 500);
  const frontChanged = frontImage !== current?.frontImage;
  if (frontChanged && !isCosUrl(frontImage)) return { ok: false, error: '请上传正面 PNG' };

  const data = {
    key, series, name, sort, status, rule, materialKey, frontImage,
    description: clean(input.description, 100),
    backImage: current?.backImage || '',
    backMaterialImage: current?.backMaterialImage || '',
    updated_at: new Date(),
  };
  const needsBack = frontChanged || materialKey !== current?.materialKey || material.image !== current?.backMaterialImage;
  if (needsBack && isCosUrl(frontImage)) {
    if (!isCosUrl(material.image)) return { ok: false, error: `请先在材质库上传「${material.name}」材质` };
    data.backImage = await generateBack(ctx, frontImage, material.image, key);
    data.backMaterialImage = material.image;
  } else if (current && materialKey !== current.materialKey) {
    return { ok: false, error: '更换材质前请先上传正面 PNG' };
  }
  if (status === 'active' && (!data.frontImage || !data.backImage)) {
    return { ok: false, error: '正面和背面齐全后才能上线' };
  }

  if (current) await collection.updateOne({ _id: current._id }, { $set: data });
  else await collection.insertOne({ ...data, created_at: new Date() });
  return { ok: true };
}

async function deleteBadge(ctx, input) {
  const db = ctx.mpserverless.db;
  const key = clean(input.key, 40);
  const current = (await db.collection('achievement_def').findOne({ key })).result;
  if (!current) return { ok: false, error: '徽章不存在' };
  if (await holderCount(db, key) > 0) return { ok: false, error: '已有人获得的徽章不能删除' };
  await db.collection('achievement_def').deleteOne({ _id: current._id });
  return { ok: true };
}

module.exports = async (ctx) => {
  const openid = ctx.args?.openid;
  const action = ctx.args?.action;
  if (!openid || !await isManager(createInternalCtx(ctx, { openid, req: 2 }))) {
    return { ok: false, error: '无权管理成就徽章' };
  }
  const input = ctx.args?.data || {};
  try {
    if (action === 'list') return await list(ctx.mpserverless.db);
    if (action === 'saveMaterial') return await saveMaterial(ctx, input);
    if (action === 'saveBadge') return await saveBadge(ctx, input);
    if (action === 'deleteBadge') return await deleteBadge(ctx, input);
    return { ok: false, error: '未知操作' };
  } catch (error) {
    console.error('[achievement catalog]', action, error);
    return { ok: false, error: clean(error.message, 120) || '成就目录操作失败' };
  }
};
