const config = require('./config.js');

const use_wx_cloud = config.use_wx_cloud;
const laf_url = config.laf_url;

var cloud = wx.cloud;

if (!use_wx_cloud) {
  cloud = require('laf-client-sdk').init({
    baseUrl: laf_url,
    dbProxyUrl: '/proxy/miniprogram',
    getAccessToken: () => {
      const accessToken = wx.getStorageSync('accessToken');
      if (!accessToken) {
        return;
      }
      return accessToken.token;
    },
    environment: 'wxmp'
  });
  
  // 检查 accessToken 是否未取得/已过期，若是则去获取
  (async function ensureToken() {
    const accessToken = wx.getStorageSync('accessToken');
    if (!accessToken || accessToken.expiredAt < Math.floor(Date.now() / 1000)) {
      console.log('开始获取 access token');
      const code = (await wx.login()).code;
      const res = await cloud.invokeFunction('login', { code });
      if (res.msg === 'OK') {
        console.log('成功获取 access token');
        wx.setStorageSync('accessToken', {
          token: res.token,
          expiredAt: res.expiredAt
        });
      } else {
        console.log('获取 access token 出错', res);
      }
    } else {
      console.log('access token 尚未过期，跳过获取');
    }
  })();
  
  // 搞一些骚操作替换 laf 数据库接口，使其兼容微信版本接口
  const documentPrototype = cloud.database().collection('$').doc('$').__proto__;

  const _update = documentPrototype.update;
  documentPrototype.update = async function (options) {
    try {
      const res = await _update.call(this, options.data);
      if (options.success) {
        options.success(res);
      }
      return res;
    } catch (err) {
      if (options.fail) {
        options.fail(err);
      }
      throw err;
    }
  }

  const _set = documentPrototype.set;
  documentPrototype.set = function (options) {
    try {
      const res = await _set.call(this, options.data);
      if (options.success) {
        options.success(res);
      }
      return res;
    } catch (err) {
      if (options.fail) {
        options.fail(err);
      }
      throw err;
    }
  }

  // TODO: 云函数调用兼容
  
  // TODO: 为 laf 定义与微信版本兼容的云存储接口
}

/**
 * TODO: 使用 cloudAccess.cloud 替换其他文件中原来使用的 wx.cloud，示例：
 * ```
 * const cloud = require('./cloudAccess.js').cloud;
 * // 获取数据库对象
 * const db = cloud.database();
 * // 调用云函数
 * cloud.invokeFunction('foo', {});
 * ```
 */

module.exports = {
  cloud: cloud
};
