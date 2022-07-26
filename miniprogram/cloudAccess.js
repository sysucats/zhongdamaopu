const use_wx_cloud = require('./config.js').use_wx_cloud;

var cloud = wx.cloud;

if (!use_wx_cloud) {
  cloud = require('laf-client-sdk').init({
    baseUrl: 'https://6ovcqp.sysucats.com:16778',
    // dbProxyUrl: '/proxy/miniprogram',
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
  async function ensureToken() {
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
  }
  
  ensureToken();
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
 * 
 * 已知问题：
 * - 数据库接口中 update/set 不兼容（微信多套一层 data）
 */

module.exports = {
  cloud: cloud
};
