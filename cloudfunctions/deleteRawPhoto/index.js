// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init();
const db = cloud.database();
const _ = db.command;


// 删除后的照片photo_id字段变成这个
const DELETED = 'deleted';

// 云函数入口函数
exports.main = async (event, context) => {
  const countResult = await db.collection('photo').where({ photo_id: _.neq(DELETED) }).count()
  const MAX_LIMIT = Math.min(100, event.count);
  const total = Math.min(countResult.total, event.count); // 可以手动设定要删多少张，传参数进来
  if (!total) {
    return {};
  }
  // 计算需分几次取
  const batchTimes = Math.ceil(total / 100);
  // 承载所有读操作的 promise 的数组
  const tasks = []
  for (let i = 0; i < batchTimes; i++) {
    const promise = db.collection('photo').where({ photo_id: _.neq(DELETED) }).skip(i * MAX_LIMIT).limit(MAX_LIMIT).field({
      photo_id: true,
      photo_compressed: true,
      photo_watermark: true,
    }).get()
    tasks.push(promise)
  }
  // 等待所有
  const photos = (await Promise.all(tasks)).reduce((acc, cur) => ({
    data: acc.data.concat(cur.data),
    errMsg: acc.errMsg,
  })).data;

  // 遍历开始删除
  var deleted_photos = [];
  for (const photo of photos) {
    if (photo.photo_compressed === undefined) {
      continue;
    }
    const photo_id = photo.photo_id;
    const result = (await cloud.deleteFile({
      fileList: [photo_id],
    })).fileList[0]
    if (result.status === 0) {
      // 说明删除成功，那就修改记录
      await db.collection('photo').doc(photo._id).update({
        data: {
          photo_id: DELETED
        }
      })
      deleted_photos.push(photo._id);
    } else {
      deleted_photos.push("Failed: " + photo._id);
    }
  }
  return { 'deleted_photos': deleted_photos, 'total': countResult.total};
}