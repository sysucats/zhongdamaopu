import cloud from '@/cloud-sdk'

function remove_expire(keys) {
  if (!keys) {
    return keys;
  }
  const now = new Date();
  // 过滤过期的key
  return keys.filter(item => now < (new Date(item.expire_date)));
}

function lock(scene, key, limit, expire_date) {
  var scene_keys = cloud.shared.get(scene);
  console.log("scene_keys:", scene_keys);

  scene_keys = remove_expire(scene_keys);
  console.log("remove_expire scene_keys:", scene_keys);

  if (!scene_keys) {
    scene_keys = [];
  }

  const existed_index = scene_keys.findIndex(item => item.key == key);
  if (existed_index != -1) {
    // key已经存在，更新一下过期时间
    scene_keys[existed_index].expire_date = expire_date;
    cloud.shared.set(scene, scene_keys);
    return key;
  }

  if (scene_keys.length >= limit) {
    console.log(`full of scene: ${scene}, keys: ${scene_keys}`);
    return null;
  }

  scene_keys.push({key: key, expire_date: expire_date});

  cloud.shared.set(scene, scene_keys);

  return key;
}

function unlock(scene, key) {
  var scene_keys = cloud.shared.get(scene);

  scene_keys = remove_expire(scene_keys);

  // 一个key都没有
  if (!scene_keys || scene_keys.length == 0) {
    return;
  }

  // 删除key
  const index = scene_keys.findIndex(item => item.key == key);
  if (index > -1) {
    scene_keys.splice(index, 1);
  }

  cloud.shared.set(scene, scene_keys);

  return;
}


function getLockList(scene) {
  var scene_keys = cloud.shared.get(scene);
  return scene_keys;
}

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, auth 是授权对象
  const { auth, body, query } = ctx

  console.log("body", body);

  const op = body.op;  // lock, unlock
  const scene = body.scene;
  const key = body.key;
  const limit = body.limit;
  const expire_date = body.expire_date;

  if (op == "lock") {
    return lock(scene, key, limit, expire_date);
  }

  if (op == "unlock") {
    return unlock(scene, key);
  }

  if (op == "getLockList") {
    return getLockList(scene);
  }

  console.log(`unknow op: ${op}`);
  return false;
}
