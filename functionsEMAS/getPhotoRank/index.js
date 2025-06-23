module.exports = async (ctx) => {
    const MAX_LIMIT = 100;
    // 只取这个月的
    const today = new Date(), y = today.getFullYear(), m = today.getMonth();
    const firstDay = new Date(y, m, 1);

    // 先取出集合记录总数
    const { result: countResult } = await ctx.mpserverless.db.collection('photo').count({ mdate: { $gt: firstDay }, verified: true });

    // 计算需分几次取
    const batchTimes = Math.ceil(countResult / 100);

    // 承载所有读操作的 promise 的数组
    const photos = []
    for (let i = 0; i < batchTimes; i++) {
        const { result: promise } = await ctx.mpserverless.db.collection('photo').find({ mdate: { $gt: firstDay }, verified: true }, { skip: i * MAX_LIMIT, limit: MAX_LIMIT })
        photos.push(promise)
    }
    // 等待所有
    const all_promise = (await Promise.all(photos));
    if (!all_promise.length) {
        console.log("本月还没有照片，直接退出");
        return { all_photos: [], stat: {} };
    }
    // 否则就进行统计
    const all_photos = all_promise.reduce((acc, cur) => acc.concat(cur), []);
    const stat = getStat(all_photos);
    await ctx.mpserverless.db.collection('photo_rank').insertOne({ stat, mdate: today })
    // 删除旧的
    await removeOld();

    return { all_photos: all_photos, stat: stat };

    function getStat(all_photos) {
        var stat = {};
        for (const ph of all_photos) {
            const key = ph._openid;
            if (!key) {
                // 系统直接写入的
                continue;
            }

            // 否则就计数
            if (stat[key] === undefined) {
                stat[key] = {
                    count: 1
                }
            } else {
                stat[key].count++;
            }
        }
        return stat;
    }


    // 删除旧的
    async function removeOld() {
        var weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const res = await ctx.mpserverless.db.collection('photo_rank').deleteMany({ mdate: { $lt: weekAgo } });
        console.log("remove old", res);
    }

}