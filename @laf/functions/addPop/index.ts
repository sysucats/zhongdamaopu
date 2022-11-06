// addPop 为被访问的猫增加一访问量

import cloud from '@/cloud-sdk'

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx

  if (body.deploy_test === true) {
    // 进行部署检查
    return;
  }

  const db = cloud.database();
  const _ = db.command;
  const cat_id = body.cat_id;
  const coll = body.org ? 'orgcat' : 'cat';
  return db.collection(coll).doc(cat_id).update( { popularity: _.inc(1) } );
}