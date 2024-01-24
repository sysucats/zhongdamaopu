import cloud from '@lafjs/cloud'
import axios from 'axios';
import { getAppSecret } from '@/getAppSecret'

export async function login(code: string) {
  const { MP_APPID, MP_SECRET } = await getAppSecret(false);

  console.log(MP_APPID, MP_SECRET);

  // https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/login/auth.code2Session.html
  const resp = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
    params: {
      appid: MP_APPID,
      secret: MP_SECRET,
      js_code: code,
      grant_type: 'authorization_code'
    }
  });

  if (!resp.data.openid) {
    console.log('获取 openid 失败', resp.data);
    return {
      msg: resp.data.errmsg
    };
  }

  console.log('成功取得 openid', resp.data);
  const payload = {
    openid: resp.data.openid,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 默认 7 天过期
  };
  const token = cloud.getToken(payload);
  return {
    token,
    openid: resp.data.openid,
    expiredAt: payload.exp,
    msg: 'OK'
  };
}

export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.1";
  }
  
  return await login(body.code);
}
