import cloud from '@lafjs/cloud'
import { getNDaysAgo, getDictTopN } from '@/utils'

const db = cloud.database();
const dbCmd = db.command
const $ = db.command.aggregate

// 徽章分数
const levelScoreMap = {
  'S': 5,
  'A': 3,
  'B': 2,
  'C': 1,
}
// 每个榜单最大数量
const maxRankCount = 20;

async function getAllRecords(coll: string, cond: Object) {
  const db = cloud.database();
  let res = (await db.collection(coll).where(cond).get()).data;
  if (res.length < 100) {
    // 不超过100条，一次能取完
    return res;
  }

  const count = (await db.collection(coll).where(cond).count()).total;
  while (res.length < count) {
    const tmp = (await db.collection(coll).where(cond).skip(res.length).get()).data;
    res = res.concat(tmp);
  }

  return res;
}


async function getBadgeScoreMap() {
  // 获取徽章定义
  const badgeDefs = await getAllRecords("badge_def", {});
  if (badgeDefs.length === 0) {
    // 还没有徽章定义
    return null;
  }
  let badgeScoreMap = [];
  for (const bd of badgeDefs) {
    badgeScoreMap.push({
      case: { $eq: ["$badgeDef", bd._id] }, then: levelScoreMap[bd.level]
    })
  }
  return badgeScoreMap;
}

async function _buildBase(nDaysAgo: number) {
  const idScoreMap = await getBadgeScoreMap();

  let base = db.collection('badge').aggregate()
    .match(dbCmd.expr($.neq(['$catId', null])));

  if (nDaysAgo !== 0) {
    base = base.match(dbCmd.expr($.gte(['$givenTime', getNDaysAgo(nDaysAgo)])));
  }

  base = base.project({
    "catId": 1,
    "givenTime": 1,
    "badgeDef": 1,
  })
    .addFields({
      score: {
        $switch: {
          branches: idScoreMap,
          default: 0
        }
      }
    })

  return base;
}

// 统计总数量、总价值榜
async function getTotalRank(nDaysAgo: number, sumScore: boolean) {
  let base = await _buildBase(nDaysAgo);
  let sumField = sumScore ? '$score' : 1;
  let { data } = await base
    .group({
      _id: "$catId",
      total: $.sum(sumField)
    })
    .sort({
      total: -1
    })
    .limit(maxRankCount)
    .end();

  // 整理返回格式为_id: number
  let res = {};
  for (const d of data) {
    res[d._id] = d.total
  }

  return res;
}


// 统计每个徽章的排行榜
async function getBadgeRank(nDaysAgo: number) {
  let base = await _buildBase(nDaysAgo);
  let { data } = await base
    .group({
      _id: {
        badgeDef: "$badgeDef",
        catId: "$catId",
      },
      total: $.sum(1)
    })
    .project({
      _id: 0,
      badgeDef: "$_id.badgeDef",
      catId: "$_id.catId",
      total: 1,
    })
    .end();

  console.log(data.length);

  // 整理返回格式为 badgeDef: { catId: number }
  let res = {};
  for (const d of data) {
    if (!res[d.badgeDef]) {
      res[d.badgeDef] = {}
    }
    res[d.badgeDef][d.catId] = d.total
  }

  for (const badgeDef in res) {
    res[badgeDef] = getDictTopN(res[badgeDef], maxRankCount)
  }

  return res;
}

// 统计所有需要的表
async function getRank() {
  // 获取徽章定义
  const badgeDefs = await getAllRecords("badge_def", {});
  if (badgeDefs.length === 0) {
    // 还没有徽章定义
    return {};
  }

  let stat = {};
  // 季度、半年、整年、总榜
  for (const nDaysAgo of [90, 180, 365]) {
    // 先获取各个徽章的统计
    stat[nDaysAgo] = await getBadgeRank(nDaysAgo);
    // 再获取总数量、总分数的统计
    stat[nDaysAgo]['count'] = await getTotalRank(nDaysAgo, false);
    stat[nDaysAgo]['score'] = await getTotalRank(nDaysAgo, true);
  }
  return stat;
}


// 删除旧的
async function removeOld() {
  const db = cloud.database();
  const _ = db.command;

  const res = await db.collection('badge_rank')
    .where({ mdate: _.lt(getNDaysAgo(1)) })
    .remove({ multi: true });
  console.log("remove old", res);
}


export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.2";
  }

  let rank = await getRank();
  // 写入数据库
  const record = {
    mdate: new Date(),
    rank: rank[365],  // 兼容旧版前端
    rankV2: rank,
  }
  db.collection("badge_rank").add(record);
  // 清理旧数据
  await removeOld();
}
