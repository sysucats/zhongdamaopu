import cloud from '@lafjs/cloud'

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


// 删除旧的
async function removeOld() {
  const db = cloud.database();
  const _ = db.command;

  var weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const res = await db.collection('badge_rank')
    .where({ mdate: _.lt(weekAgo) })
    .remove({ multi: true });
  console.log("remove old", res);
}


function writeRank(rank: Object, badgeDef: string, catId: string, point: number) {
  if (rank[badgeDef] === undefined) {
    rank[badgeDef] = {};
  }
  if (rank[badgeDef][catId] === undefined) {
    rank[badgeDef][catId] = 0;
  }
  rank[badgeDef][catId] += point;
}

export default async function (ctx: FunctionContext) {
  // 返回多个排行榜，固定的有：数量榜、总分榜，动态的有：xx徽章的数量榜
  const db = cloud.database();
  const _ = db.command;
  // 获取徽章定义
  const badgeDefs = await getAllRecords("badge_def", {});
  if (badgeDefs.length === 0) {
    // 还没有徽章定义
    return;
  }
  let badgeDefMap = {};
  for (const bd of badgeDefs) {
    badgeDefMap[bd._id] = bd;
  }
  // 徽章分数
  const scoreMap = {
    'A': 3,
    'B': 2,
    'C': 1,
  }
  // 获取所有已送出的徽章
  const badges = await getAllRecords("badge", { catId: _.neq(null) });
  if (badges.length === 0) {
    console.log("no given badges.");
    return;
  }
  // 遍历一次徽章，分别统计各个榜，结构为：
  // { 榜单id: { catId: count } }
  const rank = {};
  for (const b of badges) {
    // 数量榜
    writeRank(rank, "count", b.catId, 1);
    // 分值榜
    const level = badgeDefMap[b.badgeDef]?.level;
    writeRank(rank, "score", b.catId, scoreMap[level]);
    // 个别徽章榜
    writeRank(rank, b.badgeDef, b.catId, 1);
  }
  // 写入数据库
  const record = {
    mdate: new Date(),
    rank: rank,
  }
  db.collection("badge_rank").add(record);
  // 删除旧的
  await removeOld();
}