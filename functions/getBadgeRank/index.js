module.exports = async (ctx) => {
    let rank = await getRank();
    // 写入数据库
    const record = {
        mdate: new Date(),
        rank: rank[365],  // 兼容旧版前端
        rankV2: rank,
    }
    await ctx.mpserverless.db.collection("badge_rank").insertOne(record);
    // 清理旧数据
    await removeOld();

    async function getAllRecords(coll, cond) {
        let { result } = await ctx.mpserverless.db.collection(coll).find(cond)
        if (result.length < 100) {
            // 不超过100条，一次能取完
            return result;
        }
        const { result: count } = (await ctx.mpserverless.db.collection(coll).count(cond));
        while (result.length < count) {
            const { result: tmp } = await ctx.mpserverless.db.collection(coll).find(cond, { skip: result.length })
            result = result.concat(tmp);
        }
        return result;
    }


    async function getBadgeScoreMap() {
        // 徽章分数
        const levelScoreMap = {
            'S': 5,
            'A': 3,
            'B': 2,
            'C': 1,
        }
        // 获取徽章定义
        const badgeDefs = await getAllRecords("badge_def", {});
        if (badgeDefs.length === 0) {
            // 还没有徽章定义
            return null;
        }
        let badgeScoreMap = [];
        for (const bd of badgeDefs) {
            badgeScoreMap.push({
                case: { $eq: ["$badgeDef", bd._id] }, then: levelScoreMap[bd.level]
            })
        }
        return badgeScoreMap;
    }

    async function _buildBase(nDaysAgo) {
        const idScoreMap = await getBadgeScoreMap();
        let base = [];

        if (nDaysAgo !== 0) {
            base = (await ctx.mpserverless.db.collection('badge').aggregate([
                { $match: { catId: { $ne: null }, givenTime: { $gte: getNDaysAgo(nDaysAgo) } } },
                { $project: { catId: 1, givenTime: 1, badgeDef: 1 } },
                { $addFields: { score: { $switch: { branches: idScoreMap, default: 0 } } } }
            ])).result
        } else {
            base = (await ctx.mpserverless.db.collection('badge').aggregate([
                { $match: { catId: { $ne: null } } },
                { $project: { catId: 1, givenTime: 1, badgeDef: 1 } },
                { $addFields: { score: { $switch: { branches: idScoreMap, default: 0 } } } }
            ])).result
        }

        return base;
    }

    // 统计总数量、总价值榜
    async function getTotalRank(nDaysAgo, sumScore) {
        // 每个榜单最大数量
        const maxRankCount = 20;
        let sumField = sumScore ? '$score' : 1;

        // let base = await _buildBase(nDaysAgo);
        const idScoreMap = await getBadgeScoreMap();
        let data = [];

        if (nDaysAgo !== 0) {
            data = (await ctx.mpserverless.db.collection('badge').aggregate([
                { $match: { catId: { $ne: null }, givenTime: { $gte: getNDaysAgo(nDaysAgo) } } },
                { $project: { catId: 1, givenTime: 1, badgeDef: 1 } },
                { $addFields: { score: { $switch: { branches: idScoreMap, default: 0 } } } },
                { $group: { _id: "$catId", total: { $sum: sumField } } },
                { $sort: { total: -1 } },
                { $limit: maxRankCount }
            ])).result
        } else {
            data = (await ctx.mpserverless.db.collection('badge').aggregate([
                { $match: { catId: { $ne: null } } },
                { $project: { catId: 1, givenTime: 1, badgeDef: 1 } },
                { $addFields: { score: { $switch: { branches: idScoreMap, default: 0 } } } },
                { $group: { _id: "$catId", total: { $sum: sumField } } },
                { $sort: { total: -1 } },
                { $limit: maxRankCount }
            ])).result
        }

        // 整理返回格式为_id: number
        let res = {};
        for (const d of data) {
            res[d._id] = d.total
        }

        return res;
    }


    // 统计每个徽章的排行榜
    async function getBadgeRank(nDaysAgo) {
        // 每个榜单最大数量
        const maxRankCount = 20;
        const idScoreMap = await getBadgeScoreMap();
        let data = [];

        if (nDaysAgo !== 0) {
            data = (await ctx.mpserverless.db.collection('badge').aggregate([
                { $match: { catId: { $ne: null }, givenTime: { $gte: getNDaysAgo(nDaysAgo) } } },
                { $project: { catId: 1, givenTime: 1, badgeDef: 1 } },
                { $addFields: { score: { $switch: { branches: idScoreMap, default: 0 } } } },
                { $group: { _id: { badgeDef: "$badgeDef", catId: "$catId", }, total: { $sum: 1 } } },
                { $project: { _id: 0, badgeDef: "$_id.badgeDef", catId: "$_id.catId", total: 1 } },
            ])).result
        } else {
            data = (await ctx.mpserverless.db.collection('badge').aggregate([
                { $match: { catId: { $ne: null } } },
                { $project: { catId: 1, givenTime: 1, badgeDef: 1 } },
                { $addFields: { score: { $switch: { branches: idScoreMap, default: 0 } } } },
                { $group: { _id: { badgeDef: "$badgeDef", catId: "$catId", }, total: { $sum: 1 } } },
                { $project: { _id: 0, badgeDef: "$_id.badgeDef", catId: "$_id.catId", total: 1 } },
            ])).result
        }

        // 整理返回格式为 badgeDef: { catId: number }
        let res = {};
        for (const d of data) {
            if (!res[d.badgeDef]) {
                res[d.badgeDef] = {}
            }
            res[d.badgeDef][d.catId] = d.total
        }

        for (const badgeDef in res) {
            res[badgeDef] = getDictTopN(res[badgeDef], maxRankCount)
        }

        return res;
    }

    // 统计所有需要的表
    async function getRank() {
        // 获取徽章定义
        const badgeDefs = await getAllRecords("badge_def", {});
        if (badgeDefs.length === 0) {
            // 还没有徽章定义
            return {};
        }

        let stat = {};
        // 季度、半年、整年、总榜
        for (const nDaysAgo of [90, 180, 365]) {
            // 先获取各个徽章的统计
            stat[nDaysAgo] = await getBadgeRank(nDaysAgo);
            // 再获取总数量、总分数的统计
            stat[nDaysAgo]['count'] = await getTotalRank(nDaysAgo, false);
            stat[nDaysAgo]['score'] = await getTotalRank(nDaysAgo, true);
        }
        return stat;
    }


    // 删除旧的
    async function removeOld() {
        await ctx.mpserverless.db.collection('badge_rank').deleteMany({ mdate: { $lt: getNDaysAgo(1) } });
    }

    function getNDaysAgo(n) {
        const today = new Date();
        const ago = new Date(today.getTime());
        ago.setDate(today.getDate() - n);
        return ago;
    }

    // 获取字典里value排名top n的内容
    function getDictTopN(dict, n) {
        const entries = Object.entries(dict);
        entries.sort((a, b) => b[1] - a[1]);
        const topN = entries.slice(0, n);
        return Object.fromEntries(topN);
    }
}