module.exports = async (ctx) => {
  // 1. 每只猫最新带定位的过审照片（未删除：deleted !== 1）
  const { result: latestList } = await ctx.mpserverless.db.collection('photo')
    .aggregate([
      { $match: {
        verified: true,
        deleted: { $ne: 1 },
        latitude:  { $ne: null },
        longitude: { $ne: null }
      }},
      { $sort: { shooting_date: -1, _id: -1 } },
      { $group: {
        _id:         '$cat_id',
        latitude:      { $first: '$latitude' },
        longitude:     { $first: '$longitude' },
        location_time: { $first: '$shooting_date' },
        uid:           { $first: '$user_id' },
      }}
    ]);

  if (!latestList || latestList.length === 0) {
    return { success: true, data: [] };
  }

  // 2. 每只猫的去重后轨迹点数
  //    去重规则：同一坐标点（5 位小数 ≈ 1 米精度）+ 同一日期（YYYY-MM-DD）视为同一个轨迹点
  //    不在聚合管道里用 $trunc（EMAS mpserverless 不支持），改为取出原始数据后在 JS 里去重计数
  const { result: allPhotos } = await ctx.mpserverless.db.collection('photo')
    .aggregate([
      { $match: {
        verified: true,
        deleted: { $ne: 1 },
        latitude:  { $ne: null },
        longitude: { $ne: null }
      }},
      { $project: {
        _id: 0,
        cat_id: 1,
        shooting_date: 1,
        latitude: 1,
        longitude: 1
      }}
    ]);
  const countMap = {};
  (allPhotos || []).forEach(p => {
    const cid = p.cat_id;
    if (!cid) return;
    const dateKey = (p.shooting_date || '').substring(0, 10);
    const latKey  = Math.round((p.latitude  || 0) * 100000);
    const lngKey  = Math.round((p.longitude || 0) * 100000);
    const key = `${cid}|${dateKey}|${latKey}|${lngKey}`;
    // 用对象记录每只猫的去重键集合
    if (!countMap[cid]) countMap[cid] = new Set();
    countMap[cid].add(key);
  });
  // Set → 数字
  Object.keys(countMap).forEach(cid => { countMap[cid] = countMap[cid].size; });

  // 3. 查猫基本信息
  const catIds = latestList.map(r => r._id);
  const { result: cats } = await ctx.mpserverless.db.collection('cat').find(
    { _id: { $in: catIds } },
    { projection: {
      name: 1, avatar: 1, mapMarker: 1, campus: 1,
      area: 1, gender: 1, characteristics: 1, habit: 1,
      tutorial: 1, adopt: 1, to_star: 1
    }}
  );
  const catMap = {};
  (cats || []).forEach(c => { catMap[c._id] = c; });

  // 4. 合并结果
  const result = latestList.map(loc => ({
    cat_id:           loc._id,
    latitude:         loc.latitude,
    longitude:        loc.longitude,
    location_time:    loc.location_time,
    uid:              loc.uid,
    trajectory_count: countMap[loc._id] || 0,
    name:             catMap[loc._id]?.name   || '',
    avatar:           catMap[loc._id]?.avatar || '',
    campus:           catMap[loc._id]?.campus || '',
    area:             catMap[loc._id]?.area   || '',
    gender:           catMap[loc._id]?.gender || '',
    characteristics:  catMap[loc._id]?.characteristics || '',
    habit:            catMap[loc._id]?.habit  || '',
    tutorial:         catMap[loc._id]?.tutorial || '',
    adopt:            catMap[loc._id]?.adopt || '0',
    to_star:          catMap[loc._id]?.to_star || false,
  }));

  return { success: true, data: result };
};
