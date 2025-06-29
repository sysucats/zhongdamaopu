module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  const axios = require('axios');
  const FormData = require('form-data');
  const {
    _id,
    scene,
    page,
    width,
    use_private_tencent_cos
  } = ctx.args
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
    contentType: 'json',
    responseType: 'arraybuffer'
  }, );

  // 检查响应状态
  if (rsp.status !== 200) {
    throw new Error(`获取小程序码失败: ${rsp.status}`);
  }

  // 判断返回内容类型
  const contentType = rsp.headers['content-type'];
  if (contentType && contentType.indexOf('application/json') !== -1) {
    // 解析错误信息
    const errJson = JSON.parse(Buffer.from(rsp.data).toString());
    throw new Error(`微信接口错误: ${errJson.errmsg || '未知错误'} (errcode: ${errJson.errcode})`);
  }

  // 将二进制数据写入临时文件
  const fs = require('fs');
  const tmp = require('tmp');
  const tmpFile = tmp.fileSync();
  fs.writeFileSync(tmpFile.name, Buffer.from(rsp.data));

  const cat_id = _id;

  try {
    // 使用临时文件路径上传
    if (use_private_tencent_cos) {
      const data = (await ctx.mpserverless.function.invoke('getURL', {
        fileName: `/mpcode/${cat_id}.jpg`
      })).result;
      const formData = new FormData();
      for (const key in data.formData) {
        formData.append(key, data.formData[key]);
      }
      formData.append('file', fs.createReadStream(tmpFile.name));
      const uploadRsp = await axios.post(data.postURL, formData, {
        headers: formData.getHeaders()
      });
      const cleanKey = data.formData.key.startsWith("/") ? data.formData.key.slice(1) : data.formData.key;
      const fileUrl = data.postURL + cleanKey;
      fs.unlinkSync(tmpFile.name);
      await ctx.mpserverless.db.collection('cat').updateOne({
        _id: cat_id
      }, {
        $set: {
          mpcode: fileUrl
        }
      });
      return fileUrl;
    } else {
      const uploadResult = await ctx.mpserverless.file.uploadFile({
        filePath: tmpFile.name,
        cloudPath: `/mpcode/${cat_id}.jpg`,
      });
      fs.unlinkSync(tmpFile.name);
      await ctx.mpserverless.db.collection('cat').updateOne({
        _id: cat_id
      }, {
        $set: {
          mpcode: uploadResult.fileUrl
        }
      });
      return uploadResult.fileUrl;
    }

  } catch (error) {
    // 删除临时文件
    if (fs.existsSync(tmpFile.name)) {
      fs.unlinkSync(tmpFile.name);
    }
    throw error;
  }
};