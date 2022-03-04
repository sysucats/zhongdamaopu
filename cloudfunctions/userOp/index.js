// 负责用户表的各种操作
const cloud = require('wx-server-sdk');

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});
const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  // 获取当前操作是干啥子的
  const op = event.op;
  switch(op) {
    case 'get': {
      // 获取用户，如果没有就新建一个
      const user = (await db.collection('user').where({'openid': openid}).get()).data[0];
      if (user) {
        return user;
      }
      await db.collection('user').add({data: {'openid': openid}});
      return (await db.collection('user').where({ 'openid': openid }).get()).data[0];
    }
    case 'update': {
      var user = event.user;
      const _id = user._id;
      delete user._id; // 因为数据库不能更新_id
      delete user.openid; // 这个键唯一
      await db.collection('user').doc(_id).update({ data: user });
      return (await db.collection('user').where({ 'openid': openid }).get()).data[0];
    }
    default: {
      return "unknow op: " + op;
    }
  }
}