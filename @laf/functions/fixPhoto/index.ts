

import cloud from '@/cloud-sdk'

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx

  // 数据库操作
  const db = cloud.database()
  const r = await db.collection('user').where({ openid: "oGT1H46AN-53FowXUPgk8zN_Qq3Q" }).get();
  console.log(r.data);
  // const r = await db.collection('photo').where({ photo_compressed: { $exists: true } }).orderBy("mdate", "desc").skip(200).limit(100).get();
  // console.log(r.data.length);

  // for (var item of r.data) {
  //   console.log(item._id);
  //   console.log(item.photo_compressed)
  //   console.log(item.photo_watermark)
  //   await cloud.invoke("deleteFiles", { body: { fileIDs: [item.photo_compressed, item.photo_watermark] } });
  //   await db.collection('photo').doc(item._id).update({$unset: { photo_compressed: "", photo_watermark: "" }})
  // }

  return;
}
