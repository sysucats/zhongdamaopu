// 桩测试：验证 regenerateBacks 的分批续跑、进度计算与失败停止
// 用法：node wb_code/testRegenBacks.cjs
const Module = require('module');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(ROOT, 'functionsEMAS/unionOp/manageAchievementCatalog.js');

// ---- 假数据 ----
let failKeys = new Set();
let badgeDocs = [];
let materialDocs = [];
const settings = new Map();

function reset() {
  badgeDocs = Array.from({ length: 7 }, (_, i) => ({
    _id: `b${i}`, key: `badge_${i}`, name: `徽章${i}`, materialKey: 'mat1',
    frontImage: `https://cos.example/front${i}.png`, status: 'active',
  }));
  failKeys = new Set();
  materialDocs = [{ _id: 'm1', key: 'mat1', name: '材质1', image: 'https://cos.example/mat-new.png' }];
  settings.clear();
}
reset();

const match = (doc, query) => Object.entries(query).every(([k, v]) => doc[k] === v);

function collection(name) {
  const docs = () => (name === 'achievement_def' ? badgeDocs : name === 'achievement_material' ? materialDocs : [...settings.values()]);
  return {
    async count(query = {}) { return { result: docs().filter(d => match(d, query)).length }; },
    async find(query = {}, opts = {}) {
      const rows = docs().filter(d => match(d, query));
      const skip = opts.skip || 0;
      return { result: rows.slice(skip, skip + (opts.limit || 100)) };
    },
    async findOne(query = {}) { return { result: docs().find(d => match(d, query)) || null }; },
    async updateOne(query, update, opts = {}) {
      let doc = docs().find(d => match(d, query));
      if (!doc && opts.upsert) { doc = { ...query }; if (name === 'setting') settings.set(query._id, doc); else docs().push(doc); }
      if (!doc) return { result: { matchedCount: 0 } };
      Object.assign(doc, update.$set || {});
      if (update.$unset) Object.keys(update.$unset).forEach(k => delete doc[k]);
      return { result: { matchedCount: 1 } };
    },
    async insertOne(doc) {
      if (name === 'achievement_material') materialDocs.push(doc);
      else if (name === 'achievement_def') badgeDocs.push(doc);
      return { result: { insertedId: doc._id } };
    },
    async aggregate() { return { result: badgeDocs.map(b => ({ _id: b.key, count: 0 })) }; },
  };
}

const db = { collection };

// ---- 桩掉相对依赖 ----
const stubs = {
  './_helper.js': { createInternalCtx: (ctx, args) => ({ ...ctx, args }) },
  './isManager.js': async () => true,
  './achievementBack.js': {
    // 每枚生成“背面图”，把 backImage/model3dUrl 填上；标记为需失败的徽章则抛错
    async generateAssets(ctx, front, material, key) {
      if (failKeys.has(key)) throw new Error('模拟失败');
      return { backImage: `https://cos.example/${key}_back.png`, model3dUrl: `https://cos.example/${key}_model.json` };
    },
  },
  './achievement.js': {
    METRICS: { photo: { label: '照片' } },
    loadDisplaySettings: async () => ({ thicknessMm: 0.6 }),
    async findAll(c, query = {}) {
      const { result: total } = await c.count(query);
      const rows = [];
      while (rows.length < total) {
        const { result } = await c.find(query, { skip: rows.length, limit: 100 });
        if (!result || !result.length) break;
        rows.push(...result);
      }
      return rows;
    },
  },
  './achievementSerial.js': { prepare: async () => ({ pending: false, remaining: 0 }), revision: 'stub', counterId: k => `achievement_serial:${k}` },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (stubs[request] && parent && parent.filename === TARGET) return stubs[request];
  return originalLoad.call(this, request, parent, isMain);
};
delete require.cache[TARGET];
const handler = require(TARGET);
Module._load = originalLoad;

const ctx = { mpserverless: { db, collection }, httpclient: {}, args: {} };
const call = (action, data) => handler({ ...ctx, args: { openid: 'o1', action, data } });

(async () => {
  // 场景 1：7 枚徽章，分批续跑到全部完成
  reset();
  let round = 0;
  let regenerated = 0, failed = 0;
  let res = await call('saveMaterial', { key: 'mat1', name: '材质1', image: 'https://cos.example/mat-new.png', isNew: false, generationId: 'g1' });
  while (true) {
    assert.strictEqual(res.ok, true, '每批都应返回 ok');
    regenerated += res.regenerated; failed += res.failed; round++;
    const done = settings.get('achievement_assets:material:mat1');
    assert.strictEqual(done.generationId, 'g1', '进度应绑定同一 generationId');
    assert.strictEqual(done.total, 7, `total 应恒为 7，实际 ${done.total}`);
    assert.strictEqual(done.step, regenerated, `step 应等于已完成枚数，实际 ${done.step}/${regenerated}`);
    if (!res.pending) break;
    assert.ok(round <= 10, '续跑轮数应有限');
    res = await call('regenerateMaterialBacks', { key: 'mat1', generationId: 'g1' });
  }
  assert.strictEqual(regenerated, 7, `应生成 7 枚，实际 ${regenerated}`);
  assert.strictEqual(failed, 0);
  assert.strictEqual(round, 3, `7 枚 3 一批应 3 轮，实际 ${round} 轮`);
  assert.strictEqual(settings.get('achievement_assets:material:mat1').status, 'complete');
  console.log(`场景1 通过：7 枚分 ${round} 轮完成，进度 ${settings.get('achievement_assets:material:mat1').step}/7 complete`);

  // 场景 2：末枚持续失败 → 停在 failed，不无限重试
  reset();
  failKeys = new Set(['badge_6']);
  let last = await call('saveMaterial', { key: 'mat1', name: '材质1', image: 'https://cos.example/mat-new.png', isNew: false, generationId: 'g2' });
  let guard = 0;
  while (last.pending && guard++ < 20) last = await call('regenerateMaterialBacks', { key: 'mat1', generationId: 'g2' });
  assert.strictEqual(last.pending, false, '有失败时不应继续续跑');
  assert.strictEqual(last.failed, 1, `应有 1 枚失败，实际 ${last.failed}`);
  assert.strictEqual(last.done, 6, `应完成 6 枚，实际 ${last.done}`);
  assert.strictEqual(settings.get('achievement_assets:material:mat1').status, 'failed');
  console.log(`场景2 通过：1 枚失败即停止，done=${last.done}/7 status=failed`);

  // 场景 3：重新保存（重试失败的）只补做剩余
  failKeys = new Set();
  const retry = await call('saveMaterial', { key: 'mat1', name: '材质1', image: 'https://cos.example/mat-new.png', isNew: false, generationId: 'g3' });
  assert.strictEqual(retry.regenerated, 1, `重试应只补 1 枚，实际 ${retry.regenerated}`);
  assert.strictEqual(retry.pending, false);
  console.log('场景3 通过：重试仅补做失败的那 1 枚');

  console.log('\n全部通过');
})().catch(error => { console.error('测试失败:', error.message); process.exit(1); });
