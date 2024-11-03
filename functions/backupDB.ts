/**
 * 本函数在老的1.0Laf上运行，用于备份数据库
 * bucket 配置为新Laf的存储桶名称
 * credentialsURL 配置为新Laf的获取临时密钥的函数地址
 * 
 * 结果：在新Laf存储桶的BackupDB目录下，会生成info.json和各个数据库的json文件
 */
import cloud from "@lafjs/cloud";
import { EJSON } from 'bson'
import { S3 } from "@aws-sdk/client-s3"

const BACKUP_LAF_APPID = process.env.BACKUP_LAF_APPID
const bucket = `${BACKUP_LAF_APPID}-backup`; // 填目标迁移laf的存储桶名称，打开读写权限
const credentialsURL = `https://${BACKUP_LAF_APPID}.laf.run/get-oss-sts` // 目标迁移laf的获取临时密钥的函数地址


function _getDateStr () {
    // 获取当前日期和时间
    const now = new Date();
    // 将 UTC 时间转换为北京时间 (UTC+8)
    const beijingOffset = 8 * 60; // 北京时间与UTC的时差，以分钟为单位
    const beijingTime = new Date(now.getTime() + beijingOffset * 60 * 1000);
    
    // 格式化为 yyyymmddHHMM
    const year = beijingTime.getFullYear();
    const month = String(beijingTime.getMonth() + 1).padStart(2, '0'); // 月份从0开始，所以要加1
    const day = String(beijingTime.getDate()).padStart(2, '0');
    const hours = String(beijingTime.getHours()).padStart(2, '0');
    const minutes = String(beijingTime.getMinutes()).padStart(2, '0');

    const formattedDate = `${year}${month}${day}${hours}${minutes}`;

    return formattedDate; // 返回格式化后的日期字符串
}

export async function main(ctx: FunctionContext) {
  const { credentials, endpoint, region } = (await cloud.fetch(credentialsURL)).data;
  const BackupDBPath = `BackupDB_${_getDateStr()}`;
  console.log(BackupDBPath);
  const s3Client = new S3({
    endpoint: endpoint,
    region: region,
    credentials: {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
      expiration: credentials.Expiration,
    },
    forcePathStyle: true,
  })
  //查询全部集合名
  const collections = await cloud.mongo.db.listCollections().toArray();
  const filteredData = collections.filter(
    (obj) => obj.name !== "__functions__" && obj.name !== "__function_logs__"
  );
  const DbListName = filteredData.map((obj) => obj.name);
  let dbInfo = {}
  if (DbListName.length > 0) {
    for (const DbName of DbListName) {
      //数据库：查询表名为DbName的数据库的总数
      const db = cloud.database();
      const collection = db.collection(DbName);
      const countResult = await collection.count();
      const total = countResult.total;
      //记录全部数据表信息
      dbInfo[DbName] = total
      //计算需分几次取
      const batchTimes = Math.ceil(total / 1000);
      //批量获取数据
      let start = 0
      //如果查询到批次
      const batchRes = await db.collection("BackupDB").where({ DbName: DbName }).getOne()
      if (batchRes.data) {
        start = batchRes.data.Batch
      }
      for (let i = start; i < batchTimes; i++) {
        try {
          const res = await collection.skip(i * 1000).limit(1000).get();
          const filename = `${BackupDBPath}/${DbName}/${i}.json`
          const upload_res = await s3Client.putObject({
            Bucket: bucket,
            Key: filename,
            Body: EJSON.stringify(res.data),
            ContentType: 'application/json',
          })
          // 记录插入表的批次，保存到数据库
          console.log(`插入${DbName}表第${i}批数据成功`);
          await db.collection("BackupDB").add({
            DbName: DbName,
            Batch: i,
          })
        } catch (error) {
          console.log(error);
          return { data: "备份出错：" + error };
        }
      }
    }
    const filename = `${BackupDBPath}/info.json`
    const upload_res = await s3Client.putObject({
      Bucket: bucket,
      Key: filename,
      Body: JSON.stringify(dbInfo),
      ContentType: 'application/json',
    })
    if (upload_res.$metadata.httpStatusCode == 200) {
      // 记录日志
      console.log("全部数据库备份成功");
      return { data: "全部数据库备份成功" };
    } else {
      return { data: "备份失败" };
    }
  }
}
