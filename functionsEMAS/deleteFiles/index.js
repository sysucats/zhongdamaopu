module.exports = async (ctx) => {
    const fileIDs = ctx.args.photoIDs
    if (fileIDs && fileIDs.length > 0) {
        for (var idx in fileIDs) {
            if (!fileIDs[idx].includes('cdn.bspapp.com')) {
                continue;
            }
            await ctx.mpserverless.file.deleteFile(fileIDs[idx])
        }
        return { success: true, deletedCount: fileIDs.length };
    } else {
        return { success: false, message: "没有提供文件ID" };
    }
}