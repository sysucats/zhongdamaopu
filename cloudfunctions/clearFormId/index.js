// 删除1小时后过期的formId，每小时自动执行一次
const cloud = require('wx-server-sdk')

cloud.init()
const db = cloud.database();
const _  = db.command;

// 云函数入口函数
exports.main = async (event, context) => {
  // 获取一小时后
  var afterOneHour = new Date().getTime() + 1 * 60 * 60 * 1000;
  // 再算7天前
  var frontSevenDay = new Date(afterOneHour - 7 * 24 * 60 * 60 * 1000);
  // 删掉比七天前那个时间早提交的
  const deleteStat = await db.collection('formId').where({ mdate: _.lte(frontSevenDay) }).remove();

  return deleteStat;
}