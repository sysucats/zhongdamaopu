module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    return "v2.1";
  }

  var frontOneHour = new Date(new Date().getTime() - 1 * 60 * 60 * 1000);

  // 查询条件：photo_count_best 不存在或 mphoto 在近1小时内更新
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
    ]
  };

  // 1. 计算符合条件的记录总数
  const {
    result: total
  } = await ctx.mpserverless.db.collection('cat').count(query);
  if (!total) return {};

  // 2. 分批查询记录（只取 _id 字段）
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
        } // 关键优化：只返回 _id 字段
      }
    );
    tasks.push(promise);
  }

  // 3. 合并查询结果（只包含 _id 的数组）
  const results = await Promise.all(tasks);
  const cats = results.reduce((acc, cur) => ({
    data: [...acc.data, ...cur.data.map(cat => ({
      _id: cat._id
    }))],
    errMsg: acc.errMsg
  }), {
    data: []
  });

  // 4. 为每只猫更新精选图片统计
  const stats = [];
  for (const cat of cats.data) {
    // 并行查询两个统计数量
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

    // 更新猫的记录
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
    cats: cats.data, // 只包含 _id 的数组
    stats
  };
};