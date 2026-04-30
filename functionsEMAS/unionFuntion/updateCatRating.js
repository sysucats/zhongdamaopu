module.exports = async (ctx) => {
  let {
    cat_id
  } = ctx.args

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
          _id: null,
          r1: {
            $avg: '$r1'
          },
          r2: {
            $avg: '$r2'
          },
          r3: {
            $avg: '$r3'
          },
          r4: {
            $avg: '$r4'
          },
          r5: {
            $avg: '$r5'
          }
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
