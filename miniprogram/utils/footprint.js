import { getCatItemMulti, getAvatar } from './cat';
import { likeCheck } from './inter';
import { serializeCommentPaper } from './commentPaper';

const app = getApp();

// 保留服务端时间排序，概览可在展示前另行排序、截取。
export async function loadFootprintComments(openid) {
  const comments = [];
  const limit = 100;
  let skip = 0;
  let batch;
  do {
    const response = await app.mpServerless.db.collection('comment').find(
      { user_openid: openid, deleted: { $ne: true } },
      { sort: { create_date: -1, _id: -1 }, skip, limit }
    );
    batch = response.result;
    skip += batch.length;
    // EMAS 客户端查询不认 $exists，在此排除照片评论。
    comments.push(...batch.filter(comment => !comment.photo_id));
  } while (batch.length === limit);
  return comments;
}

export async function presentFootprintComments(comments) {
  const ids = [...new Set(comments.map(comment => comment.cat_id).filter(Boolean))];
  const [cats, avatars] = ids.length ? await Promise.all([
    getCatItemMulti(ids),
    getAvatar(ids).catch(error => {
      console.warn('加载便利贴猫猫头像失败', error);
      return [];
    }),
  ]) : [[], []];
  const avatarMap = new Map(ids.map((id, index) => [id, avatars[index]]));
  const catMap = new Map(cats.filter(Boolean).map(cat => [cat._id, { ...cat, avatar: avatarMap.get(cat._id) }]));
  const list = comments.map(comment => ({
    ...serializeCommentPaper(comment),
    cat: catMap.get(comment.cat_id) || {},
  }));
  const approved = list.filter(item => !item.needVerify && item._id);
  try {
    const liked = approved.length ? await likeCheck(approved.map(item => item._id)) : [];
    approved.forEach((item, index) => { item.liked = Boolean(liked[index]); });
  } catch (error) {
    console.warn('查询足迹便利贴点赞状态失败', error);
  }
  return list;
}
