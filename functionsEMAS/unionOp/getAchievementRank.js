// 成就数量排行榜：按解锁成就数排出前 200 名
// 注：$limit 直接截断，末尾同分的人会按 openid 字典序被砍掉一部分（并列名次不完整），当前用户量下不处理
// RANK_LIMIT 与前端 components/achievementRank/achievementRank.wxml 的「200名外」文案保持一致
const RANK_LIMIT = 200;

module.exports = async (ctx) => {
  // 1. 按获得记录统计数量，同分按 openid 稳定排序。
  const { result: grouped } = await ctx.mpserverless.db.collection('achievement')
    .aggregate([
      { $group: { _id: '$openid', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: RANK_LIMIT },
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
  const score = info => Number(Boolean(info?.nickName)) * 2 + Number(Boolean(info?.avatarUrl));
  (users || []).forEach(u => {
    const info = u.userInfo || {};
    if (!userMap[u.openid] || score(info) > score(userMap[u.openid])) userMap[u.openid] = info;
  });

  // 3. 同数量并列，后续名次按人数跳位（例如 1、1、3、4）。
  let rank = 0;
  const data = grouped.map((g, i) => {
    if (i === 0 || g.count !== grouped[i - 1].count) {
      rank = i + 1;
    }
    return {
      openid: g._id,
      count: g.count,
      rank,
      nickName: userMap[g._id]?.nickName || '神秘猫友',
      avatarUrl: userMap[g._id]?.avatarUrl || '',
    };
  });

  return { success: true, data };
};
