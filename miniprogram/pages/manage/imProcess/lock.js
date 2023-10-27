import utils from "../../../utils/utils";
import userUtils from "../../../utils/user";
import api from "../../../utils/cloudApi";

const generateUUID = utils.generateUUID;


async function geneKey(type) {
  if (type == "uuid") {
    return generateUUID();
  }

  if (type == "device") {
    return await geneUserDeviceKey();
  }
}

async function geneUserDeviceKey() {
  const user = await userUtils.getUser();
  const device = await wx.getSystemInfoSync();
  console.log(user, device);
  const key = `${user.openid}-${user.userInfo.nickName}-${device.platform}-${device.model}-${device.version}-${device.SDKVersion}`;
  return key;
}

async function lock(scene, key, limit, expire_minutes) {
  var expire_date = new Date();
  expire_date.setMinutes(expire_date.getMinutes() + expire_minutes);

  let res = (await api.globalLock({
    op: "lock",
    scene: scene,
    key: key,
    limit: limit,
    expire_date: expire_date,
  })).result;
  console.log("lock:", res);

  return res;
}

async function unlock(scene, key) {
  return (await api.globalLock({
    op: "unlock",
    scene: scene,
    key: key,
  })).result;
}

async function getLockList(scene) {
  var res = (await api.globalLock({
    op: "getLockList",
    scene: scene,
  })).result;

  for (var item of res) {
    item.expire_date = new Date(item.expire_date);
    item.expire_date_str = item.expire_date.toLocaleString();
  }

  return res;
}

module.exports = {
  geneKey: geneKey,
  lock: lock,
  unlock: unlock,
  getLockList: getLockList,
};
