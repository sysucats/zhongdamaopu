// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV})

// 云函数入口函数
exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const isManager = (await cloud.callFunction({ name: 'isManager', data: { openid: openid, req: 99 } }));
  if (!isManager.result) {
    return { msg: 'not a manager', result: isManager };
  }

  
  const doc_id = event.doc_id;
  var to_upload = event.to_upload;
  
  to_upload.openid = wxContext.OPENID;

  const db = cloud.database();
  return db.collection('setting').doc(doc_id).update({
    data: to_upload
  });
}