import cloud from '@lafjs/cloud'
import { deleteFiles } from '@/deleteFiles'
import { isManager } from '@/isManager'
import { countPhoto } from '@/countPhoto'

const db = cloud.database();

export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.1";
  }

  const openid = ctx.user?.openid;
  const is_manager = await isManager(openid, 1);
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

    await deleteFiles(photoIDs);

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
      await deleteFiles([photo.photo_compressed, photo.photo_watermark]);
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
  return await countPhoto();
}

function updateMphoto(cat_id) {
  const today = new Date();
  return db.collection('cat').doc(cat_id).update({
      mphoto: today
  });
}
