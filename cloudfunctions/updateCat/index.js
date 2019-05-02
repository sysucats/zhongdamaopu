// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init()

function deepcopy(origin) {
  // not for modifying.
  const copyKeys = ['area', 'campus', 'characteristics',
    'colour', 'father', 'gender', 'mother', 'name', 'nickname', 'popularity', 'sterilized', 'adopt',
    'birthday', 'habit', 'tutorial', 'relation']
  var res = {};
  for (const key of copyKeys) {
    res[key] = origin[key];
  }
  return res;
}

// 云函数入口函数
exports.main = async (event, context) => {
  console.log(event);
  const cat = event.cat;
  const cat_id = event.cat_id;

  const db = cloud.database();
  if (cat_id) {
    // 是更新
    console.log("开始更新：" + cat_id);
    var cat_data = deepcopy(cat);
    return db.collection('cat').doc(cat_id).update({
      data: cat_data
    })
  } else {
    // 是新猫
    console.log("开始添加新猫");
    return db.collection('cat').add({
      data: cat
    })
  }

  // return {
  //   event,
  //   openid: wxContext.OPENID,
  //   appid: wxContext.APPID,
  //   unionid: wxContext.UNIONID,
  // }
}