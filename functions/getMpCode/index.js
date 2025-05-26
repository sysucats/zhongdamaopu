module.exports = async (ctx) => {
    const { _id, scene, page, width } = ctx.args
    const access_token = await ctx.mpserverless.function.invoke('getAccessToken')

    var requestData = {
        scene: scene,
        page: page,
        check_path: false,
        width: width
    }


    // 获取小程序码
    const rsp = await ctx.httpclient.request(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${access_token.result}`, {
        method: 'POST',
        data: requestData,
        responseType: 'arraybuffer'
    },);

    // 检查响应状态
    if (rsp.status !== 200) {
        throw new Error(`获取小程序码失败: ${rsp.status}`);
    }

    // 将二进制数据写入临时文件
    const fs = require('fs');
    const tmp = require('tmp');
    const tmpFile = tmp.fileSync();
    fs.writeFileSync(tmpFile.name, Buffer.from(rsp.data));

    const cat_id = _id;

    try {
        // 使用临时文件路径上传
        const uploadResult = await ctx.mpserverless.file.uploadFile({
            filePath: tmpFile.name,
            cloudPath: `/mpcode/${cat_id}.jpg`,
        });

        // 删除临时文件
        fs.unlinkSync(tmpFile.name);

        // 更新数据库
        await ctx.mpserverless.db.collection('cat').updateOne({ _id: cat_id }, { $set: { mpcode: uploadResult.fileUrl } });

        return uploadResult.fileUrl;
    } catch (error) {
        // 删除临时文件
        if (fs.existsSync(tmpFile.name)) {
            fs.unlinkSync(tmpFile.name);
        }
        throw error;
    }
};