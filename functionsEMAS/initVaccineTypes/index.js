module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  const openid = ctx.args?.openid;
  const {
    result: is_manager
  } = await ctx.mpserverless.function.invoke('isManager', {
    openid: openid,
    req: 2
  })
  if (!is_manager) {
    return {
      msg: 'not a manager',
      result: false
    };
  }
  // 检查是否已存在疫苗类型
  const {
    result: settingExists
  } = await ctx.mpserverless.db.collection('setting').findOne({
    _id: 'vaccine_type'
  });

  if (!settingExists) {
    await ctx.mpserverless.db.collection('setting').insertOne({
      _id: 'vaccine_type',
      types: ["猫三联", "狂犬疫苗", "猫白血病", "猫传腹", "体内驱虫", "体外驱虫"]
    });
    return {
      msg: '疫苗类型初始化成功',
      result: true
    };
  } else {
    const {
      result: vaccineTypes
    } = await ctx.mpserverless.db.collection('setting').findOne({
      _id: 'vaccine_type'
    });
    return {
      msg: '疫苗类型已存在',
      result: true,
      types: vaccineTypes.types
    };
  }
}