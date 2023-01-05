import cloud from '@/cloud-sdk'

const db = cloud.database();

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx

  if (body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  // 数据库操作
  
  // 因为数据库有些 Date 直接用字符串表示了，而非套上：
  // "mphoto": {
  //  "$date": "2022-08-28T02:00:18.514Z"
  // }, 这种 Date 类型在数据库保存的正确格式

  // 涉及到 Date 的集合 - 字段
  // cat - mphoto
  // comment - create_date
  // feedback - openDate, dealDate
  // news - date, dateLastModify
  // photo, photo_rank, reward, user - mdate

  await _fixDate("cat", ["mphoto"]);
  await _fixDate("comment", ["create_date"]);
  await _fixDate("feedback", ["openDate", "dealDate", "replyDate"]);
  await _fixDate("news", ["date", "dateLastModify"]);
  await _fixDate("photo", ["mdate"]);
  await _fixDate("photo_rank", ["mdate"]);
  await _fixDate("reward", ["mdate"]);
  await _fixDate("user", ["mdate"]);

}

async function _fixDate(collection, fields) {
  // photo - photo_id, photo_compressed, photo_watermark
  const total_count = (await db.collection(collection).count()).total;
  var skip_now = 0;  // 每次取 1000 条
  while (skip_now < total_count) {
    skip_now += 1000;
    const records = (await db.collection(collection).limit(1000).skip(skip_now).get()).data;
    for (var i in records) {
      var record = records[i];
      var update_record = {};

      for (var j in fields) {
        var field = fields[j];
        var date_data = record[field];

        if (date_data != undefined && typeof (date_data) == "string") {
          update_record[field] = {
            "$date": date_data
          }
        }
      }
      if (JSON.stringify(update_record) != '{}') {
        const res = await db.collection(collection).doc(record._id).update( update_record );
        console.log(collection, i, update_record);
      }
    }
  }
}
