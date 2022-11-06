// getMpCode 生成小程序码，无限数量，但是参数长度限制为32
// - 生成一张猫猫的mpcode，顺便保存。
// - 如果这只猫猫已经有了mpcode，那就不应该调用这个函数

import cloud from '@/cloud-sdk';
import axios from 'axios';
const Minio = require('minio')
const db = cloud.database();

async function uploadImg(imgObj, imgName) {
  // minIO 配置
  const { LAF_OSS_URL, LAF_PORT, LAF_BUCKET } = await cloud.invoke("getAppSecret", {});
  const ossPath = `https://${LAF_OSS_URL}:${LAF_PORT}/${LAF_BUCKET}/`
  
  const client = new Minio.Client({
    bucketName: LAF_BUCKET,
    endPoint: LAF_OSS_URL,
    port: LAF_PORT,
    useSSL: true,
    accessKey: cloud.env.OSS_ACCESS_KEY,
    secretKey: cloud.env.OSS_ACCESS_SECRET,
  });
  const metadata = {
    'Content-type': 'image/jpeg',
  };

  client.putObject(LAF_BUCKET, imgName, imgObj, metadata);

  return ossPath;
}

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx

  // 数据库操作
  if (body.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const cat_id = body._id;
  const access_token = await cloud.invoke('getAccessToken', {});

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



