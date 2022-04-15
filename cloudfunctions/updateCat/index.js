// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({env: cloud.DYNAMIC_CURRENT_ENV})

function deepcopy(origin) {
  // not for modifying.
  const copyKeys = ['area', 'campus', 'characteristics',
    'colour', 'father', 'gender', 'mother', 'name', 'nickname', 'popularity', 'sterilized', 'adopt',
    'birthday', 'habit', 'tutorial', 'relation', 'to_star']
  var res = {};
  for (const key of copyKeys) {
    res[key] = origin[key];
  }
  return res;
}

function random_string(len) {
  var s = Math.random().toString(36);
  return s.substr(s.length - len);
}

// 云函数入口函数
exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const isManager = (await cloud.callFunction({ name: 'isManager', data: { openid: openid, req: 2 }}));
  if (!isManager.result) {
    return { msg: 'not a manager', result: isManager };
  }

  console.log(event);
  var cat = event.cat;
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
    const count = (await db.collection('cat').count()).total;

    var _no = 'c' + count;
    while (true) {
      var exist = (await db.collection('cat').where({_no: _no}).count()).total > 0;
      if (!exist) {
        break;
      }
      // 加上俩随机字符
      _no += random_string(2);
    }
    cat._no = _no;
    return db.collection('cat').add({
      data: cat
    })
  }
}