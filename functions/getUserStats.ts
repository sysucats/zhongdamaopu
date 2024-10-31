import cloud from '@lafjs/cloud'

export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }
  
  const db = cloud.database();
  const _ = db.command;
  const $ = db.command.aggregate;
  const openid = ctx.user?.openid;

  // 定义查询条件
  const userPhotoQf = { _openid: openid, verified: true, photo_id: /^((?!\.heic$).)*$/i };
  const userCommentQf = { _openid: openid, deleted: _.neq(true), needVerify: _.neq(true) };

  const [numUserPhotos, numUserComments, numUserLiked] = await Promise.all([
    db.collection('photo').where(userPhotoQf).count(),      // 用户上传的照片数量
    db.collection('comment').where(userCommentQf).count(),  // 用户的评论数量
    // 用户所有照片的被点赞数
    db.collection('photo')
      .aggregate()
      .match({ _openid: openid })
      .group({
        _id: null,
        totalLikes: $.sum('$like_count')
      })
      .end()
      .then(aggregationResult => aggregationResult.data.length > 0 ? aggregationResult.data[0].totalLikes : 0)
  ]);

  // 查询该用户的照片（和评论）中涉及的猫猫数
  const [photoCats] = await Promise.all([
    db.collection('photo')
      .aggregate()
      .match(userPhotoQf)
      .group({
        _id: '$cat_id'
      })
      .end()
      .then(res => res.data.map(item => item._id)),
    // db.collection('comment')
    //   .aggregate()
    //   .match(userCommentQf)
    //   .group({
    //     _id: '$cat_id'
    //   })
    //   .end()
    //   .then(res => res.data.map(item => item._id))
  ]);

  // 去重
  const uniqueCats = new Set([...photoCats]);

  return {
    numUserPhotos: numUserPhotos.total,
    numUserComments: numUserComments.total,
    numUserLiked: numUserLiked,
    numCats: uniqueCats.size
  };
}
