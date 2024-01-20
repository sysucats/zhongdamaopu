// getMpCode 生成小程序码，无限数量，但是参数长度限制为32
// - 生成一张猫猫的mpcode，顺便保存。
// - 如果这只猫猫已经有了mpcode，那就不应该调用这个函数

import cloud from '@lafjs/cloud'
import axios from 'axios';
import * as Minio from 'minio';

import { getAppSecret } from "@/getAppSecret"
import { getAccessToken } from '@/getAccessToken'

const db = cloud.database();

async function uploadImg(imgObj, imgName) {
  // minIO 配置
  // minIO 配置
  const { OSS_ENDPOINT, OSS_PORT, OSS_BUCKET, OSS_SECRET_ID, OSS_SECRET_KEY } = await getAppSecret(false);
  
  // 报错"Invalid endPoint"请参考: https://blog.csdn.net/xinleicol/article/details/115698599
  const client = new Minio.Client({
    bucketName: OSS_BUCKET,
    endPoint: OSS_ENDPOINT,
    port: OSS_PORT,
    useSSL: true,
    accessKey: OSS_SECRET_ID,
    secretKey: OSS_SECRET_KEY,
  });

  let ossPath = `https://${OSS_ENDPOINT}:${OSS_PORT}/${OSS_BUCKET}/`
  if (OSS_SECRET_ID) {
    ossPath = `https://${OSS_BUCKET}.${OSS_ENDPOINT}:${OSS_PORT}/`
  }

  const metadata = {
    'Content-type': 'image/jpeg',
  };

  const res = await client.putObject(OSS_BUCKET, imgName, imgObj, metadata);
  console.log(res);

  return ossPath;
}

export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.1";
  }

  // 数据库操作
  if (body.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const cat_id = body._id;
  const access_token = await getAccessToken();

  // scene是页面参数，长度限制32。page是页面路径，不需要'/'开头。
  var params = {
    scene: body.scene,
    page: body.page,
    check_path: false,
    width: body.width
  }

  try {
    // POST https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=ACCESS_TOKEN
    const rsp = await axios.request({
      method: 'POST',
      url: `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${access_token}`,
      data: params,
      responseType: 'arraybuffer'
    });
    const imgObj = rsp.data;
    const imgUrl = `mpcode/${cat_id}.jpg`;
    const ossPath = await uploadImg(imgObj, imgUrl);
    const realImagUrl = ossPath + imgUrl;
    await db.collection('cat').doc(cat_id).update({ mpcode: realImagUrl });
    console.log(realImagUrl);
    return realImagUrl;
  } catch (err) {
    console.log(err)
    return { err: err, params: params }
  }
}

