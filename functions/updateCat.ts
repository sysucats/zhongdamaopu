import cloud from '@lafjs/cloud'
import { isManager } from '@/isManager'


export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.1";
  }

  const openid = ctx.user?.openid;

  const is_manager = await isManager(openid, 2);
  if (!is_manager) {
    return { msg: 'not a manager', result: false };
  }

  console.log(body);
  var cat = body.cat;
  const cat_id = body.cat_id;
  const currentTime = new Date().toISOString();

  const db = cloud.database();
  if (cat_id) {
    // 是更新
    console.log("开始更新：" + cat_id);
    
    // 如果是更新现有猫猫，需要获取旧数据进行比较
    if (cat_id) {
      try {
        const oldCat = await db.collection('cat').doc(cat_id).get();
        const oldData = oldCat.data;
        
        // 记录状态变更时间
        // 绝育状态变更
        if (oldData.sterilized !== cat.sterilized) {
          cat.sterilized_time = cat.sterilized === true ? currentTime : null;
        }
        
        // 领养状态变更
        if (oldData.adopt !== cat.adopt) {
          cat.adopt_time = cat.adopt === 1 ? currentTime : null;
        }
        
        // 失踪状态变更
        if (oldData.missing !== cat.missing) {
          cat.missing_time = cat.missing === true ? currentTime : null;
        }
        
        // 返回喵星状态变更
        if (oldData.to_star !== cat.to_star) {
          cat.deceased_time = cat.to_star === true ? currentTime : null;
        }
        
        // 记录最后更新时间
        cat.update_time = currentTime;
      } catch (error) {
        console.error("获取猫猫旧数据失败:", error);
        // 即使获取失败，也记录更新时间
        cat.update_time = currentTime;
      }
    }
    
    var cat_data = deepcopy(cat);
    return await db.collection('cat').doc(cat_id).update(cat_data);
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
    // 添加创建时间和更新时间
    cat.create_time = currentTime;
    cat.update_time = currentTime;
    
    // 如果新猫就已经设置了某些状态，也记录对应时间
    if (cat.sterilized === true) {
      cat.sterilized_time = currentTime;
    }
    if (cat.adopt === 1) {
      cat.adopt_time = currentTime;
    }
    if (cat.missing === true) {
      cat.missing_time = currentTime;
    }
    if (cat.to_star === true) {
      cat.deceased_time = currentTime;
    }
    
    return await db.collection('cat').add(cat);
  }
}

function deepcopy(origin) {
  // not for modifying.
  const copyKeys = ['area', 'campus', 'characteristics',
    'colour', 'father', 'gender', 'mother', 'name', 'nickname', 'popularity', 'sterilized', 'adopt',
    'missing', 'birthday', 'habit', 'tutorial', 'relation', 'to_star', 
    // 添加时间相关字段
    'create_time', 'update_time', 'sterilized_time', 'adopt_time', 'missing_time', 'deceased_time']
  var res = {};
  for (const key of copyKeys) {
    if (origin[key] !== undefined) {
      res[key] = origin[key];
    }
  }
  return res;
}

function random_string(len) {
  var s = Math.random().toString(36);
  return s.substr(s.length - len);
}
