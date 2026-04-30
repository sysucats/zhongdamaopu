const { createInternalCtx } = require('./_helper.js')
const isManagerHandler = require('./isManager.js')

module.exports = async (ctx) => {
  const is_manager = await isManagerHandler(createInternalCtx(ctx, {
    openid: ctx.args.openid,
    req: ctx.args.action === 'delete' ? 99 : 2
  }))
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

  if (ctx.args.action !== 'delete') {
    if (cat === null || cat === undefined || cat.name === null || cat.name === undefined) {
      return {
        msg: 'name字段不能为空',
        result: false
      };
    }

    const trimmedName = cat.name.replace(/[\s\u3000]/g, '');
    if (trimmedName === '') {
      return {
        msg: 'name字段不能仅包含空格字符（包括全角空格和半角空格）',
        result: false
      };
    }
  }

  if (cat_id) {
    if (ctx.args.action === 'delete') {
      try {
        const catRes = await db.collection('cat').find({
          _id: cat_id
        });
        if (catRes.result && catRes.result.length > 0) {
          const deleteResult = await db.collection('cat').updateOne({
            _id: cat_id
          }, {
            $set: {
              deleted: 1,
              update_time: currentTime
            }
          });

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

    try {
      const oldCatRes = await db.collection('cat').find({
        _id: cat_id
      });
      if (oldCatRes.result && oldCatRes.result.length > 0) {
        const oldData = oldCatRes.result[0];

        if (cat.sterilized !== undefined && oldData.sterilized !== cat.sterilized) {
          cat.sterilized_time = cat.sterilized === true ? currentTime : null;
        }

        if (cat.adopt !== undefined && oldData.adopt !== cat.adopt) {
          cat.adopt_time = cat.adopt === 1 ? currentTime : null;
        }

        if (cat.missing !== undefined && oldData.missing !== cat.missing) {
          cat.missing_time = cat.missing === true ? currentTime : null;
        }

        if (cat.to_star !== undefined && oldData.to_star !== cat.to_star) {
          cat.deceased_time = cat.to_star === true ? currentTime : null;
        }
      }
      cat.update_time = currentTime;
    } catch (error) {
      console.log("获取猫猫旧数据失败:", error);
      cat.update_time = currentTime;
    }

    var cat_data = deepcopy(cat);
    return await db.collection('cat').updateOne({
      _id: cat_id
    }, {
      $set: cat_data
    });
  } else {
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
      _no += random_string(2);
    }
    cat._no = _no;
    cat.create_time = currentTime;
    cat.update_time = currentTime;

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
    const copyKeys = ['area', 'campus', 'characteristics',
      'colour', 'father', 'gender', 'mother', 'name', 'nickname', 'popularity', 'sterilized', 'adopt',
      'missing', 'birthday', 'habit', 'tutorial', 'relation', 'to_star', 'deleted',
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
