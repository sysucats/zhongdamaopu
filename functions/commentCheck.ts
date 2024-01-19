// commentCheck 检查评论文本是否违规

import cloud from '@lafjs/cloud'
import axios from 'axios';

import { getAccessToken } from '@/getAccessToken'

export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.1";
  }

  const openid = ctx.user?.openid;
  const access_token = await getAccessToken();

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