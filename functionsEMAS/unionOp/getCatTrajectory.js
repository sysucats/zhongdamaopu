module.exports = async (ctx) => {
  const { cat_id } = ctx.args || {};
  if (!cat_id) {
    return { success: false, errMsg: 'missing cat_id' };
  }

  // 从 photo 表读取该猫所有带定位的过审照片（未删除：deleted !== 1）
  // 去重：相同 shooting_date + 相同坐标 视为同一个位置点
  const { result: points } = await ctx.mpserverless.db.collection('photo')
    .aggregate([
      { $match: {
        cat_id,
        verified: true,
        deleted: { $ne: 1 },
        latitude:  { $ne: null },
        longitude: { $ne: null }
      }},
      { $sort: { shooting_date: 1 } },
      { $group: {
        _id: {
          date: '$shooting_date',
          lat:  '$latitude',
          lng:  '$longitude'
        },
        latitude:         { $first: '$latitude' },
        longitude:        { $first: '$longitude' },
        location_time:    { $first: '$shooting_date' },
        uid:              { $first: '$user_id' },
        photo_id:         { $first: '$photo_id' },
        photo_compressed: { $first: '$photo_compressed' },
        photographer:     { $first: '$photographer' }
      }},
      { $sort: { location_time: 1 } },
      { $project: {
        _id: 0,
        latitude: 1,
        longitude: 1,
        location_time: 1,
        uid: 1,
        photo_id: 1,
        photo_compressed: 1,
        photographer: 1
      }}
    ]);

  if (!points || points.length === 0) {
    return { success: true, data: [] };
  }

  return { success: true, data: points };
};
