import cloud from '@lafjs/cloud'
import crypto from 'crypto';
import { getAppSecret } from '@/getAppSecret'

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
  // 触发数据表创建
  await db.collection(name).doc("init").set({name: "init"});
  await db.collection(name).doc("init").remove();

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

function genRSAKeys() {
  // 生成密钥对
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'secp256k1', // 使用secp256k1曲线
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
  return { privateKey, publicKey };
}


function genRandomKey() {
  const len = 32;
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}


export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.2";
  }

  const { opType } = body;

  if (opType == 'function') {
    return await checkFuncs(body.funcs);
  } else if (opType == 'database') {
    return await checkDb(body.dbName, body.dbInit);
  } else if (opType == 'resetSecret') {
    return await getAppSecret(true);
  } else if (opType == 'genRSAKeys') {
    return genRSAKeys();
  } else if (opType == 'genRandomKey') {
    return genRandomKey();
  }
  return "Unk opType";

}