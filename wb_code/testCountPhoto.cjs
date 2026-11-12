// 桩测试：countPhoto 批量聚合 + 水位去重
// 用法：node wb_code/testCountPhoto.cjs
const path = require('path');
const assert = require('assert');

const TARGET = path.resolve(__dirname, '../functionsEMAS/timeTrigger/countPhoto.js');
delete require.cache[TARGET];
const countPhoto = require(TARGET);

const HOUR = 3600 * 1000;
const now = Date.now();

let cats = [];
let photos = [];
let writes = 0;

function matchDoc(doc, q) {
  for (const [k, v] of Object.entries(q)) {
    if (k === '$or') { if (!v.some(sub => matchDoc(doc, sub))) return false; continue; }
    const val = doc[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('$exists' in v && (val !== undefined) !== v.$exists) return false;
      if ('$gte' in v && !(val >= v.$gte)) return false;
      if ('$ne' in v && val === v.$ne) return false;
      if ('$in' in v && !v.$in.includes(val)) return false;
      continue;
    }
    if (val !== v) return false;
  }
  return true;
}

const db = {
  collection(name) {
    if (name === 'cat') {
      return {
        async find(query = {}, opts = {}) {
          let rows = cats.filter(c => matchDoc(c, query));
          const skip = opts.skip || 0;
          rows = rows.slice(skip, skip + (opts.limit || 100));
          // 模拟 projection
          if (opts.projection) {
            const keys = Object.keys(opts.projection).filter(k => opts.projection[k]);
            rows = rows.map(r => Object.fromEntries(keys.filter(k => k in r).map(k => [k, r[k]])));
          }
          return { result: rows };
        },
        async updateOne(query, update) {
          const doc = cats.find(c => c._id === query._id);
          if (!doc) return { result: { matchedCount: 0 } };
          Object.assign(doc, update.$set || {});
          writes++;
          return { result: { matchedCount: 1 } };
        },
      };
    }
    if (name === 'photo') {
      return {
        async aggregate(pipeline) {
          const [stage, group] = pipeline;
          const field = group.$group._id.slice(1);
          const m = new Map();
          for (const p of photos.filter(x => matchDoc(x, stage.$match))) {
            m.set(p[field], (m.get(p[field]) || 0) + 1);
          }
          return { result: [...m].map(([_id, n]) => ({ _id, n })) };
        },
      };
    }
    throw new Error(`unexpected collection ${name}`);
  },
};

const ctx = { mpserverless: { db } };

function seed() {
  cats = [
    // 新猫：字段缺失，无照片
    { _id: 'c1', name: '新猫', mphoto: new Date(now - 2 * HOUR) },
    // 近期有照片变更，从未统计过（无水印）
    { _id: 'c2', name: '旧数据', mphoto: new Date(now - 10 * 60 * 1000), photo_count_best: 0, photo_count_total: 0 },
    // 近期变更 + 旧水印（过期）
    { _id: 'c3', name: '要重算', mphoto: new Date(now - 5 * 60 * 1000), photo_count_best: 1, photo_count_total: 1, photo_count_at: new Date(now - 30 * 60 * 1000) },
    // 已统计且水印晚于 mphoto（不该动）
    { _id: 'c4', name: '已最新', mphoto: new Date(now - 5 * 60 * 1000), photo_count_best: 2, photo_count_total: 3, photo_count_at: new Date(now - 4 * 60 * 1000) },
    // 老猫，mphoto 很久以前，不在候选范围
    { _id: 'c5', name: '老猫', mphoto: new Date(now - 3 * 24 * HOUR), photo_count_best: 1, photo_count_total: 1 },
    // 已删除
    { _id: 'c6', name: '已删', deleted: 1, mphoto: new Date(now - 60 * 1000) },
  ];
  photos = [
    { cat_id: 'c2', verified: true, best: true },
    { cat_id: 'c2', verified: true },
    { cat_id: 'c3', verified: true },
    { cat_id: 'c3', verified: true, best: true },
    { cat_id: 'c3', verified: true, best: true },
    { cat_id: 'c3', verified: false, best: true }, // 未审核，不该计入
    { cat_id: 'c4', verified: true, best: true },
    { cat_id: 'c4', verified: true },
    { cat_id: 'c4', verified: true },
    { cat_id: 'c5', verified: true, best: true },
  ];
  writes = 0;
}

(async () => {
  seed();
  const first = await countPhoto(ctx);
  const byId = id => cats.find(c => c._id === id);

  assert.strictEqual(first.checked, 4, `候选为 c1~c4（c4 由水印过滤），实际 ${first.checked}`);
  assert.strictEqual(first.updated, 3, `应更新 3 只，实际 ${first.updated}`);
  assert.deepStrictEqual([byId('c1').photo_count_best, byId('c1').photo_count_total], [0, 0], '新猫应为 0/0');
  assert.deepStrictEqual([byId('c2').photo_count_best, byId('c2').photo_count_total], [1, 2], 'c2 应为 1/2');
  assert.deepStrictEqual([byId('c3').photo_count_best, byId('c3').photo_count_total], [2, 3], 'c3 应为 2/3（未审核不计）');
  assert.ok(byId('c1').photo_count_at && byId('c2').photo_count_at, '应写入水位');
  assert.strictEqual(byId('c4').photo_count_total, 3, '已最新的猫不应被改');
  assert.strictEqual(byId('c6').photo_count_best, undefined, '已删除的猫不应处理');
  console.log(`场景1 通过：首次重算 3 只，计数与水位正确（写入 ${writes} 次）`);

  // 场景2：同一批再跑一次，水印生效 → 不写库
  const before = writes;
  const second = await countPhoto(ctx);
  assert.strictEqual(second.updated, 0, `第二轮不应更新，实际 ${second.updated}`);
  assert.strictEqual(writes, before, '第二轮不应产生写入');
  console.log('场景2 通过：水位生效，第二轮零写入');

  // 场景3：只更新 c2 的 mphoto，应只重算 c2
  byId('c2').mphoto = new Date(Date.now() + 1000);
  photos.push({ cat_id: 'c2', verified: true, best: true });
  const third = await countPhoto(ctx);
  assert.strictEqual(third.checked, 3, `候选为 c2/c3/c4，实际 ${third.checked}`);
  assert.strictEqual(third.updated, 1);
  assert.deepStrictEqual([byId('c2').photo_count_best, byId('c2').photo_count_total], [2, 3], 'c2 应更新为 2/3');
  console.log('场景3 通过：仅重算变更的那只猫');

  // 场景4：照片被删空 → 计数归零
  photos = photos.filter(p => p.cat_id !== 'c2');
  byId('c2').mphoto = new Date(Date.now() + 2000);
  await countPhoto(ctx);
  assert.deepStrictEqual([byId('c2').photo_count_best, byId('c2').photo_count_total], [0, 0], '照片清空后应归零');
  console.log('场景4 通过：照片清空后归零');

  console.log('\n全部通过');
})().catch(error => { console.error('测试失败:', error.message); process.exit(1); });
