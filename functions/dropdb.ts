import cloud from '@lafjs/cloud'

const colls = []

export default async function (ctx: FunctionContext) {
  //查询全部集合名
  const allColls = await cloud.mongo.db.listCollections().toArray();
  let names = [];
  for (const x of allColls) {
    if (x.name.startsWith("__")) {
      continue;
    }
    names.push(x.name);
  }
  console.log(names);

  // 删除coll
  const db = cloud.database();
  for (const coll of colls) {
    const count = (await db.collection(coll).count()).total;
    console.log(`dropping ${coll} with ${count} items...`);
    cloud.mongo.db.dropCollection(coll);
    console.log(`dropping ${coll} done.`);
  }
}