

import cloud from '@/cloud-sdk'
const db = cloud.database();
const _ = db.command;

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx

  const type = body.type;

  if (type == "likeAdd") {
    const item_type = body.item_type;
    const item_id = body.item_id;
    return like_add(item_type, item_id);
  }
  else if (type == "interRecordUpdate") { // 更新在 inter 集合的点赞记录
    const record_id = body.record_id;
    return await db.collection('inter').doc(record_id).update({
        count: 1
    });
  }
  else if (type == "interRecordAdd") { // 为点赞在 inter 集合创建记录 
    const record_item = body.record_item;
    return await db.collection('inter').add(record_item);
  }

  return `unk type ${type}`;
}

async function like_add(item_type, item_id) {
  return await db.collection(item_type).doc(item_id).update({
    like_count: _.inc(1),
  });
}

