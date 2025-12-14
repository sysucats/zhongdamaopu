module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.3";
  }

  // 检查是否为管理员，删除操作需要最高权限(99)
  const {
    result: is_manager
  } = await ctx.mpserverless.function.invoke('isManager', {
    openid: ctx.args.openid,
    req: ctx.args.action === 'delete' ? 99 : 2
  })
  if (!is_manager) {
    return {
      msg: 'not a manager',
      result: false
    };
  }

  var cat = ctx.args.cat;
  const cat_id = ctx.args.cat_id;
  const currentTime = new Date().toISOString();
  const db = ctx.mpserverless.db;
  
  // 非删除操作需要验证name字段
  if (ctx.args.action !== 'delete') {
    // 验证name字段不能为空
    if (cat === null || cat === undefined || cat.name === null || cat.name === undefined) {
      return {
        msg: 'name字段不能为空',
        result: false
      };
    }
    
    // 检查name是否仅包含空格字符（包括全角和半角）
    const trimmedName = cat.name.replace(/[\s\u3000]/g, '');
    if (trimmedName === '') {
      return {
        msg: 'name字段不能仅包含空格字符（包括全角空格和半角空格）',
        result: false
      };
    }
  }

  if (cat_id) {
    // 是更新或删除操作
    
    // 处理删除操作
    if (ctx.args.action === 'delete') {
      try {
        // 检查猫是否存在
        const catRes = await db.collection('cat').find({
          _id: cat_id
        });
        if (catRes.result && catRes.result.length > 0) {
          // 执行软删除，将deleted字段设为1
          const deleteResult = await db.collection('cat').updateOne({
            _id: cat_id
          }, {
            $set: {
              deleted: 1,
              update_time: currentTime
            }
          });
          
          // 记录删除日志
          console.log(`[删除操作] 用户 ${ctx.args.openid} 于 ${currentTime} 删除了猫 ${cat_id}`);
          
          return {
            msg: 'delete success',
            result: true,
            deletedCatId: cat_id
          };
        } else {
          return {
            msg: 'cat not found',
            result: false
          };
        }
      } catch (error) {
        console.error(`[删除操作失败] 猫ID: ${cat_id}, 错误: ${error.message}`);
        return {
          msg: 'delete failed',
          result: false,
          error: error.message
        };
      }
    }
    
    // 正常更新操作
    try {
      const oldCatRes = await db.collection('cat').find({
        _id: cat_id
      });
      if (oldCatRes.result && oldCatRes.result.length > 0) {
        const oldData = oldCatRes.result[0];

        // 记录状态变更时间
        // 绝育状态变更
        if (cat.sterilized !== undefined && oldData.sterilized !== cat.sterilized) {
          cat.sterilized_time = cat.sterilized === true ? currentTime : null;
        }

        // 领养状态变更
        if (cat.adopt !== undefined && oldData.adopt !== cat.adopt) {
          cat.adopt_time = cat.adopt === 1 ? currentTime : null;
        }

        // 失踪状态变更
        if (cat.missing !== undefined && oldData.missing !== cat.missing) {
          cat.missing_time = cat.missing === true ? currentTime : null;
        }

        // 返回喵星状态变更
        if (cat.to_star !== undefined && oldData.to_star !== cat.to_star) {
          cat.deceased_time = cat.to_star === true ? currentTime : null;
        }
      }
      // 记录最后更新时间
      cat.update_time = currentTime;
    } catch (error) {
      console.log("获取猫猫旧数据失败:", error);
      // 即使获取失败，也记录更新时间
      cat.update_time = currentTime;
    }

    var cat_data = deepcopy(cat);
    return await db.collection('cat').updateOne({
      _id: cat_id
    }, {
      $set: cat_data
    });
  } else {
    // 是新猫
    const {
      result: count
    } = await db.collection('cat').count({});
    var _no = 'c' + (count || 0);
    while (true) {
      var {
        result: existNum
      } = await ctx.mpserverless.db.collection('cat').count({
        _no: _no
      });
      if (!(existNum > 0)) {
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

    return await db.collection('cat').insertOne(cat);
  }

  function deepcopy(origin) {
    // not for modifying.
    const copyKeys = ['area', 'campus', 'characteristics',
      'colour', 'father', 'gender', 'mother', 'name', 'nickname', 'popularity', 'sterilized', 'adopt',
      'missing', 'birthday', 'habit', 'tutorial', 'relation', 'to_star', 'deleted',
      // 添加时间相关字段
      'create_time', 'update_time', 'sterilized_time', 'adopt_time', 'missing_time', 'deceased_time'
    ]
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
}