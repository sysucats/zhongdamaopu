// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});
const db = cloud.database();

function updateMphoto(cat_id) {
  const today = new Date();
  return db.collection('cat').doc(cat_id).update({
    data: {
      mphoto: today
    }
  });
}

// 云函数入口函数
exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const isManager = (await cloud.callFunction({ name: 'isManager', data: { openid: openid } }));
  if (!isManager.result) {
    return { msg: 'not a manager', result: isManager };
  }
  
  const photo = event.photo;
  const type = event.type;

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
    updateMphoto(photo.cat_id);
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
    updateMphoto(photo.cat_id);
    db.collection('photo').doc(photo._id).remove();
  } else if (type === "setBest") {
    const best = event.best;
    updateMphoto(photo.cat_id);
    db.collection('photo').doc(photo._id).update({
      data: {
        best: best
      }
    });
  } else if (type === 'setPher') {
    const photographer = event.photographer;
    if (photo.photographer == photographer) {
      return "same";
    }
    if (photo.photo_compressed && photo.photo_id != 'deleted') {
      // 如果原图没有删掉，那么就删除压缩图和水印图
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
    db.collection('photo').doc(photo._id).update({
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
    db.collection('photo').doc(photo._id).update({
      data: {
        photo_compressed: compressed,
        photo_watermark: watermark
      }
    });
  }

  // 所有照片改动之后，重新数一下猫图
  await cloud.callFunction({ name: 'countPhoto' });

  return;
}