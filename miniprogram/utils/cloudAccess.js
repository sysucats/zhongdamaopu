import config, {
  laf_url,
  laf_dev_url,
  use_private_tencent_cos
} from "../config";
import {
  parseQueryParams,
  removeQueryParams,
  getDeltaHours
} from "./utils";
import { getCacheItem, setCacheItem, getCacheDate, setCacheDate, cacheTime } from "./cache";
import COS from '../packages/tencentcloud/cos';
import CryptoJS from 'crypto-js';

var cloud = undefined;
  
// 等待时间（ms），不能import utils，会循环引用
const sleep = m => new Promise(r => setTimeout(r, m))

function _splitOnce(str, sep) {
  const idx = str.indexOf(sep);
  return [str.slice(0, idx), str.slice(idx+1)];
}

// 提取COS的region和bucket字段
function _getRegionBucketPath(url) {
  // 返回：{region: 'ap-guangzhou', bucket: 'bucket-name', filePath: "xxx/xxx.xxx"}
  const regex = /http[s]*:\/\//i;
  const newUrl = url.replace(regex, '');
  const items = _splitOnce(newUrl, '/');
  const firstItems = items[0].split('.');

  if (firstItems[0] !== 'cos') {
    // 例如：https://bucket-name.cos.ap-guangzhou.myqcloud.com/sample.png
    return {region: firstItems[2], bucket: firstItems[0], filePath: items[1]}
  }

  // 例如：https://cos.ap-guangzhou.myqcloud.com/bucket-name/sample.png
  const path = _splitOnce(items[1], '/');
  return {region: firstItems[1], bucket: path[0], filePath: path[1]}
}

// 检查是否需要重新签名
async function _needResign(url) {
  if (!url.includes("?")) {
    return true;
  }

  let params = parseQueryParams(url);
  let signTime = parseInt(params["q-sign-time"]);
  // 检查是否有签名，签名是否过期
  if (!signTime || getDeltaHours(signTime) * 3600 > config.sign_expires_tencent_cos) {
    return true;
  }

  return false;
}

// 实际签名操作
async function _doCosSign(url) {
  const cosInfo = _getRegionBucketPath(url);
  return new Promise((resolve) => {
    cloud.cos.getObjectUrl({
      Bucket: cosInfo.bucket, /* 填入您自己的存储桶，必须字段 */
      Region: cosInfo.region, /* 存储桶所在地域，例如 ap-beijing，必须字段 */
      Key: cosInfo.filePath, /* 存储在桶里的对象键（例如1.jpg，a/b/test.txt），支持中文，必须字段 */
      Protocol: "https:",
      Expires: config.sign_expires_tencent_cos, // 单位秒
    }, function (err, data) {
      if (err) {
        console.error(err);
        resolve(url)
        return;
      }
      // console.log("[signCosUrl]", data.Url);
      resolve(data.Url);
    });
  });
}

// COS加密
async function signCosUrl(inputUrl) {
  let url = inputUrl;
  // 不是腾讯云COS的不加密
  if (!url || !url.includes("myqcloud.com") || !cloud.cos || !use_private_tencent_cos) {
    return url;
  }

  if (!_needResign(url)) {
    return url;
  }

  // 去除参数部分
  url = removeQueryParams(url);

  // 获取缓存
  let cacheKey = `cos-sign-${url}`;
  let cacheItem = getCacheItem(cacheKey);
  if (cacheItem) {
    return cacheItem;
  }

  // 实际签名
  let signedUrl = await _doCosSign(url);

  // 保存缓存
  setCacheItem(cacheKey, signedUrl, config.sign_expires_tencent_cos / 3600);

  return signedUrl;
}

async function ensureCos() {
  if (!use_private_tencent_cos) {
    return undefined;
  }

  var cos = new COS({
    SimpleUploadMethod: 'putObject',
    getAuthorization: async function (options, callback) {
        // 初始化时不会调用，只有调用 cos 方法（例如 cos.putObject）时才会进入
        
        var cosTemp = wx.getStorageSync('cosTemp');
        if (!cosTemp || (new Date() > new Date(cosTemp.Expiration))) {
          console.log("开始获取 cosTemp");
          cosTemp = await cloud.invokeFunction('getTempCOS');
          wx.setStorageSync('cosTemp', cosTemp);
        }
        console.log("cosTemp", cosTemp);
        if (!cosTemp || !cosTemp.Credentials) {
          console.log("无效cosTemp信息")
          callback({
            TmpSecretId: "empty",
            TmpSecretKey: "empty",
            SecurityToken: "empty",
            ExpiredTime: "3392838427",
          });
          return;
        }
        
        callback({
          TmpSecretId: cosTemp.Credentials.TmpSecretId,        // 临时密钥的 tmpSecretId
          TmpSecretKey: cosTemp.Credentials.TmpSecretKey,      // 临时密钥的 tmpSecretKey
          SecurityToken: cosTemp.Credentials.Token,            // 临时密钥的 sessionToken
          ExpiredTime: cosTemp.ExpiredTime,                    // 临时密钥失效时间戳，是申请临时密钥时，时间戳加 durationSeconds
        });
    }
    // ForcePathStyle: true, // 如果使用了很多存储桶，可以通过打开后缀式，减少配置白名单域名数量，请求时会用地域域名
    // SecretId: cosTemp.Credentials.TmpSecretId,
    // SecretKey: cosTemp.Credentials.TmpSecretKey,
    // SecurityToken: cosTemp.Credentials.Token,
  });

  return cos;
}

async function ensureToken() {
  const accessToken = wx.getStorageSync('accessToken');
  if (!accessToken || accessToken.expiredAt < Math.floor(Date.now() / 1000)) {
    console.log('开始获取 access token');
    const code = (await wx.login()).code;
    const res = await cloud.invokeFunction('login', {
      code
    });
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
    console.log('access token 尚未过期，跳过获取', accessToken);
  }
}

function _init() {
  const sysInfo = wx.getSystemInfoSync();
  console.log(sysInfo.platform);

  // 自定义请求函数
  const WxmpRequest = require('laf-client-sdk').WxmpRequest;
  // Laf 0.8 私有部署的apiKey
  var apikey = "";
  try {
    apikey = require('../appSecret').apikey;
  } catch {
    console.log("no apikey");
  }
  // Laf 1.0 的签名私钥
  var signKey = "";
  try {
    signKey = require('../signKey').signKey;
  } catch {
    console.log("no signKey");
  }
  class MyRequest extends WxmpRequest {
    async request(url, data) {
      const res = await super.request(url, data)
      return res
    }

    getSign() {
      if (!signKey) {
        return {signdata: "", signstr: ""};
      }
      const data = (new Date()).toISOString();
      // 使用SHA256算法进行签名
      const signature = CryptoJS.HmacSHA256(data, signKey).toString();
      // console.log('Signature:', signature);
      return {signdata: data, signstr: signature};
    }

    getHeaders(token) {
      var headers = super.getHeaders(token);
      headers.apikey = apikey;

      const {signdata, signstr} = this.getSign();
      // console.log({signdata, signstr});
      headers.signdata = signdata;
      headers.signstr = signstr;
      return headers;
    }
  }

  cloud = require('laf-client-sdk').init({
    baseUrl: (sysInfo.platform == 'devtools' ? laf_dev_url : laf_url),
    dbProxyUrl: '/proxy/miniprogram',
    getAccessToken: function() {
      const accessToken = wx.getStorageSync('accessToken');
      if (!accessToken) {
        return;
      }
      return accessToken.token;
    },
    environment: 'wxmp',
    requestClass: MyRequest
  });
}

// 注入各种函数
function _inject() {
  // 注入签名函数
  cloud.__proto__.signCosUrl = signCosUrl;

  // 搞一些骚操作替换 laf 数据库接口，使其兼容微信版本接口
  const documentPrototype = cloud.database().collection('$').doc('$').__proto__;
  const collectionPrototype = cloud.database().collection('$').__proto__;
  const wherePrototype = cloud.database().collection('$').where({}).__proto__;

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

  // 对get获取的数据进行CosUrl签名
  _injectGet(collectionPrototype);
  _injectGet(wherePrototype);

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
  // 让database接口等待openid获取，满足laf的访问策略要求
  const _database = cloud.__proto__.database;
  cloud.__proto__.databaseAsync = async function () {
    var maxTry = 300;
    while (true) {
      const { token } = wx.getStorageSync('accessToken');
      if (token) {
        break;
      }
      console.log("waiting jwt...");
      maxTry --;
      if (!maxTry) {
        console.log("max try...");
        break;
      }
      await sleep(10);
    }
    return _database.call(this);
  }
}

function _injectGet(proto) {
  const _get = proto.get;
  proto.get = async function () {
    try {
      let res = await _get.call(this);
      // console.log("get result:", res);
      await _deepReplaceCosUrl(res);
      return res;
    } catch (err) {
      throw err;
    }
  };
}

async function uploadFile(options) {
  const fileName = options.cloudPath;
  const filePath = options.filePath;

  const data = await cloud.invokeFunction("getURL", {
    fileName: fileName
  });

  const formData = data.formData;
  const postURL = data.postURL;
  return new Promise((resolve, reject) => {
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
      fail(err) {
        reject(err);
      }
    })
  });
};


async function _deepReplaceCosUrl(obj) {
  for (let key in obj) {
    if (typeof obj[key] === 'string') obj[key] = await cloud.signCosUrl(obj[key])
    else if (typeof obj[key] === 'object') await _deepReplaceCosUrl(obj[key])
  }
}

(function _prepare() {
  // 初始化云
  _init();

  // 检查 accessToken 是否未取得/已过期，若是则去获取
  ensureToken();

  // 保证腾讯云cos初始化
  ensureCos().then(cos => {
    cloud.__proto__.cos = cos;
  });

  _inject();
})();

module.exports = {
  cloud: cloud,
  ensureToken: ensureToken,
};