// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init()
const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const org_id = event._id;
  
  var params = {
    "path": `pages/organization/org/org?org_id=${org_id}`,
    "width": event.width || 500,
  }

  try {
    const result = await cloud.openapi.wxacode.get(params);

    const mpfile = await cloud.uploadFile({
      cloudPath: `orgmpcode/${org_id}.png`, // 上传至云端的路径
      fileContent: result.buffer,
    })

    await db.collection('organization').doc(org_id).update({
      data: { mpcode: mpfile.fileID }
    });
    
    return mpfile.fileID
  } catch (err) {
    console.log(err)
    return { err: err, params: params }
  }
}