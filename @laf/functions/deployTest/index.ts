import cloud from '@/cloud-sdk'

async function checkFuncs(funcs) {
  let res = {
    "ok": [],
    "ver_err": [],
    "not_exist": [],
  };

  for (const name in funcs) {
    try {
      const funcRes = await cloud.invoke(name, { body: { deploy_test: true } });
      console.log(name, funcs[name], res);
      if (funcRes == funcs[name]) {
        res["ok"].push(name);
      } else {
        res["ver_err"].push(name);
      }
    } catch {
        res["not_exist"].push(name);
    }
    
  }
  return res;
}

async function checkDb(name: string, initData: Array<any>) {
  const db = cloud.database();
  const count = await db.collection(name).count();
  if (count.total >= initData.length) {
    return {"ok": true};
  }

  for (let idx in initData) {
    let record = initData[idx];
    console.log(record);
    let id = record._id;
    delete record._id;

    await db.collection(name).doc(id).set(record);
  }

  return {"ok": true};
}

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  const { opType } = body;

  if (opType == 'function') {
    return await checkFuncs(body.funcs);
  } else if (opType == 'database') {
    return await checkDb(body.dbName, body.dbInit);
  } else if (opType == 'resetSecret') {
    return await cloud.invoke("getAppSecret", { body: { reset: true } });
  }
  return "Unk opType";

}
