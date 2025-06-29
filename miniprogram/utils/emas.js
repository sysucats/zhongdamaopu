import { signCosUrl } from './common';

// 注入各种函数
function injectEmas(mpServerless) {
  const collectionPrototype = mpServerless.db.collection('$').__proto__;

  // 对find、findOne获取的数据进行CosUrl签名
  const _findOne = collectionPrototype.findOne;
  collectionPrototype.findOne = async function (...args) {
    try {
      let res = await _findOne.call(this, ...args);
      // console.log("findOne result:", res);
      await _deepReplaceCosUrl(res);
      return res;
    } catch (err) {
      throw err;
    }
  };

  const _find = collectionPrototype.find;
  collectionPrototype.find = async function (...args) {
    try {
      let res = await _find.call(this, ...args);
      // console.log("find result:", res);
      await _deepReplaceCosUrl(res);
      return res;
    } catch (err) {
      throw err;
    }
  };

}


async function _deepReplaceCosUrl(obj) {
  for (let key in obj) {
    // console.log(key, obj[key]);
    if (typeof obj[key] === 'string') obj[key] = await signCosUrl(obj[key])
    else if (typeof obj[key] === 'object') await _deepReplaceCosUrl(obj[key])
  }
}

module.exports = {
  injectEmas
};
