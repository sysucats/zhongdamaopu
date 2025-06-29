module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
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
  if (cat_id) {
    var cat_data = deepcopy(cat);
    return await ctx.mpserverless.db.collection('cat').updateOne({
      _id: cat_id
    }, {
      $set: cat_data
    });
  } else {
    const {
      result: count
    } = await ctx.mpserverless.db.collection('cat').count({});
    var _no = 'c' + count;
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
    cat.no = _no;
    return await ctx.mpserverless.db.collection('cat').insertOne(cat);
  }

  function deepcopy(origin) {
    // not for modifying.
    const copyKeys = ['area', 'campus', 'characteristics',
      'colour', 'father', 'gender', 'mother', 'name', 'nickname', 'popularity', 'sterilized', 'adopt',
      'missing', 'birthday', 'habit', 'tutorial', 'relation', 'to_star'
    ]
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
}