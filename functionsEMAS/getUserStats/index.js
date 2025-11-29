module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    return "v2.1";
  }

  const openid = ctx.args.openid;

  try {
    // 1. 获取用户照片数量
    const countResult = await ctx.mpserverless.db.collection('photo').count({
      _openid: openid,
      verified: true
    });
    
    // 处理count返回结构
    const numUserPhotos = countResult.result !== undefined ? countResult.result : 0;

    // 2. 获取用户评论数量
    const commentCount = await ctx.mpserverless.db.collection('comment').count({
      _openid: openid,
      deleted: { $ne: true },
      needVerify: { $ne: true }
    });
    
    const numUserComments = commentCount.result !== undefined ? commentCount.result : 0;

    // 3. 获取用户照片数据 - 使用调试确认的有效方法
    const findResult = await ctx.mpserverless.db.collection('photo').find({
      _openid: openid,
      verified: true
    });
    
    // 根据调试结果(method=1)，EMAS返回 {result: [...]} 结构
    let userPhotos = [];
    if (findResult && Array.isArray(findResult.result)) {
      userPhotos = findResult.result;
    } else if (Array.isArray(findResult)) {
      userPhotos = findResult; // 备用方案
    }
    
    // 4. 计算用户收到的总赞数
    let numUserLiked = 0;
    if (userPhotos.length > 0) {
      numUserLiked = userPhotos.reduce((sum, photo) => {
        const likes = parseInt(photo.like_count) || 0;
        return sum + likes;
      }, 0);
    }

    // 5. 计算用户拍摄过的猫猫数量
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
    // 返回默认值
    return {
      numUserPhotos: 0,
      numUserComments: 0,
      numUserLiked: 0,
      numCats: 0
    };
  }
}