// commentCheck 检查评论文本是否违规

import cloud from '@/cloud-sdk'
import axios from 'axios';

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx

  if (body.deploy_test === true) {
    // 进行部署检查
    return;
  }

  const openid = auth.openid;
  const access_token = await cloud.invoke('getAccessToken', {});
  // console.log("OpenID:", openid);
  // console.log("AccessToken:", access_token);

  try {
    const url = 'https://api.weixin.qq.com/wxa/msg_sec_check';
    const result = await axios.post(url, {
      openid: openid,
      scene: 2,
      version: 2,
      content: body.content,
      nickname: body.nickname
    }, {
      params: {
        access_token: access_token
      }
    });
    // console.log("Result", result);
    return result.data;
  } catch (err) {
    console.log("Error:", err);
    return err;
  }

}