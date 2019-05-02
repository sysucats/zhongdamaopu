// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init()

// 云函数入口函数
exports.main = async (event, context) => {
  const photo = event.photo;
  const type = event.type;
  const db = cloud.database();

  if (type === "check") {
    const best = event.best;
    const { OPENID, APPID } = cloud.getWXContext();
    await db.collection('photo').doc(photo._id).update({
      data: {
        verified: true,
        best: best,
        manager: OPENID,
      }
    });
    const today = new Date();
    return db.collection('cat').doc(photo.cat_id).update({
      data: {
        mphoto: today
      }
    });
  } else if (type === "delete") {
    var photoIDs = [photo.photo_id];
    if (photo.photo_compressed) {
      photoIDs.push(photo.photo_compressed);
      photoIDs.push(photo.photo_watermark);
    }
    cloud.deleteFile({
      fileList: photoIDs,
      success: res => {
        console.log("删除照片：" + photoIDs);
        console.log(res.fileList)
      },
      fail: console.error
    });
    return db.collection('photo').doc(photo._id).remove();
  } else if (type === "setBest") {
    const best = event.best;
    return db.collection('photo').doc(photo._id).update({
      data: {
        best: best
      }
    });
  } else if (type === 'setPher') {
    const photographer = event.photographer;
    if (photo.photo_compressed) {
      cloud.deleteFile({
        fileList: [photo.photo_compressed, photo.photo_watermark],
        success: res => {
          console.log("删除压缩和水印");
          console.log(res.fileList)
        },
        fail: console.error
      })
    }
    // 把水印和压缩图的链接去掉
    return db.collection('photo').doc(photo._id).update({
      data: {
        photographer: photographer,
        photo_compressed: '',
        photo_watermark: ''
      }
    });
  } else if (type === 'setProcess') {
    // 修改数据库中记录的压缩图、水印图的URL
    const compressed = event.compressed;
    const watermark = event.watermark;
    return db.collection('photo').doc(photo._id).update({
      data: {
        photo_compressed: compressed,
        photo_watermark: watermark
      }
    });
  }

}