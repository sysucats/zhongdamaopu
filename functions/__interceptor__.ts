import cloud from '@lafjs/cloud'
import CryptoJS from 'crypto-js';


// 检查签名是否有效
function verifySign(signKey: string, data: string, signature: string) {

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


export async function main(ctx: FunctionContext) {
  let signKey = cloud.env.SIGN_KEY;
  if (!signKey) {
    // 没有开启
    return true;
  }
  const { signdata, signstr } = ctx.headers;
  const isValid = verifySign(signKey, signdata, signstr);

  if (!isValid) {
    console.log("invalid sign");
    return false;
  }

  // 检查时间
  const now = new Date().toDateString();
  const threshold = 30;  // 秒
  const timeCheck = compareDateStrings(now, signdata, threshold);

  if (!timeCheck) {
    console.log("time check failed");
    return false;
  }

  return true;
}