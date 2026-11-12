// 管理员维护成就目录：材质库 achievement_material、徽章 achievement_def
const { createInternalCtx } = require('./_helper.js');
const isManager = require('./isManager.js');
const { generateAssets } = require('./achievementBack.js');
const { METRICS, findAll, loadDisplaySettings } = require('./achievement.js');
const serials = require('./achievementSerial');
const { randomUUID } = require('crypto');

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

const progressId = key => `achievement_assets:${key}`;
const needsAssets = (badge, material) => !badge.backImage || !badge.model3dUrl || !material?.image || badge.backMaterialImage !== material.image;

async function beginProgress(db, key, generationId, init = {}) {
  const collection = db.collection('setting');
  // 统一在此处兜底，避免写入用 undefined、后续按 undefined 过滤导致进度更新静默失效
  const gid = generationId || randomUUID();
  await collection.updateOne({ _id: progressId(key) }, { $set: {
    generationId: gid, status: 'running', step: init.step || 0, total: init.total || 6,
    label: init.label || '读取素材', error: '', updated_at: new Date(),
  } }, { upsert: true });
  return async (step, label, status = 'running', error = '') => {
    await collection.updateOne({ _id: progressId(key), generationId: gid }, { $set: { step, label, status, error, updated_at: new Date() } });
  };
}

async function generateTrackedAssets(ctx, front, material, key, generationId = randomUUID(), batchReport, applyAssets) {
  const report = await beginProgress(ctx.mpserverless.db, key, generationId);
  try {
    const assets = await generateAssets(ctx, front, material, key, async (step, label) => {
      await report(step, label);
      if (batchReport) await batchReport(step, label);
    });
    await report(5, '保存素材');
    if (batchReport) await batchReport(5, '保存素材');
    await applyAssets(assets);
    await report(6, '素材已更新', 'complete');
    return assets;
  } catch (error) {
    await report(0, '生成失败', 'failed', clean(error.message, 120));
    throw error;
  }
}

async function list(db) {
  const [materials, badges, counts, sequences, progress, displaySettings] = await Promise.all([
    findAll(db.collection('achievement_material')),
    findAll(db.collection('achievement_def')),
    holderCounts(db),
    findAll(db.collection('setting'), { _id: { $regex: '^achievement_serial:' } }),
    findAll(db.collection('setting'), { _id: { $regex: '^achievement_assets:' } }),
    loadDisplaySettings(db),
  ]);
  return {
    ok: true,
    metrics: METRICS,
    numberingRevision: serials.revision,
    displaySettings,
    materials: materials.map(item => ({ ...item, generation: progress.find(p => p._id === progressId(`material:${item.key}`)) || null })).sort((a, b) => a.key.localeCompare(b.key)),
    badges: badges.map(badge => ({ ...badge, needsAssets: needsAssets(badge, materials.find(m => m.key === badge.materialKey)), generation: progress.find(p => p._id === progressId(badge.key)) || null, holders: counts[badge.key] || 0, serialReady: sequences.some(seq => seq._id === serials.counterId(badge.key) && seq.ready) })),
  };
}

// 重新生成引用该材质、且背面不是用当前材质图生成的徽章。
// 每枚都要走 COS 下载 → PNG 渲染 → COS 上传，约 1~3 秒；单次调用只处理一小批，
// 剩余部分通过 return pending 交回调用方续跑，避免同步调用撞云函数超时。
const REGEN_BATCH = 3;

async function pendingBacks(db, material) {
  const badges = await findAll(db.collection('achievement_def'), { materialKey: material.key });
  const ready = badges.filter(badge => isCosUrl(badge.frontImage));
  return { skipped: badges.length - ready.length, ready, pending: ready.filter(badge => needsAssets(badge, material)) };
}

async function regenerateBacks(ctx, material, generationId) {
  const db = ctx.mpserverless.db;
  const { skipped, ready, pending } = await pendingBacks(db, material);
  const total = ready.length;
  const batch = pending.slice(0, REGEN_BATCH);
  const done = total - pending.length;
  const result = { regenerated: 0, failed: 0, skipped, done, total, remaining: pending.length, pending: false };
  const report = await beginProgress(db, `material:${material.key}`, generationId, {
    step: done, total, label: batch.length ? `准备生成背面图 ${done}/${total}` : '背面图已是最新',
  });

  for (let i = 0; i < batch.length; i++) {
    const badge = batch[i];
    const at = done + i + 1;
    try {
      await generateTrackedAssets(ctx, badge.frontImage, material.image, badge.key, undefined,
        (step, label) => report(at, `${at}/${total} 枚 · ${badge.name} · ${label}`),
        assets => db.collection('achievement_def').updateOne({ _id: badge._id }, {
          $set: { ...assets, backMaterialImage: material.image, updated_at: new Date() },
        }));
      result.regenerated++;
    } catch (error) {
      console.error('[achievement catalog] regenerate', badge.key, error);
      result.failed++;
    }
  }

  // 整批都有失败时不再续跑，否则会反复重试同一批；交回用户在保存时重试
  const remaining = pending.length - result.regenerated;
  result.remaining = remaining;
  result.done = total - remaining;
  result.pending = remaining > 0 && result.failed === 0;
  const label = result.pending
    ? `${result.done}/${total} 枚已完成，继续生成…`
    : (result.failed ? `${result.done}/${total} 枚已就绪，${result.failed} 枚生成失败，可再次保存重试` : `背面图已更新，共 ${result.done} 枚`);
  await report(result.done, label, result.pending ? 'running' : (result.failed ? 'failed' : 'complete'));
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
  return { ok: true, ...(await regenerateBacks(ctx, data, input.generationId)) };
}

// 续跑材质背面图重算：saveMaterial 返回 pending 后，前端循环调用本接口直到 pending 为 false
async function continueRegenerateBacks(ctx, input) {
  const key = clean(input.key, 40);
  const material = (await ctx.mpserverless.db.collection('achievement_material').findOne({ key })).result;
  if (!material) return { ok: false, error: '材质不存在' };
  return { ok: true, ...(await regenerateBacks(ctx, material, input.generationId)) };
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
    model3dUrl: current?.model3dUrl || '',
    updated_at: new Date(),
  };
  const persist = async (assets = {}) => {
    Object.assign(data, assets);
    if (status === 'active' && (!data.frontImage || !data.backImage)) throw new Error('正面和背面齐全后才能上线');
    if (current) await collection.updateOne({ _id: current._id }, { $set: data, $unset: { thicknessMm: '' } });
    else await collection.insertOne({ ...data, created_at: new Date() });
  };
  const regenerate = !current || needsAssets(current, material) || frontChanged || materialKey !== current.materialKey;
  if (regenerate && isCosUrl(frontImage)) {
    if (!isCosUrl(material.image)) return { ok: false, error: `请先在材质库上传「${material.name}」材质` };
    data.backMaterialImage = material.image;
    await generateTrackedAssets(ctx, frontImage, material.image, key, input.generationId, undefined, persist);
  } else if (current && materialKey !== current.materialKey) {
    return { ok: false, error: '更换材质前请先上传正面 PNG' };
  } else await persist();
  return { ok: true, ...(await serials.prepare(db, key)) };
}

async function prepareBadge(ctx, input) {
  const db = ctx.mpserverless.db, key = clean(input.key, 40);
  const badge = (await db.collection('achievement_def').findOne({ key })).result;
  if (!badge) return { ok: false, error: '徽章不存在' };
  const material = (await db.collection('achievement_material').findOne({ key: badge.materialKey })).result;
  if (needsAssets(badge, material)) {
    if (!material?.image || !badge.frontImage) return { ok: false, error: '请先补齐正面图片和材质' };
    await generateTrackedAssets(ctx, badge.frontImage, material.image, key, input.generationId, undefined,
      assets => db.collection('achievement_def').updateOne({ _id: badge._id }, {
        $set: { ...assets, backMaterialImage: material.image, updated_at: new Date() },
      }));
  }
  return { ok: true, ...(await serials.prepare(db, key)) };
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
    if (action === 'saveDisplaySettings') {
      const thicknessMm = Number(input.thicknessMm);
      if (!Number.isFinite(thicknessMm) || thicknessMm < 0 || thicknessMm > 2) return { ok: false, error: '厚度需在 0～2 mm 之间' };
      await ctx.mpserverless.db.collection('setting').updateOne({ _id: 'achievement_display' }, { $set: { thicknessMm, updated_at: new Date() } }, { upsert: true });
      return { ok: true, displaySettings: { thicknessMm } };
    }
    if (action === 'generationStatus') {
      const { result } = await ctx.mpserverless.db.collection('setting').findOne({ _id: progressId(clean(input.key, 60)) });
      return { ok: true, progress: result || null };
    }
    if (action === 'saveMaterial') return await saveMaterial(ctx, input);
    if (action === 'regenerateMaterialBacks') return await continueRegenerateBacks(ctx, input);
    if (action === 'saveBadge') return await saveBadge(ctx, input);
    if (action === 'deleteBadge') return await deleteBadge(ctx, input);
    if (action === 'prepareBadge') return await prepareBadge(ctx, input);
    return { ok: false, error: '未知操作' };
  } catch (error) {
    console.error('[achievement catalog]', action, error);
    return { ok: false, error: clean(error.message, 120) || '成就目录操作失败' };
  }
};
