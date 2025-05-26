module.exports = async (ctx) => {
    var frontOneHour = new Date(new Date().getTime() - 1 * 60 * 60 * 1000);
    const { result: total } = await ctx.mpserverless.db.collection('cat').count({
        $or: [
            { photo_count_best: { $exists: false } },
            { mphoto: { $gte: frontOneHour } }
        ]
    });
    if (!total) {
        return {};
    }
    // 计算需分几次取
    const batchTimes = Math.ceil(total / 100);
    // 承载所有读操作的 promise 的数组
    const tasks = []
    const MAX_LIMIT = 100;
    for (let i = 0; i < batchTimes; i++) {
        // const promise = db.collection('cat').where(condition).skip(i * MAX_LIMIT).limit(MAX_LIMIT).get();
        const { result: promise } = await ctx.mpserverless.db.collection('cat').find({
            $or: [
                { photo_count_best: { $exists: false } },
                { mphoto: { $gte: frontOneHour } }
            ]
        }, {
            skip: i * MAX_LIMIT,
            limit: MAX_LIMIT
        }
        )
        tasks.push(promise);
    }
    // 等待所有
    const cats = (await Promise.all(tasks)).reduce((acc, cur) => ({
        data: acc.data.concat(cur.data),
        errMsg: acc.errMsg,
    }));
    // 下面开始获取每只猫的精选图片数量
    var stats = [];
    for (const cat of cats) {
        const { result: count_best } = await ctx.mpserverless.db.collection('photo').count({
            cat_id: cat._id,
            best: true,
            verified: true
        });
        const { result: count_total } = await ctx.mpserverless.db.collection('photo').count({
            cat_id: cat._id,
            verified: true
        });

        var stat = await ctx.mpserverless.db.collection('cat').updateOne({ _id: cat._id }, { $set: { photo_count_best: count_best, photo_count_total: count_total } });
        stat.cat_id = cat._id;
        stats.push(stat);
    }
    const res = { cats: cats, stats: stats };
    return res;
}