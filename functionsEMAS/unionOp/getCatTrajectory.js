module.exports = async (ctx) => {
  const { cat_id } = ctx.args || {};
  if (!cat_id) {
    return { success: false, errMsg: 'missing cat_id' };
  }

  // 从 photo 表读取该猫所有带定位的过审照片（未删除：deleted !== 1）
  // 不在聚合管道里做坐标取整（$trunc 在 EMAS mpserverless 不支持），
  // 改为取出原始数据后在 JS 里按「日期(YYYY-MM-DD) + 坐标四舍五入到 5 位小数」去重
  const { result: rawPoints } = await ctx.mpserverless.db.collection('photo')
    .aggregate([
      { $match: {
        cat_id,
        verified: true,
        deleted: { $ne: 1 },
        latitude:  { $ne: null },
        longitude: { $ne: null }
      }},
      { $sort: { shooting_date: 1, _id: 1 } },
      { $project: {
        _id: 0,
        latitude: 1,
        longitude: 1,
        location_time: '$shooting_date',
        uid: '$user_id',
        photo_id: 1,
        photo_compressed: 1,
        photographer: 1
      }}
    ]);

  if (!rawPoints || rawPoints.length === 0) {
    return { success: true, data: [] };
  }

  // JS 端去重：同一日期(YYYY-MM-DD 前10位) + 坐标四舍五入到 5 位小数(约1米) 视为同一轨迹点
  // rawPoints 已按 shooting_date 正序，同一组的第一个即为最早记录
  const seen = new Set();
  const points = [];
  for (const p of rawPoints) {
    const dateKey = (p.location_time || '').substring(0, 10);
    const latKey = Math.round((p.latitude  || 0) * 100000);
    const lngKey = Math.round((p.longitude || 0) * 100000);
    const key = `${dateKey}|${latKey}|${lngKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(p);
  }

  return { success: true, data: points };
};
