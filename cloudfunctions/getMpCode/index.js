// 生成小程序码，无限数量，但是参数长度限制为32
const cloud = require('wx-server-sdk')

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV})
const db = cloud.database();

// 生成一张猫猫的mpcode，顺便保存。
// 如果这只猫猫已经有了mpcode，那就不应该调用这个函数
exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const cat_id = event._id;
  
  // scene是页面参数，长度限制32。page是页面路径，不需要'/'开头。
  var params = {
    scene: event.scene,
    page: event.page,
  }
  
  // 下面是其他可选参数，具体含义查看：
  // https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/qr-code/wxacode.getUnlimited.html#method-cloud
  if (event.width) {
    params.width = event.width;
  }
  // const width = event.width //| 430;
  // const autoColor = event.autoColor //| false;
  // const lineColor = event.lineColor //| { "r": 0, "g": 0, "b": 0 };
  // const isHyaline = event.isHyaline //| false;

  try {
    const result = await cloud.openapi.wxacode.getUnlimited(params);

    const mpfile = await cloud.uploadFile({
      cloudPath: 'mpcode/' + cat_id + '.png', // 上传至云端的路径
      fileContent: result.buffer,
    })

    await db.collection('cat').doc(cat_id).update({
      data: { mpcode: mpfile.fileID }
    });
    
    return mpfile.fileID
  } catch (err) {
    console.log(err)
    return { err: err, params: params }
  }
}