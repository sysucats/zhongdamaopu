// 用于清理猫数据中的缺失值，便于在dashboard中进行统计，建议运行前先备份数据，或在测试环境运行，避免误操作。
// 建议分批处理少量的记录，修改第24行limit为你想要处理的记录数，避免误操作。
module.exports = async (ctx) => {
  const { args } = ctx;

  const db = ctx.mpserverless.db;

  // 默认值
  const defaultValues = {
    adopt: 0,        // 未领养
    missing: false,  // 未失踪
    gender: '未知',  // 性别未知
    to_star: false,  // 未返回喵星
    sterilized: false // 未绝育
  };

  try {
    // 限制处理的记录数
    const limit = args.limit || 1;

    // 查询条件：至少缺少一个需要设置默认值的字段
    const query = {
      $or: [
        { adopt: { $exists: false } },
        { missing: { $exists: false } },
        { gender: { $exists: false } },
        { to_star: { $exists: false } },
        { sterilized: { $exists: false } }
      ]
    };

    // 获取符合条件的猫记录
    const result = await db.collection('cat').find(query, { limit: limit });
    const cats = result.result || [];

    if (cats.length === 0) {
      return {
        msg: '没有找到需要更新的记录',
        result: true,
        updated: 0
      };
    }

    // 记录更新结果
    const updateResults = [];

    // 处理每一条记录
    for (const cat of cats) {
      const updateData = {};
      const currentTime = new Date().toISOString();

      // 检查每个字段是否缺失，如果缺失则设置默认值
      for (const [field, defaultValue] of Object.entries(defaultValues)) {
        if (cat[field] === undefined) {
          updateData[field] = defaultValue;
        }
      }

      // 记录更新时间
      updateData['update_time'] = currentTime;

      // 更新记录
      const updateResult = await db.collection('cat').updateOne({ _id: cat._id }, { $set: updateData });

      updateResults.push({
        cat_id: cat._id,
        cat_name: cat.name || cat._no,
        updated_fields: Object.keys(updateData),
        result: updateResult
      });
    }

    return {
      msg: '数据清洗完成',
      result: true,
      updated: updateResults.length,
      details: updateResults
    };

  } catch (error) {
    console.log('数据清洗出错:', error);
    return {
      msg: '数据清洗出错',
      result: false,
      error: error.message
    };
  }
}