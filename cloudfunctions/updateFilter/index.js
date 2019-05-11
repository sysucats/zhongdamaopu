// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const filter_id = event.filter_id;
  var to_upload = event.to_upload;
  
  to_upload.openid = wxContext.OPENID;

  const db = cloud.database();
  return db.collection('filter').doc(filter_id).update({
    data: to_upload
  });
}