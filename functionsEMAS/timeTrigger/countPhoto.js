module.exports = async (ctx) => {
  var frontOneHour = new Date(new Date().getTime() - 1 * 60 * 60 * 1000);

  const query = {
    $or: [{
        photo_count_best: {
          $exists: false
        }
      },
      {
        mphoto: {
          $gte: frontOneHour
        }
      }
    ],
    deleted: { $ne: 1 }
  };

  const {
    result: total
  } = await ctx.mpserverless.db.collection('cat').count(query);
  if (!total) return {};

  const MAX_LIMIT = 100;
  const batchTimes = Math.ceil(total / MAX_LIMIT);
  const tasks = [];

  for (let i = 0; i < batchTimes; i++) {
    const promise = ctx.mpserverless.db.collection('cat').find(
      query, {
        skip: i * MAX_LIMIT,
        limit: MAX_LIMIT,
        projection: {
          _id: 1
        }
      }
    );
    tasks.push(promise);
  }

  const results = await Promise.all(tasks);
  const cats = {
    data: results.flatMap(r => r.result.map(cat => ({ _id: cat._id }))),
    errMsg: ''
  };

  const stats = [];
  for (const cat of cats.data) {
    const [bestCountRes, totalCountRes] = await Promise.all([
      ctx.mpserverless.db.collection('photo').count({
        cat_id: cat._id,
        best: true,
        verified: true
      }),
      ctx.mpserverless.db.collection('photo').count({
        cat_id: cat._id,
        verified: true
      })
    ]);

    const updateRes = await ctx.mpserverless.db.collection('cat').updateOne({
      _id: cat._id
    }, {
      $set: {
        photo_count_best: bestCountRes.result,
        photo_count_total: totalCountRes.result
      }
    });

    stats.push({
      ...updateRes,
      cat_id: cat._id
    });
  }

  return {
    cats: cats.data,
    stats
  };
};
