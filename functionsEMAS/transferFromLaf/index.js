module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  // 本地密码设置，不能为“*”，修改成任意的其他字符，与laf端的云函数密码对应
  const {
    result: app_secret
  } = await ctx.mpserverless.db.collection('app_secret').findOne();
  const {
    IMPORT_KEY
  } = app_secret

  let body = JSON.parse(ctx.args.body);

  // 验证必要参数
  if (!body.coll || !body.data || !body.secret) {
    return {
      success: false,
      message: "缺少必要参数：需要提供coll、data、secret"
    };
  }

  try {
    // 步骤1: 获取参数
    const {
      coll,
      data,
      secret
    } = body;

    if (!IMPORT_KEY || secret != IMPORT_KEY) {
      return {
        success: false,
        message: "密码错误"
      }
    }

    // 步骤2: 写入数据库
    await ctx.mpserverless.db.collection(coll).insertMany(data);

    // 返回成功响应
    return {
      success: true,
      message: `数据成功写入 ${coll} 集合`
    };

  } catch (error) {
    // 错误时，切换成逐个插入
    const {
      coll,
      data
    } = body;
    let res = [];
    for (let i = 0; i < data.length; i++) {
      const element = data[i];
      try {
        await ctx.mpserverless.db.collection(coll).insertOne(element);
        res.push({
          success: true,
          _id: element._id,
          message: `数据成功写入 ${coll} 集合`
        })
      } catch (error) {
        res.push({
          success: false,
          _id: element._id,
          error: error.message,
          message: `数据处理或写入失败`
        })
      }
    }

    return res;
  }
};