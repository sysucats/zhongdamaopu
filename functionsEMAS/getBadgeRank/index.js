module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    return "v2.1";
  }

  let rank = await getRank();
  // 写入数据库
  await ctx.mpserverless.db.collection("badge_rank").insertOne({
    mdate: new Date(),
    rankV2: rank,
  });
  // 清理旧数据
  await removeOld();

  // 通用查询函数添加投影支持
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

  // 徽章分数映射
  async function getBadgeScoreMap() {
    const levelScoreMap = {
      'S': 5,
      'A': 3,
      'B': 2,
      'C': 1,
    }
    // 优化：只读取_id和level字段
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

  // 统计函数优化字段选择
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
      // 优化：只投影必要字段
      {
        $project: {
          catId: 1,
          badgeDef: 1,
          ...(idScoreMap ? {
            _id: 0
          } : {}) // 仅当需要转换分数时排除_id
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

  // 徽章排行统计优化
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
      // 优化：只投影必要字段
      {
        $project: {
          catId: 1,
          badgeDef: 1,
          ...(idScoreMap ? {
            _id: 0
          } : {}) // 仅当需要转换分数时排除_id
        }
      },
      ...(idScoreMap ? [{
        $addFields: {
          score: 1
        } // 此处score字段实际未使用，但保持结构一致
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

    // 分组整理数据
    const res = {};
    for (const d of data) {
      (res[d.badgeDef] || (res[d.badgeDef] = {}))[d.catId] = d.total;
    }

    // 获取每个徽章的TopN
    for (const badgeDef in res) {
      res[badgeDef] = getDictTopN(res[badgeDef], maxRankCount);
    }

    return res;
  }

  // 主排行获取函数
  async function getRank() {
    // 优化：只读取必要字段
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

  // 工具函数保持不变
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