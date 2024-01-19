// countPhoto 数猫图，计算一下每个猫的精选图有多少个，方便首页随机用

import cloud from '@lafjs/cloud'
const db = cloud.database();
const _ = db.command;
const MAX_LIMIT = 100;


export async function countPhoto () {
  // 先取出 mphoto 更新时间为一小时前的猫猫（因为每小时自动执行一次）
  var frontOneHour = new Date(new Date().getTime() - 1 * 60 * 60 * 1000);
  var condition = _.or([{
    photo_count_best: _.exists(false)
  }, {
    mphoto: _.gte(frontOneHour)
  }]);
  const countResult = await db.collection('cat').where(condition).count();
  const total = countResult.total;
  if (!total) {
    return {};
  }
  // 计算需分几次取
  const batchTimes = Math.ceil(total / 100);
  // 承载所有读操作的 promise 的数组
  const tasks = []
  for (let i = 0; i < batchTimes; i++) {
    const promise = db.collection('cat').where(condition).skip(i * MAX_LIMIT).limit(MAX_LIMIT).get();
    tasks.push(promise);
  }
  // 等待所有
  const cats = (await Promise.all(tasks)).reduce((acc, cur) => ({
    data: acc.data.concat(cur.data),
    errMsg: acc.errMsg,
  })).data;

  // 下面开始获取每只猫的精选图片数量
  var stats = []; // 没啥用的东西，返回给前端看看
  for (const cat of cats) {
    const count_best = (await db.collection('photo').where({ cat_id: cat._id, best: true, verified: true }).count()).total;
    const count_total = (await db.collection('photo').where({ cat_id: cat._id, verified: true }).count()).total;
    var stat = await db.collection('cat').doc(cat._id).update({
      // TODO: 过渡一下，后续清理数据库中的残留photo_count字段
      // photo_count: count_best,
      photo_count_best: count_best,
      photo_count_total: count_total
    });
    stat.cat_id = cat._id;
    stats.push(stat);
  }
  const res = { cats: cats, stats: stats };
  console.log(res);
  return res;
}


export default async function (ctx: FunctionContext) {
  const { body } = ctx;

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.1";
  }

  return await countPhoto();
}

