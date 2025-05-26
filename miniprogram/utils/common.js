// 存放共享功能，避免循环引用
const app = getApp();

// 获取当前用户的openid
async function getCurrentUserOpenid() {
  try {
    const res = await app.mpServerless.user.getInfo({
      authProvider: 'wechat_openapi'
    });
    if (res.success) {
      return res.result.user.oAuthUserId;
    }
    return null;
  } catch (error) {
    console.log("getCurrentUserOpenid error:", error);
    return null;
  }
}

async function downloadFile(filePath) {
  return new Promise(function (resolve, reject) {
    wx.downloadFile({
      url: filePath,
      success(res) {
        console.log('cloud.downloadFile(laf) success', res);
        resolve(res);
      },
      fail: res => reject(res)
    });
  });
}

module.exports = {
  getCurrentUserOpenid,
  downloadFile
}