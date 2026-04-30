module.exports = async (ctx) => {
  const openid = ctx.args.openid;

  try {
    const countResult = await ctx.mpserverless.db.collection('photo').count({
      _openid: openid,
      verified: true
    });

    const numUserPhotos = countResult.result !== undefined ? countResult.result : 0;

    const commentCount = await ctx.mpserverless.db.collection('comment').count({
      _openid: openid,
      deleted: { $ne: true },
      needVerify: { $ne: true }
    });

    const numUserComments = commentCount.result !== undefined ? commentCount.result : 0;

    const findResult = await ctx.mpserverless.db.collection('photo').find({
      _openid: openid,
      verified: true
    });

    let userPhotos = [];
    if (findResult && Array.isArray(findResult.result)) {
      userPhotos = findResult.result;
    } else if (Array.isArray(findResult)) {
      userPhotos = findResult;
    }

    let numUserLiked = 0;
    if (userPhotos.length > 0) {
      numUserLiked = userPhotos.reduce((sum, photo) => {
        const likes = parseInt(photo.like_count) || 0;
        return sum + likes;
      }, 0);
    }

    let numCats = 0;
    if (userPhotos.length > 0) {
      const uniqueCatIds = new Set();
      userPhotos.forEach(photo => {
        if (photo.cat_id) {
          uniqueCatIds.add(photo.cat_id.toString());
        }
      });
      numCats = uniqueCatIds.size;
    }

    return {
      numUserPhotos: numUserPhotos,
      numUserComments: numUserComments,
      numUserLiked: numUserLiked,
      numCats: numCats
    };

  } catch (error) {
    console.error('统计用户数据时出错:', error);
    return {
      numUserPhotos: 0,
      numUserComments: 0,
      numUserLiked: 0,
      numCats: 0
    };
  }
}
