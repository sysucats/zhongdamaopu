module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  const MAX_LIMIT = 100
  // 先取出集合记录总数
  const {
    result: total
  } = await ctx.mpserverless.db.collection('science').count({});
  // 计算需分几次取
  const batchTimes = Math.ceil(total / 100);
  // 承载所有读操作的 promise 的数组
  const tasks = [];
  for (let i = 0; i < batchTimes; i++) {
    const {
      result: promise
    } = await ctx.mpserverless.db.collection('science').find({}, {
      skip: i * MAX_LIMIT,
      limit: MAX_LIMIT
    });
    tasks.push(promise);
  }
  // 等待所有
  return (await Promise.all(tasks)).reduce((acc, cur) => ({
    data: acc.data.concat(cur.data),
    errMsg: acc.errMsg,
  }));
}