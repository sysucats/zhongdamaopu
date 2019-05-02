// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init()

// 云函数入口函数
exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;
  const cat_id = event.cat_id;
  return db.collection('cat').doc(cat_id).update({
    data: {
      popularity: _.inc(1)
    }
  })
}