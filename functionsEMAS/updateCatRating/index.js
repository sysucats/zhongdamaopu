module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  let {
    cat_id
  } = ctx.args

  // 统计数量
  let {
    result: count
  } = await ctx.mpserverless.db.collection('rating').count({
    cat_id: cat_id
  })

  const {
    result: data
  } = await ctx.mpserverless.db.collection('rating')
    .aggregate([{
        $match: {
          cat_id: cat_id
        }
      },
      {
        $group: {
          _id: null, // 表示不按任何字段分组，即整个数据表作为一组 
          r1: {
            $avg: '$r1'
          }, // 计算字段'r1'的平均值 
          r2: {
            $avg: '$r2'
          }, // 计算字段'r2'的平均值 
          r3: {
            $avg: '$r3'
          }, // 计算字段'r3'的平均值 
          r4: {
            $avg: '$r4'
          }, // 计算字段'r4'的平均值 
          r5: {
            $avg: '$r5'
          } // 计算字段'r5'的平均值 
        }
      },
      {
        $project: {
          _id: 0
        }
      }
    ]);

  let avgScore = calculateAverage([data[0].r1, data[0].r2, data[0].r3, data[0].r4, data[0].r5]);

  let rating = {
    count,
    scores: data[0],
    avgScore,
    avgScoreDisp: avgScore.toFixed(1),
  }

  await ctx.mpserverless.db.collection('cat').updateOne({
    _id: cat_id
  }, {
    $set: {
      rating
    }
  })
}

function calculateAverage(arr) {
  const sum = arr.reduce((acc, curr) => acc + curr, 0);
  return sum / arr.length;
}