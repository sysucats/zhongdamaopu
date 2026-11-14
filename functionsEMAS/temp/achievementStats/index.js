// 一次性统计（只读）：成就五指标的用户分布，用于按百分位校准徽章阈值
// 部署为云函数 achievementStats，EMAS 控制台测试调用（参数 {}），拿到的结果回填《成就徽章设计方案.md》
module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) return 'v1.0';
  const db = ctx.mpserverless.db;
  const PAGE = 100;
  const AGG_PAGE = 1000;

  async function userMetricCounts() {
    const { result: total } = await db.collection('user').count({});
    const views = [], follows = [];
    for (let skip = 0; skip < total; skip += PAGE) {
      const { result: rows } = await db.collection('user').find({}, { projection: { viewedCats: 1, followCats: 1 }, skip, limit: PAGE });
      if (!rows?.length) break;
      for (const user of rows) {
        views.push(new Set((user.viewedCats || []).filter(Boolean)).size);
        follows.push(new Set((user.followCats || []).filter(Boolean)).size);
      }
    }
    return { total, views, follows };
  }

  // 按用户聚合计数；优先分页防截断，$skip 不可用时整批兜底
  async function groupedCounts(name, match) {
    const rows = [];
    try {
      while (true) {
        const { result: page } = await db.collection(name).aggregate([
          { $match: match },
          { $group: { _id: '$_openid', n: { $sum: 1 } } },
          { $sort: { _id: 1 } },
          { $skip: rows.length },
          { $limit: AGG_PAGE },
        ]);
        if (!page?.length) break;
        rows.push(...page);
        if (page.length < AGG_PAGE) break;
      }
    } catch (error) {
      const { result } = await db.collection(name).aggregate([
        { $match: match },
        { $group: { _id: '$_openid', n: { $sum: 1 } } },
      ]);
      rows.length = 0;
      rows.push(...(result || []));
    }
    return rows.map(row => row.n);
  }

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
  }

  function stat(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const active = sorted.filter(v => v > 0);
    const ps = list => ({ p10: percentile(list, 10), p25: percentile(list, 25), p50: percentile(list, 50), p75: percentile(list, 75), p90: percentile(list, 90), p95: percentile(list, 95), p99: percentile(list, 99) });
    return {
      n: sorted.length,
      active: active.length,
      max: sorted.length ? sorted[sorted.length - 1] : 0,
      mean: sorted.length ? Number((sorted.reduce((s, v) => s + v, 0) / sorted.length).toFixed(1)) : 0,
      all: ps(sorted),
      activeOnly: active.length ? ps(active) : null,
    };
  }

  function pad(values, total) {
    return [...values, ...new Array(Math.max(0, total - values.length)).fill(0)];
  }

  const commentMatch = {
    $or: [
      { approvedOnce: true },
      { review_action: 'pass' },
      { needVerify: { $ne: true }, deleted: { $ne: true }, review_action: { $ne: 'delete' } },
    ],
  };

  const [users, photo, comment, like, catTotal, catAlive] = await Promise.all([
    userMetricCounts(),
    groupedCounts('photo', { verified: true }),
    groupedCounts('comment', commentMatch),
    groupedCounts('inter', { type: 10000 }),
    db.collection('cat').count({}),
    db.collection('cat').count({ deleted: { $ne: 1 } }),
  ]);

  return {
    ok: true,
    cat: { total: catTotal.result, alive: catAlive.result },
    users: users.total,
    metrics: {
      view: stat(users.views),
      follow: stat(users.follows),
      photo: stat(pad(photo, users.total)),
      comment: stat(pad(comment, users.total)),
      like: stat(pad(like, users.total)),
    },
  };
};
