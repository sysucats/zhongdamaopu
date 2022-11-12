import cloud from '@/cloud-sdk';
import axios from 'axios';

exports.main = async function (ctx: FunctionContext) {
  const { MP_APPID, MP_SECRET } = await cloud.invoke("getAppSecret", {});
  const code = ctx.body.code;

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
