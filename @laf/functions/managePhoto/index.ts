// 对图片进行 确认 / 删除 / 精选 / 更新*

import cloud from '@/cloud-sdk';
const db = cloud.database();

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  const openid = auth.openid;
  const is_manager = await check_manager(1, openid);
  if (!is_manager) {
    return { msg: 'not a manager', result: false };
  }
  
  console.log("managePhoto", body);
  const photo = body.photo;
  const type = body.type;

  if (type == "check") {
    const best = body.best;
    await db.collection('photo').doc(photo._id).update({
      verified: true,
      best: best,
      manager: openid
    });
    updateMphoto(photo.cat_id);
  }
  else if (type == "delete") {
    var photoIDs = [photo.photo_id];
    if (photo.photo_compressed) {
      photoIDs.push(photo.photo_compressed);
      photoIDs.push(photo.photo_watermark);
    }
    console.log(photoIDs);

    cloud.invoke("deleteFiles", {
      body: {
        fileIDs: photoIDs
      }
    }).then(res => {
      console.log("删除照片：" + photoIDs);
    });

    // updateMphoto(photo.cat_id);
    const res = await db.collection('photo').doc(photo._id).remove();
    console.log("delete res:", res);
  }
  else if (type == "setBest") {
    const best = body.best;
    // updateMphoto(photo.cat_id);
    const res = await db.collection('photo').doc(photo._id).update({
      best: best
    });
    console.log("setBest res:", res);
  }
  else if (type == 'setPher') {
    const photographer =body.photographer;
    if (photo.photographer == photographer) {
      return "same";
    }
    if (photo.photo_compressed && photo.photo_id != 'deleted') {
      // 如果原图没有删掉，那么就删除压缩图和水印图
      cloud.invoke("deleteFiles", {
        body: {
          fileIDs: [photo.photo_compressed, photo.photo_watermark]
        }
      }).then(res => {
        console.log("删除压缩和水印");
      });
    }
    // 把水印和压缩图的链接去掉
    const res = await db.collection('photo').doc(photo._id).update({
        photographer: photographer,
        photo_compressed: '',
        photo_watermark: ''
    });
    console.log("setPher res:", res);
  }
  else if (type == 'setProcess') {
    // 修改数据库中记录的压缩图、水印图的URL
    const compressed = body.compressed;
    const watermark = body.watermark;
    console.log(photo._id);
    const res = await db.collection('photo').doc(photo._id).update({
        photo_compressed: compressed,
        photo_watermark: watermark
    });
    console.log("setProcess res:", res);
  }
  else {
    console.log("Unknown type");
  }

  // 所有照片改动之后，重新数一下猫图
  return await cloud.invoke('countPhoto', {});
}

function updateMphoto(cat_id) {
  const today = new Date();
  return db.collection('cat').doc(cat_id).update({
      mphoto: today
  });
}

// 权限检查
async function check_manager(level, openid) {
  const isManager = await cloud.invoke('isManager', {
    auth: {
      openid: openid
    },
    body: {
      req: level
    }
  });
  return isManager;
}
