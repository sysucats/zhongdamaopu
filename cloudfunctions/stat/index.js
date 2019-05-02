// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init()

// 云函数入口函数
const db = cloud.database()
const MAX_LIMIT = 100

function getStat(all_reward) {
  var stat = {};
  for (const r of all_reward.data) {
    if (stat[r.nickname] === undefined) {
      stat[r.nickname] = r.money;
    } else {
      stat[r.nickname] += r.money;
    }
  }
  return stat;
}

exports.main = async (event, context) => {
  // 先取出集合记录总数
  const countResult = await db.collection('reward').count()
  const total = countResult.total
  // 计算需分几次取
  const batchTimes = Math.ceil(total / 100)
  // 承载所有读操作的 promise 的数组
  const tasks = []
  for (let i = 0; i < batchTimes; i++) {
    const promise = db.collection('reward').skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
    tasks.push(promise)
  }
  // 等待所有
  const all_reward = (await Promise.all(tasks)).reduce((acc, cur) => ({
    data: acc.data.concat(cur.data),
    errMsg: acc.errMsg,
  }));
  
  const today = Date.now();
  const stat = getStat(all_reward);
  return await db.collection('reward_stat').add({ data: { stat, mdate: today } });

}