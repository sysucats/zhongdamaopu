module.exports = async (ctx) => {
    const openid = ctx.args.openid;

    const { result: numUserPhotos } = await ctx.mpserverless.db.collection('photo').count({ _openid: openid, verified: true })
    const { result: numUserComments } = await ctx.mpserverless.db.collection('comment').count({ _openid: openid, deleted: { $ne: true }, needVerify: { $ne: true } })
    const numUserLiked = await ctx.mpserverless.db.collection('photo').aggregate([
        { $match: { _openid: openid } },
        {
            $group: {
                _id: null,
                totalLikes: { $sum: '$like_count' }
            }
        }
    ]).then(res => res.length > 0 ? res[0].totalLikes : 0)

    const [photoCats] = await Promise.all([
        ctx.mpserverless.db.collection('photo')
            .aggregate([
                { $match: { _openid: openid, verified: true } },
                { $group: { _id: '$cat_id' } }
            ])
            .then(result => Array.isArray(result) ? result.map(item => item._id) : []),
    ]);

    const uniqueCats = new Set([...photoCats]);

    return {
        numUserPhotos: numUserPhotos,
        numUserComments: numUserComments,
        numUserLiked: numUserLiked,
        numCats: uniqueCats.size
    };
}