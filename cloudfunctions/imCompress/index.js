// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});

const sharp = require('sharp');

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
  var photoFileId = event.photoFileId;
  console.log(`photo file id: ${photoFileId}`);
  // 获取原图
  var originRes = await cloud.downloadFile({
    fileID: photoFileId
  });
  var origin = sharp(originRes.fileContent);
  var metadata = await origin.metadata();
  var ext = metadata.format;
  // 创建压缩图
  var compressPhoto = await (
    metadata.width > metadata.height ?
    origin.clone().resize(Math.min(500, metadata.width)).toBuffer() :
    origin.clone().resize(null, Math.min(500, metadata.height)).toBuffer()
  )
  // 上传图片
  let compressFileId = (await cloud.uploadFile({
    fileContent: compressPhoto,
    cloudPath:  'compressed/' + generateUUID() + '.' + ext
  })).fileID;
  console.log(`compress photo file id: ${compressFileId}`);
  return {
    event: event,
    compressFileId: compressFileId
  };
}