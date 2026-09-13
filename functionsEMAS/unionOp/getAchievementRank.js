// 成就数量排行榜：按解锁成就数排出前 50 名
module.exports = async (ctx) => {
  // 1. 按 openid 聚合成就数量（旧版 key 和新版 key 一条记录算一个成就，不做映射去重，差异可忽略）
  const { result: grouped } = await ctx.mpserverless.db.collection('achievement')
    .aggregate([
      { $group: { _id: '$openid', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]);

  if (!grouped || grouped.length === 0) {
    return { success: true, data: [] };
  }

  // 2. 查用户信息
  const openids = grouped.map(g => g._id);
  const { result: users } = await ctx.mpserverless.db.collection('user').find(
    { openid: { $in: openids } },
    { projection: { openid: 1, userInfo: 1 } }
  );
  const userMap = {};
  (users || []).forEach(u => { userMap[u.openid] = u.userInfo || {}; });

  // 3. 合并结果
  const data = grouped.map((g, i) => ({
    openid: g._id,
    count: g.count,
    rank: i + 1,
    nickName: userMap[g._id]?.nickName || '神秘猫友',
    avatarUrl: userMap[g._id]?.avatarUrl || '',
  }));

  return { success: true, data };
};
