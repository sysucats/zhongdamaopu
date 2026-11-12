// 桩测试：photoProcess 坏图重试上限（pendingQuery + markFailed）
// 用法：node wb_code/testPhotoProcess.cjs
//
// 注意：这里不跑真实 handler（它要拉 COS + jimp 渲染），只验证
// 「候选照片的筛选条件」与「失败记账」这两个决定饿死与否的部分。
const path = require('path');
const assert = require('assert');

const TARGET = path.resolve(__dirname, '../functionsEMAS/timeTrigger/photoProcess.js');
delete require.cache[TARGET];
const photoProcess = require(TARGET);

const MAX = photoProcess.MAX_PROCESS_RETRY;
const BATCH_SIZE = 6;

let photos = [];
let writeFail = false;

function matchDoc(doc, q) {
  for (const [k, v] of Object.entries(q)) {
    if (k === '$or') {
      if (!v.some(sub => matchDoc(doc, sub))) return false;
      continue;
    }
    const val = doc[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('$exists' in v && (val !== undefined) !== v.$exists) return false;
      if ('$lt' in v && !(val < v.$lt)) return false;
      if ('$in' in v && !v.$in.includes(val)) return false;
      continue;
    }
    if (val !== v) return false;
  }
  return true;
}

const ctx = {
  mpserverless: {
    db: {
      collection(name) {
        assert.strictEqual(name, 'photo');
        return {
          async find(query, opts = {}) {
            let rows = photos.filter(p => matchDoc(p, query));
            // 按 _id 升序，模拟 sort: { _id: 1 }
            rows = rows.slice().sort((a, b) => (a._id < b._id ? -1 : 1));
            const skip = opts.skip || 0;
            return { result: rows.slice(skip, skip + (opts.limit || 100)) };
          },
          async updateOne(query, update) {
            if (writeFail) throw new Error('db down');
            const doc = photos.find(p => p._id === query._id);
            if (!doc) return { result: { matchedCount: 0 } };
            for (const [k, v] of Object.entries(update.$inc || {})) doc[k] = (doc[k] || 0) + v;
            Object.assign(doc, update.$set || {});
            return { result: { matchedCount: 1 } };
          },
        };
      },
    },
  },
};

function reset() {
  photos = [];
  writeFail = false;
}

// ---- 1. 查询条件结构 ----
(async () => {
{
  const q = photoProcess.pendingQuery();
  assert.strictEqual(q.verified, true, '必须限定 verified');
  assert.ok(Array.isArray(q.$or) && q.$or.length === 2, '$or 需包含「字段不存在」与「小于上限」两支');
  assert.deepStrictEqual(q.$or[0], { photo_process_retry: { $exists: false } });
  assert.deepStrictEqual(q.$or[1], { photo_process_retry: { $lt: MAX } });
  console.log('1. pendingQuery 结构 OK（$or + $exists + $lt %d）', MAX);
}

// ---- 2. 筛选语义 ----
{
  reset();
  photos = [
    { _id: 'a', verified: true, photo_compressed: undefined },            // 新图，无 retry 字段 → 入选
    { _id: 'b', verified: true, photo_compressed: '', photo_process_retry: 2 }, // 未到上限 → 入选
    { _id: 'c', verified: true, photo_compressed: '', photo_process_retry: 3 }, // 到上限 → 落选
    { _id: 'd', verified: false, photo_compressed: '' },                  // 未审核 → 落选
    { _id: 'e', verified: true, photo_compressed: 'https://x/a.jpg' },    // 已处理 → 落选
    { _id: 'f', verified: true, photo_compressed: '', photo_process_retry: 0 }, // 入选
  ];
  const { result } = await ctx.mpserverless.db.collection('photo').find(photoProcess.pendingQuery(), { limit: BATCH_SIZE });
  assert.deepStrictEqual(result.map(p => p._id), ['a', 'b', 'f']);
  console.log('2. 筛选语义 OK：新图/未到上限入选，到上限/未审核/已处理落选');
}

// ---- 3. 连续失败后从候选消失，新照片排得进来 ----
{
  reset();
  for (let i = 0; i < BATCH_SIZE; i++) {
    photos.push({ _id: `bad${i}`, verified: true, photo_compressed: '' });
  }
  photos.push({ _id: 'zzz_new', verified: true, photo_compressed: '' });

  const rounds = [];
  for (let round = 1; round <= MAX + 1; round++) {
    const { result: batch } = await ctx.mpserverless.db.collection('photo').find(photoProcess.pendingQuery(), { limit: BATCH_SIZE });
    rounds.push(batch.map(p => p._id));
    // 全部失败
    for (const p of batch) await photoProcess.markFailed(ctx, p._id, new Error('COS 404'));
  }

  // 前三轮都是 6 张坏图（新图被挤在外面）
  for (let i = 0; i < MAX; i++) {
    assert.strictEqual(rounds[i].length, BATCH_SIZE, `第 ${i + 1} 轮应满批`);
    assert.ok(!rounds[i].includes('zzz_new'), `第 ${i + 1} 轮不该轮到新图`);
  }
  // 第 4 轮：坏图全部达到上限被排除，新图终于排进来
  assert.deepStrictEqual(rounds[MAX], ['zzz_new'], `第 ${MAX + 1} 轮应只剩新图，实际 ${rounds[MAX]}`);
  assert.strictEqual(photos.find(p => p._id === 'bad0').photo_process_retry, MAX);
  assert.strictEqual(photos.find(p => p._id === 'bad0').photo_process_error, 'COS 404');
  console.log('3. 坏图淘汰 OK：3 轮后新图排入候选，坏图留在库里带错误信息');
}

// ---- 4. 记账失败不冒泡 ----
{
  reset();
  photos = [{ _id: 'x', verified: true, photo_compressed: '' }];
  writeFail = true;
  await photoProcess.markFailed(ctx, 'x', new Error('boom')); // 不应抛
  console.log('4. 记账失败不中断主流程 OK');
}

console.log('\n全部通过');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
