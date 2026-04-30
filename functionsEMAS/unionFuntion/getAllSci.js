const MAX_LIMIT = 100

module.exports = async (ctx) => {
  const {
    result: total
  } = await ctx.mpserverless.db.collection('science').count({});
  const batchTimes = Math.ceil(total / 100);
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
  return (await Promise.all(tasks)).reduce((acc, cur) => ({
    data: acc.data.concat(cur.data),
    errMsg: acc.errMsg,
  }));
}
