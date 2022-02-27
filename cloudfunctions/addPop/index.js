// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV})

// 云函数入口函数
exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const db = cloud.database();
  const _ = db.command;
  const cat_id = event.cat_id;
  const coll = event.org ? 'orgcat' : 'cat';
  return db.collection(coll).doc(cat_id).update({
    data: {
      popularity: _.inc(1)
    }
  })
}