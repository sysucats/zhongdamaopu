module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.1";
  }

  // 新增：处理迁移请求（无参直接处理）
  if (ctx.args?.action === 'migrate_no_field' || Object.keys(ctx.args || {}).length === 0) {
    return await migrateNoField(ctx);
  }

  const {
    result: is_manager
  } = await ctx.mpserverless.function.invoke('isManager', {
    openid: ctx.args.openid,
    req: 2
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

  if (cat_id) {
    // 是更新
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
    
    // 修改：使用 no 字段而不是 _no
    var no = 'c' + (count || 0);
    while (true) {
      var {
        result: existNum
      } = await ctx.mpserverless.db.collection('cat').count({
        $or: [
          { _no: no },  // 检查旧字段
          { no: no }    // 检查新字段
        ]
      });
      if (!(existNum > 0)) {
        break;
      }
      // 加上俩随机字符
      no += random_string(2);
    }
    
    // 修改：同时设置 no 字段，不再设置 _no 字段
    cat.no = no;
    
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
      'missing', 'birthday', 'habit', 'tutorial', 'relation', 'to_star',
      // 添加时间相关字段
      'create_time', 'update_time', 'sterilized_time', 'adopt_time', 'missing_time', 'deceased_time',
      // 添加 no 字段
      'no'
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

// 新增：迁移函数，将 _no 字段批量改为 no 字段
async function migrateNoField(ctx) {
  const db = ctx.mpserverless.db;
  
  try {
    console.log('开始迁移 _no 字段到 no 字段...');
    
    // 获取所有猫咪记录
    const allCats = await db.collection('cat').find({});
    
    let migratedCount = 0;
    let alreadyMigratedCount = 0;
    let errorCount = 0;
    
    if (allCats.result && allCats.result.length > 0) {
      console.log(`找到 ${allCats.result.length} 只猫咪，开始处理...`);
      
      for (const cat of allCats.result) {
        try {
          // 如果已经有 no 字段，跳过
          if (cat.no) {
            // 如果同时有 _no 字段，移除它
            if (cat._no) {
              await db.collection('cat').updateOne(
                { _id: cat._id },
                { $unset: { _no: "" } }
              );
              console.log(`猫咪 ${cat._id} 已有 no 字段，已移除 _no 字段`);
            }
            alreadyMigratedCount++;
            continue;
          }
          
          // 如果有 _no 字段，迁移到 no
          if (cat._no) {
            await db.collection('cat').updateOne(
              { _id: cat._id },
              { 
                $set: { no: cat._no },
                $unset: { _no: "" }
              }
            );
            migratedCount++;
            console.log(`已迁移猫咪 ${cat._id}: _no=${cat._no} -> no=${cat._no}`);
          } else {
            // 既没有 _no 也没有 no，生成新的 no
            const newNo = 'c' + migratedCount + alreadyMigratedCount + errorCount;
            await db.collection('cat').updateOne(
              { _id: cat._id },
              { $set: { no: newNo } }
            );
            migratedCount++;
            console.log(`已为新猫咪 ${cat._id} 生成 no: ${newNo}`);
          }
        } catch (error) {
          console.error(`处理猫咪 ${cat._id} 时出错:`, error);
          errorCount++;
        }
      }
    }
    
    const result = {
      success: true,
      message: '迁移完成',
      stats: {
        total: allCats.result ? allCats.result.length : 0,
        migrated: migratedCount,        // 成功迁移的数量
        already_migrated: alreadyMigratedCount, // 已经迁移的数量
        errors: errorCount              // 出错的数量
      }
    };
    
    console.log('迁移完成:', result);
    return result;
    
  } catch (error) {
    console.error('迁移过程出错:', error);
    return {
      success: false,
      message: '迁移失败: ' + error.message
    };
  }
}