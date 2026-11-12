// 统计猫的照片数：photo_count_best（精选）/ photo_count_total（审核通过总数）
//
// 原实现逐只猫 2 次 count + 1 次 update，猫多时随数量线性放大；且定时器 5 分钟一轮、
// 筛选窗口是「mphoto 近 1 小时」，导致同一次照片变更在一小时内被重复重算约 12 次。
//
// 现改为：
//   1. 一次捞出候选猫（只取判定字段），用 photo_count_at 水位判断哪些真的需要重算；
//   2. 按批 $group 聚合，一次拿到整批猫的计数（与原两次 count 条件严格一致）；
//   3. 并发回写，回写时记录 photo_count_at，避免同一变更被反复重算。
// photo_count_at 是计数水位（不可由其他字段推导），不是业务数据。
const LOOKBACK_MS = 60 * 60 * 1000;
const MAX_CATS = 200;          // 单轮最多处理多少只，剩余留给下一轮
const IDS_PER_AGG = 200;       // 单次聚合的 cat_id 数量
const WRITE_CONCURRENCY = 10;  // 并发回写数

module.exports = async (ctx) => {
  const db = ctx.mpserverless.db;
  const since = new Date(Date.now() - LOOKBACK_MS);
  const query = {
    $or: [
      { photo_count_best: { $exists: false } },
      { mphoto: { $gte: since } },
    ],
    deleted: { $ne: 1 },
  };

  // 分批捞候选，期间不写库，避免 skip 分页因文档被更新而漏读
  const candidates = [];
  while (candidates.length < MAX_CATS) {
    const limit = Math.min(100, MAX_CATS - candidates.length);
    const { result } = await db.collection('cat').find(query, {
      projection: { _id: 1, mphoto: 1, photo_count_at: 1, photo_count_best: 1 },
      skip: candidates.length,
      limit,
    });
    if (!result || !result.length) break;
    candidates.push(...result);
    if (result.length < limit) break;
  }
  if (!candidates.length) return { checked: 0, updated: 0 };

  // 字段缺失的补一次；有 mphoto 变更的，只有水位落后于 mphoto 才重算
  const dirty = candidates.filter(cat => {
    if (cat.photo_count_best === undefined) return true;
    if (!cat.mphoto) return false;
    return !cat.photo_count_at || new Date(cat.photo_count_at) < new Date(cat.mphoto);
  });
  if (!dirty.length) return { checked: candidates.length, updated: 0 };

  const bestCounts = new Map(), totalCounts = new Map();
  for (let i = 0; i < dirty.length; i += IDS_PER_AGG) {
    const ids = dirty.slice(i, i + IDS_PER_AGG).map(cat => cat._id);
    const [bestRes, totalRes] = await Promise.all([
      db.collection('photo').aggregate([
        { $match: { cat_id: { $in: ids }, best: true, verified: true } },
        { $group: { _id: '$cat_id', n: { $sum: 1 } } },
      ]),
      db.collection('photo').aggregate([
        { $match: { cat_id: { $in: ids }, verified: true } },
        { $group: { _id: '$cat_id', n: { $sum: 1 } } },
      ]),
    ]);
    for (const row of bestRes.result || []) bestCounts.set(row._id, row.n);
    for (const row of totalRes.result || []) totalCounts.set(row._id, row.n);
  }

  const now = new Date();
  let updated = 0;
  for (let i = 0; i < dirty.length; i += WRITE_CONCURRENCY) {
    const slice = dirty.slice(i, i + WRITE_CONCURRENCY);
    const results = await Promise.all(slice.map(cat => db.collection('cat').updateOne(
      { _id: cat._id },
      { $set: {
        photo_count_best: bestCounts.get(cat._id) || 0,
        photo_count_total: totalCounts.get(cat._id) || 0,
        photo_count_at: now,
      } }
    ).catch(error => {
      console.error('[countPhoto] update fail', cat._id, error);
      return null;
    })));
    updated += results.filter(Boolean).length;
  }

  return { checked: candidates.length, updated };
};
