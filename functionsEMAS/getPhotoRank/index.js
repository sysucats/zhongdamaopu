module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    return "v2.1";
  }

  const MAX_LIMIT = 100;
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  const {
    result: countResult
  } = await ctx.mpserverless.db.collection('photo').count({
    mdate: {
      $gt: firstDay
    },
    verified: true
  });

  const batchTimes = Math.ceil(countResult / MAX_LIMIT);
  const photosPromises = [];

  // 添加投影设置只返回_openid字段
  const queryOptions = {
    projection: {
      _openid: 1,
      _id: 0
    } // 只获取_openid，禁止获取_id
  };

  for (let i = 0; i < batchTimes; i++) {
    photosPromises.push(
      ctx.mpserverless.db.collection('photo').find({
        mdate: {
          $gt: firstDay
        },
        verified: true
      }, {
        ...queryOptions,
        skip: i * MAX_LIMIT,
        limit: MAX_LIMIT
      }).then(res => res.result)
    );
  }

  const all_promise = await Promise.all(photosPromises);

  if (!all_promise.length) {
    return {
      all_photos: [],
      stat: {}
    };
  }

  const all_photos = all_promise.flat();
  const stat = getStat(all_photos);

  await ctx.mpserverless.db.collection('photo_rank').insertOne({
    stat,
    mdate: today
  });

  await removeOld();

  return ;

  function getStat(photos) {
    const stat = {};
    for (const ph of photos) {
      const key = ph._openid;
      if (!key) continue;

      if (stat[key] === undefined) {
        stat[key] = {
          count: 1
        }
      } else {
        stat[key].count++;
      }
    }
    return stat;
  }

  async function removeOld() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    await ctx.mpserverless.db.collection('photo_rank').deleteMany({
      mdate: {
        $lt: weekAgo
      }
    });
  }
}