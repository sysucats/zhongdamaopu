module.exports = async (ctx) => {
  const db = ctx.mpserverless.db;

  try {
    // 同时重命名两个字段
    const updateResult = await db.collection('cat').updateMany(
      { 
        $or: [
          { no: { $exists: true } },
          { mpcode: { $exists: true } }
        ]
      },
      { 
        $rename: { 
          "no": "_no", 
          "mpcode": "mpcode_old" 
        } 
      }
    );

    // 直接返回数据库操作的原始结果
    return updateResult;

  } catch (error) {
    console.error('迁移失败:', error);
    // 错误时返回错误信息
    return {
      error: error.message,
      success: false
    };
  }
};