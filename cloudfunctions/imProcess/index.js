// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});

const db = cloud.database();
const _ = db.command;

const sharp = require('sharp');
const { registerFont } = require('canvas');
const text2png = require('text2png');

registerFont('./方正黑体-GBK.TTF', {family: 'FZHei'});

function generateUUID() {
  var d = new Date().getTime();
  var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c == 'x' ? r : (r & 0x7 | 0x8)).toString(16);
  });
  return uuid;
};

// 云函数入口函数
exports.main = async (event, context) => {
  var photos = (await db.collection('photo').where({ photo_compressed: _.in([undefined, '']), verified: true }).get()).data;
  console.log(`待处理图片有${photos.length}张`);
  for (let photo of photos) {
    // 获取原图
    let originRes = await cloud.downloadFile({
      fileID: photo.photo_id
    });
    console.log(`photo id: ${photo.photo_id}`);
    let origin = sharp(originRes.fileContent);
    let metadata = await origin.metadata();
    let ext = metadata.format;
    // 创建压缩图
    let compressPhoto = await (
      metadata.width > metadata.height ?
      origin.clone().resize(Math.min(500, metadata.width)).toBuffer() :
      origin.clone().resize(null, Math.min(500, metadata.height)).toBuffer()
    )
    // 创建水印图
    let userInfo = photo.userInfo;
    let watermark = text2png('中大猫谱@' + (photo.photographer || userInfo.nickName), {
      font: Math.round(metadata.height * 0.03) + 'px FZHei',
      color: 'white'
    });
    let watermarkPhoto = await origin.composite([
      {
        input: watermark,
        left: 30,
        top: metadata.height - Math.round(metadata.height * 0.045)
      }
    ]).toBuffer();
    // 上传图片
    let compressFileId = (await cloud.uploadFile({
      fileContent: compressPhoto,
      cloudPath:  'compressed/' + generateUUID() + '.' + ext
    })).fileID;
    console.log(`compress photo file id: ${compressFileId}`);
    let watermarkFileId = (await cloud.uploadFile({
      fileContent: watermarkPhoto,
      cloudPath: 'watermark/' + generateUUID() + '.' + ext
    })).fileID;
    console.log(`watermark photo file id: ${watermarkFileId}`)
    // 更新数据库
    let dbOpRes = await db.collection('photo').doc(photo._id).update({
      data: {
        photo_compressed: compressFileId,
        photo_watermark: watermarkFileId
      }
    });
    console.log(`database updated: ${JSON.stringify(dbOpRes)}`);
  }
  return 'done';
}