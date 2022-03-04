// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({env: cloud.DYNAMIC_CURRENT_ENV})
const db = cloud.database()
const _ = db.command
const MAX_LIMIT = 100

// 这个函数称为数猫图，意思是计算一下每个猫的精选图有多少个，方便首页随机用
exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return;
  }
  // 先取出mphoto更新时间为一小时前的猫猫（因为每小时自动执行一次）
  var frontOneHour = new Date(new Date().getTime() - 1 * 60 * 60 * 1000);
  var condition = _.or([{
    photo_count_best: _.exists(false)
  }, {
    mphoto: _.gte(frontOneHour)
  }]);
  const countResult = await db.collection('cat').where(condition).count()
  const total = countResult.total;
  if (!total) {
    return {};
  }
  // 计算需分几次取
  const batchTimes = Math.ceil(total / 100)
  // 承载所有读操作的 promise 的数组
  const tasks = []
  for (let i = 0; i < batchTimes; i++) {
    const promise = db.collection('cat').where(condition).skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
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
    const count_best = (await db.collection('photo').where({ cat_id: cat._id, best: true, verified: true }).count()).total;
    const count_total = (await db.collection('photo').where({ cat_id: cat._id, verified: true }).count()).total;
    var stat = await db.collection('cat').doc(cat._id).update({
      data: {
        // TODO: 过渡一下，后续清理数据库中的残留photo_count字段
        // photo_count: count_best,
        photo_count_best: count_best,
        photo_count_total: count_total
      }
    });
    stat.cat_id = cat._id;
    stats.push(stat);
  }

  return {cats: cats, stats: stats};
}