import cloud from '@lafjs/cloud'
import CryptoJS from 'crypto-js';


// 检查签名是否有效
function verifySign(signKey: string, data: string, signature: string) {
  if (!signKey || !data || !signature) {
    return false;
  }

  // 使用HMAC-SHA256算法进行验证
  const isValid = CryptoJS.HmacSHA256(data, signKey).toString() === signature;
  return isValid;
}


function compareDateStrings(dateString1: string, dateString2: string, n: number): boolean {
  const date1 = new Date(dateString1);
  const date2 = new Date(dateString2);
  const diffInSeconds = Math.abs((date1.getTime() - date2.getTime()) / 1000);
  return diffInSeconds <= n;
}


export async function main(ctx: FunctionContext, next: Function) {
  // 请求的实际IP
  const ip = ctx.headers['x-real-ip']
  const { host } = ctx.headers;
  const { APPID, DEV_IPS } = process.env;

  if (ip === undefined && host === `${APPID}.${APPID}:8000`) {
    // 触发器触发
    return await next(ctx);
  }

  // 白名单ip，用于开发
  if (DEV_IPS && DEV_IPS.split(",").includes(ip)) {
    return await next(ctx);
  }


  let signKey = process.env.SIGN_KEY;
  if (signKey) {
    // 开启了签名检查
    const { signdata, signstr } = ctx.headers;
    const isValid = verifySign(signKey, signdata, signstr);

    if (!isValid) {
      console.log("invalid sign");
      console.log(ctx.headers);
      console.log(process.env);
      return "invalid sign";
    }

    // 检查时间
    const now = new Date().toISOString();
    const threshold = 60;  // 秒
    const timeCheck = compareDateStrings(now, signdata, threshold);

    if (!timeCheck) {
      console.log("time check failed", now, signdata);
      console.log(ctx.headers);
      console.log(process.env);
      return "time check failed";
    }
  }

  return await next(ctx);
}