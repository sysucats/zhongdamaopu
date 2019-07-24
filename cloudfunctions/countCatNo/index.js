// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()
const _ = db.command
const MAX_LIMIT = 100

// 这个函数称为数猫图，意思是计算一下每个猫的精选图有多少个，方便首页随机用
exports.main = async (event, context) => {
  const countResult = await db.collection('cat').count()
  const total = countResult.total;
  if (!total) {
    return {};
  }
  // 计算需分几次取
  const batchTimes = Math.ceil(total / 100)
  // 承载所有读操作的 promise 的数组
  const tasks = []
  for (let i = 0; i < batchTimes; i++) {
    const promise = db.collection('cat').skip(i * MAX_LIMIT).limit(MAX_LIMIT).get()
    tasks.push(promise)
  }
  // 等待所有
  const cats = (await Promise.all(tasks)).reduce((acc, cur) => ({
    data: acc.data.concat(cur.data),
    errMsg: acc.errMsg,
  })).data;

  // 下面开始给每只猫猫赋一个_no
  var c = 0;
  for (const cat of cats) {
    if (!cat._no) {
      await db.collection('cat').doc(cat._id).update({
        data: {
          _no: 'c' + c
        }
      });
    }
    c ++;
  }

  return { cats: cats.length };
}