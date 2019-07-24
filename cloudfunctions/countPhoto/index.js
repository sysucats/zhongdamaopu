// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()
const _ = db.command
const MAX_LIMIT = 100

// 这个函数称为数猫图，意思是计算一下每个猫的精选图有多少个，方便首页随机用
exports.main = async (event, context) => {
  // 先取出mphoto更新时间为一小时前的猫猫（因为每小时自动执行一次）
  var frontOneHour = new Date(new Date().getTime() - 1 * 60 * 60 * 1000);
  const countResult = await db.collection('cat').where({ mphoto: _.gte(frontOneHour) }).count()
  const total = countResult.total;
  if (!total) {
    return {};
  }
  // 计算需分几次取
  const batchTimes = Math.ceil(total / 100)
  // 承载所有读操作的 promise 的数组
  const tasks = []
  for (let i = 0; i < batchTimes; i++) {
    const promise = db.collection('cat').where({ mphoto: _.gte(frontOneHour) }).skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
    tasks.push(promise)
  }
  // 等待所有
  const cats = (await Promise.all(tasks)).reduce((acc, cur) => ({
    data: acc.data.concat(cur.data),
    errMsg: acc.errMsg,
  })).data;

  // 下面开始获取每只猫的精选图片数量
  var stats = []; // 没啥用的东西，返回给前端看看
  for (const cat of cats) {
    const count = (await db.collection('photo').where({ cat_id: cat._id, best: true, verified: true }).count()).total;
    var stat = await db.collection('cat').doc(cat._id).update({
      data: {
        photo_count: count
      }
    });
    stat.cat_id = cat._id;
    stats.push(stat);
  }

  return {cats: cats, stats: stats};
}