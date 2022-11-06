// getAccessToken 获取微信接口调用凭据
// https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Get_access_token.html

import cloud from '@/cloud-sdk';
import axios from 'axios';

const db = cloud.database();

exports.main = async function (ctx: FunctionContext) {
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
