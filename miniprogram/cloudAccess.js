import { use_wx_cloud, laf_url, laf_dev_url } from "./config"

var cloud = wx.cloud;

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

if (!use_wx_cloud) {
  const sysInfo = wx.getSystemInfoSync();
  console.log(sysInfo.platform);

  // 自定义请求函数
  const WxmpRequest = require('laf-client-sdk').WxmpRequest;
  var apikey = "";
  try {
    apikey = require('./appSecret').apikey;
  } catch {
    console.log("no apikey");
  }
  class MyRequest extends WxmpRequest {
    async request(url, data) {
      const res = await super.request(url, data)
      return res
    }

    getHeaders(token) {
      var headers = super.getHeaders(token);
      headers.apikey = apikey;
      console.log(headers);
      return headers;
    }
  }

  cloud = require('laf-client-sdk').init({
    baseUrl: (sysInfo.platform == 'devtools' ? laf_dev_url : laf_url),
    dbProxyUrl: '/proxy/miniprogram',
    getAccessToken: () => {
      const accessToken = wx.getStorageSync('accessToken');
      if (!accessToken) {
        return;
      }
      return accessToken.token;
    },
    environment: 'wxmp',
    requestClass: MyRequest
  });
  
  // 检查 accessToken 是否未取得/已过期，若是则去获取
  ensureToken();
  
  // 搞一些骚操作替换 laf 数据库接口，使其兼容微信版本接口
  const documentPrototype = cloud.database().collection('$').doc('$').__proto__;
  // console.log("DocumentPrototype:", documentPrototype);

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
  documentPrototype.set = async function (options) {
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

  // 云函数调用兼容 cloud.callFunction
  const cloudPrototype = cloud.__proto__;
  const _invokeFunction = cloudPrototype.invokeFunction;
  cloudPrototype.callFunction = async function (options) {
    try {
      const res = {
        result: await _invokeFunction.call(this, options.name, options.data)
      };

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

  // 上传文件兼容 cloud.uploadFile
  cloudPrototype.uploadFile = async function (options) {
    try {
      const res = await uploadFile(options);
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

  // 下载文件兼容 cloud.downloadFile
  cloudPrototype.downloadFile = async function (options) {
    const filePath = options.fileID;
    return new Promise(function (resolve, reject) {
      wx.downloadFile({
        url: filePath,
        success(res) {
          console.log('cloud.downloadFile(laf) success', res);
          if (options.success) {
            options.success(res);
          }
          resolve(res);
        },
        fail: res => reject(res)
      });
    });
  }

  console.log("Laf Cloud Prototype:", cloud.__proto__);
}

async function uploadFile(options) {
  const fileName = options.cloudPath;
  const filePath = options.filePath;
  
  const data = await cloud.invokeFunction("getURL", {
      fileName: fileName
  });

  const formData = data.formData;
  const postURL = data.postURL;
  return new Promise((resolve, reject) =>{ 
    wx.uploadFile({
      url: postURL,
      filePath: filePath,
      name: "file",
      formData: formData,
      success(res) {
        console.log('cloud.uploadFile(laf) success', res);
        // wx.uploadFile 和 wx.cloud.uplaodFile 返回值不一样
        // TODO 生成 fileID 按wxcloud生成的是图片的地址
        res.fileID = postURL + "/" + formData.key; 
        console.log("res.fileID", res.fileID);
        resolve(res);
      },
      fail (err) {
        reject(err);
      }
    })
  });
};

// async function downloadFile(options) {
//   const filePath = options.fileID;
//   // console.log("Download file", filePath); 
//   return new Promise((resolve, reject) =>{ 
//     wx.downloadFile({
//       url: filePath,
//       success(res) {
//         console.log('cloud.downloadFile(laf) success', res);
//         resolve(res);
//       },
//       fail (err) {
//         reject(err);
//       }
//     })
//   });
// };

/**
 TODO: 使用 cloudAccess.cloud 替换其他文件中原来使用的 wx.cloud，示例：
 ```
 const cloud = require('./cloudAccess.js').cloud;
 // 获取数据库对象
 const db = cloud.database();
 // 调用云函数
 cloud.invokeFunction('foo', {});
 ```
 */

module.exports = {
  cloud: cloud
};


