// 更新一只猫的评分

import cloud from '@lafjs/cloud'

const db = cloud.database();
const _ = db.command.aggregate;

function calculateAverage(arr) {
  console.log(arr);
  const sum = arr.reduce((acc, curr) => acc + curr, 0);
  return sum / arr.length;
}

export default async function (ctx: FunctionContext) {
  // body 为请求参数, user 是授权对象
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  let {cat_id} = body;

  // 统计数量
  let count = (await db.collection('rating').where({cat_id}).count()).total;

  // 聚合结果
  const { data } = await db.collection('rating').aggregate()
    .match({ cat_id })
    .group({
      _id: null, // 表示不按任何字段分组，即整个数据表作为一组
      r1: _.avg('$r1'),  // 计算字段'r1'的平均值
      r2: _.avg('$r2'),  // 计算字段'r2'的平均值
      r3: _.avg('$r3'),  // 计算字段'r3'的平均值
      r4: _.avg('$r4'),  // 计算字段'r4'的平均值
      r5: _.avg('$r5')   // 计算字段'r5'的平均值
    })
    .project({
      _id: 0
    })
    .end();

  console.log(data);

  let avgScore = calculateAverage([data[0].r1, data[0].r2, data[0].r3, data[0].r4, data[0].r5]);

  let rating = {
    count,
    scores: data[0],
    avgScore,
    avgScoreDisp: avgScore.toFixed(1),
  }

  console.log(rating);

  await db.collection('cat').doc(cat_id).update({
    rating
  })
  return { data: 'hi, laf' }
}
