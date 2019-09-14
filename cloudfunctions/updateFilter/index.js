// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const isManager = (await cloud.callFunction({ name: 'isManager', data: { openid: openid, req: 2 } }));
  if (!isManager.result) {
    return { msg: 'not a manager', result: isManager };
  }

  
  const filter_id = event.filter_id;
  var to_upload = event.to_upload;
  
  to_upload.openid = wxContext.OPENID;

  const db = cloud.database();
  return db.collection('setting').doc('filter').update({
    data: to_upload
  });
}