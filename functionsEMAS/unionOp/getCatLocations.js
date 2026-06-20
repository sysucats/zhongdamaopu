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

  // 2. 每只猫的去重后轨迹点数（相同日期+相同坐标合并）
  const { result: countList } = await ctx.mpserverless.db.collection('photo')
    .aggregate([
      { $match: {
        verified: true,
        deleted: { $ne: 1 },
        latitude:  { $ne: null },
        longitude: { $ne: null }
      }},
      { $group: {
        _id: {
          cat_id: '$cat_id',
          date:    '$shooting_date',
          lat:     '$latitude',
          lng:     '$longitude'
        },
        dummy: { $first: '$cat_id' }
      }},
      { $group: {
        _id:             '$_id.cat_id',
        trajectory_count: { $sum: 1 }
      }}
    ]);
  const countMap = {};
  (countList || []).forEach(c => { countMap[c._id] = c.trajectory_count; });

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
