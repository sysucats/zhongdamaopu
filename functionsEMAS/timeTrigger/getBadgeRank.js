module.exports = async (ctx) => {
  let rank = await getRank();
  await ctx.mpserverless.db.collection("badge_rank").insertOne({
    mdate: new Date(),
    rankV2: rank,
  });
  await removeOld();

  async function getAllRecords(coll, cond, projection = {}) {
    let {
      result
    } = await ctx.mpserverless.db.collection(coll).find(cond, {
      projection
    });
    if (result.length < 100) {
      return result;
    }
    const {
      result: count
    } = (await ctx.mpserverless.db.collection(coll).count(cond));
    while (result.length < count) {
      const {
        result: tmp
      } = await ctx.mpserverless.db.collection(coll).find(cond, {
        skip: result.length,
        projection
      })
      result = result.concat(tmp);
    }
    return result;
  }

  async function getBadgeScoreMap() {
    const levelScoreMap = {
      'S': 5,
      'A': 3,
      'B': 2,
      'C': 1,
    }
    const badgeDefs = await getAllRecords("badge_def", {}, {
      _id: 1,
      level: 1
    });
    if (badgeDefs.length === 0) {
      return null;
    }

    return badgeDefs.map(bd => ({
      case: {
        $eq: ["$badgeDef", bd._id]
      },
      then: levelScoreMap[bd.level]
    }));
  }

  async function getTotalRank(nDaysAgo, sumScore) {
    const maxRankCount = 20;
    const sumField = sumScore ? '$score' : 1;
    const idScoreMap = await getBadgeScoreMap();
    const matchCondition = nDaysAgo !== 0 ?
      {
        catId: {
          $ne: null
        },
        givenTime: {
          $gte: getNDaysAgo(nDaysAgo)
        }
      } :
      {
        catId: {
          $ne: null
        }
      };

    const data = (await ctx.mpserverless.db.collection('badge').aggregate([{
        $match: matchCondition
      },
      {
        $project: {
          catId: 1,
          badgeDef: 1,
          ...(idScoreMap ? {
            _id: 0
          } : {})
        }
      },
      ...(idScoreMap ? [{
        $addFields: {
          score: {
            $switch: {
              branches: idScoreMap,
              default: 0
            }
          }
        }
      }] : []),
      {
        $group: {
          _id: "$catId",
          total: {
            $sum: sumField
          }
        }
      },
      {
        $sort: {
          total: -1
        }
      },
      {
        $limit: maxRankCount
      }
    ])).result;

    return Object.fromEntries(data.map(d => [d._id, d.total]));
  }

  async function getBadgeRank(nDaysAgo) {
    const maxRankCount = 20;
    const idScoreMap = await getBadgeScoreMap();
    const matchCondition = nDaysAgo !== 0 ?
      {
        catId: {
          $ne: null
        },
        givenTime: {
          $gte: getNDaysAgo(nDaysAgo)
        }
      } :
      {
        catId: {
          $ne: null
        }
      };

    const data = (await ctx.mpserverless.db.collection('badge').aggregate([{
        $match: matchCondition
      },
      {
        $project: {
          catId: 1,
          badgeDef: 1,
          ...(idScoreMap ? {
            _id: 0
          } : {})
        }
      },
      ...(idScoreMap ? [{
        $addFields: {
          score: 1
        }
      }] : []),
      {
        $group: {
          _id: {
            badgeDef: "$badgeDef",
            catId: "$catId",
          },
          total: {
            $sum: 1
          }
        }
      },
      {
        $project: {
          _id: 0,
          badgeDef: "$_id.badgeDef",
          catId: "$_id.catId",
          total: 1
        }
      }
    ])).result;

    const res = {};
    for (const d of data) {
      (res[d.badgeDef] || (res[d.badgeDef] = {}))[d.catId] = d.total;
    }

    for (const badgeDef in res) {
      res[badgeDef] = getDictTopN(res[badgeDef], maxRankCount);
    }

    return res;
  }

  async function getRank() {
    const badgeDefs = await getAllRecords("badge_def", {}, {
      _id: 1,
      level: 1
    });
    if (!badgeDefs.length) return {};

    const stat = {};
    for (const nDaysAgo of [90, 180, 365]) {
      stat[nDaysAgo] = {
        ...await getBadgeRank(nDaysAgo),
        count: await getTotalRank(nDaysAgo, false),
        score: await getTotalRank(nDaysAgo, true)
      };
    }
    return stat;
  }

  async function removeOld() {
    await ctx.mpserverless.db.collection('badge_rank').deleteMany({
      mdate: {
        $lt: getNDaysAgo(1)
      }
    });
  }

  function getNDaysAgo(n) {
    return new Date(Date.now() - n * 86400000);
  }

  function getDictTopN(dict, n) {
    return Object.fromEntries(
      Object.entries(dict)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
    );
  }
}
