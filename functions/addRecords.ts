// addRecords 数据库操作云函数
import cloud from '@lafjs/cloud'
import { EJSON } from 'bson'

const db = cloud.database();
const _ = db.command;

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx;

  const collection = body.collection;
  var data = body.data;
  data = Buffer.from(data, "base64").toString('utf-8');
  data = JSON.parse(data);
  console.log("curdOp param:", body);

  for (var idx in data) {
    var record = EJSON.parse(data[idx]);
    console.log("mdate type:", typeof (record.mdate));
    var id = record._id;
    console.log(id);
    delete record._id;
    await db.collection(collection).doc(id).set(record);
  }
  return "success";
}

async function deleteAll(collection) {
  return await db.collection(collection).remove({ multi: true });
}
