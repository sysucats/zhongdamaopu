import cloud from '@lafjs/cloud'

const db = cloud.database()
const MAX_LIMIT = 100

export default async function (ctx: FunctionContext) {
  const { body } = ctx;

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }
  // 先取出集合记录总数
  const countResult = await db.collection('science').count();
  const total = countResult.total;
  // 计算需分几次取
  const batchTimes = Math.ceil(total / 100);
  // 承载所有读操作的 promise 的数组
  const tasks = [];
  for (let i = 0; i < batchTimes; i++) {
    const promise = db.collection('science').skip(i * MAX_LIMIT).limit(MAX_LIMIT).get();
    tasks.push(promise);
  }
  // 等待所有
  return (await Promise.all(tasks)).reduce((acc, cur) => ({
    data: acc.data.concat(cur.data),
    errMsg: acc.errMsg,
  }));
}


