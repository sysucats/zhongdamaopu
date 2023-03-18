import cloud from '@lafjs/cloud'
import axios from 'axios';

const db = cloud.database();

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, user 是授权对象
  const { body, query } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }
  const { MP_APPID, MP_SECRET } = await cloud.invoke("getAppSecret", {});

  // 读取数据库
  const record = (await db.collection('setting').doc("accessToken").get()).data;
  if (record && Math.floor(Date.now() / 1000) < record.expiredAt) {
    // 未超时，直接返回
    console.log("未超时，直接返回", record);
    return record.accessToken;
  }

  // 重新获取
  const result = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
    params: {
      appid: MP_APPID,
      secret: MP_SECRET,
      grant_type: 'client_credential'
    }
  });

  if (result.data.errcode) {  // 获取失败
    console.log("Access Token 获取失败 ", result.data);
    return result.data;
  }

  // 更新数据库
  const data = {
    accessToken: result.data.access_token,
    expiredAt: Math.floor(Date.now() / 1000) + result.data.expires_in
  };
  if (record) {
    console.log("更新数据库记录", data);
    await db.collection('setting').doc("accessToken").update(data);
  }
  else {
    console.log("创建数据库记录", data);
    await db.collection('setting').doc("accessToken").set(data);
  }
  
  return data.accessToken;
}
