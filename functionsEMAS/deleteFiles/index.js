module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  const fileIDs = ctx.args.photoIDs
  if (fileIDs && fileIDs.length > 0) {
    for (var idx in fileIDs) {
      if (!fileIDs[idx].includes('cdn.bspapp.com')) {
        continue;
      }
      await ctx.mpserverless.file.deleteFile(fileIDs[idx])
    }
    return {
      success: true,
      deletedCount: fileIDs.length
    };
  } else {
    return {
      success: false,
      message: "没有提供文件ID"
    };
  }
}