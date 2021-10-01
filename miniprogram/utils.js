const regeneratorRuntime = require('./packages/regenerator-runtime/runtime.js');

// import regeneratorRuntime from './packages/regenerator-runtime/runtime.js';

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

function generateUUID() {
  var d = new Date().getTime();
  var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c == 'x' ? r : (r & 0x7 | 0x8)).toString(16);
  });
  return uuid;
};

function loadFilter() {
  return new Promise(function(resolve, reject) {
    const db = wx.cloud.database();
    db.collection('setting').doc('filter').get().then(res => {
      resolve(res.data);
    })
  });
}

function isManager(callback, req=1) {
  // 这里的callback将接受一个参数res，
  // 为bool类型，当前用户为manager时为true，
  // 否则为false
  // req是要求的等级，是一个整数值
  wx.cloud.callFunction({
    name: 'isManager',
    data: {
      req: req
    }
  }).then(res => {
    console.log(res);
    callback(res.result);
  });
}

function isWifi(callback) {
  // 检查是不是Wifi网络正在访问
  // callback返回参数true/false
  wx.getNetworkType({
    success: res => {
      const networkType = res.networkType;
      if (networkType == 'wifi') {
        callback(true);
      } else {
        callback(false);
      }
    }
  })
}

/**
 * Shuffles array in place. ES6 version
 * @param {Array} a items An array containing the items.
 */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 获取分享连接，从首页跳转过去
function shareTo(title, path) {
  return {
    title: title,
    path: '/pages/genealogy/genealogy?toPath=' + encodeURIComponent(path)
  }
}

// 获取当前页面的path，包括参数
function getCurrentPath(pagesStack) {
  const currentPage = pagesStack[pagesStack.length - 1];
  const route = currentPage.route;
  const options = currentPage.options;
  var path = '/' + route + '?'
  for (const key in options) {
    path += key + '=' + options[key] + '&';
  }
  return path;
}

// 获取全局的设置
function getGlobalSettings(key) {
  return new Promise(function (resolve, reject) {
    const app = getApp();
    if (app.globalData.settings) {
      resolve(app.globalData.settings[key]);
      return;
    }

    // 如果没有，那就获取一下
    const db = wx.cloud.database();
    db.collection('setting').doc('pages').get().then(res => {
      app.globalData.settings = res.data;
      resolve(app.globalData.settings[key]);
    });
  });
}


// 判断两个userInfo是否相同，初级版
function userInfoEq(a, b) {
  try {
    for (const k in a) {
      if (a[k] != b[k]) {
        console.log('找到不同了', k, a[k], b[k]);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}


// 替换字符串中的正则特殊符号
function regReplace(raw) {
  const sp_char = "*.?+$^[](){}|\/";
  for (const ch of sp_char) {
    raw = raw.replace(ch, '\\'+ch);
  }
  return raw;
}

function formatDate(date, fmt) {
  var o = {
    "M+": date.getMonth() + 1, //月份 
    "d+": date.getDate(), //日 
    "h+": date.getHours(), //小时 
    "m+": date.getMinutes(), //分 
    "s+": date.getSeconds(), //秒 
    "q+": Math.floor((date.getMonth() + 3) / 3), //季度 
    "S": date.getMilliseconds() //毫秒 
  };
  if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
  for (var k in o)
    if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
  return fmt;
}

/**
 * 检查版本更新
 */
function checkUpdateVersion() {
  const updateManager = wx.getUpdateManager();

  updateManager.onCheckForUpdate(function (res) {
    // 请求完新版本信息的回调
    console.log(res.hasUpdate)
  })

  updateManager.onUpdateReady(function () {
    wx.showModal({
      title: '更新提示',
      content: '新版本已就绪，是否重启应用？',
      success: function (res) {
        if (res.confirm) {
          // 新的版本已经下载好，调用 applyUpdate 应用新版本并重启
          updateManager.applyUpdate()
        }
      }
    })
  })

  updateManager.onUpdateFailed(function () {
    // 新版本下载失败
    console.log("新版本下载失败");
  })
}


/*
* 检查是否开启上传通道（返回true为开启上传）
*/
async function checkCanUpload() {
  // 如果是管理员，开启
  let manager = (await wx.cloud.callFunction({
    name: 'isManager',
    data: {
      req: 1
    }
  })).result;
  let manageUpload = (await getGlobalSettings('detailCat')).manageUpload;
  if (manager && manageUpload) {
    return true;
  }

  // 加载设置、关闭上传功能
  const app = getApp();
  let cantUpload = (await getGlobalSettings('detailCat')).cantUpload;
  return (cantUpload !== '*') && (cantUpload !== app.globalData.version);
}


// 切分org的filter
function splitFilterLine(line) {
  if (!line) {
    return [];
  }
  var line = line.split('\n');
  return line.filter((val) => val.length);
}


function checkMultiClick(cat_id) {
  const last_click = wx.getStorageSync(cat_id);
  if(!cat_id) {
    return false;
  }
  const today = new Date();
  const delta = today - (new Date(last_click));
  console.log("last click: " + (delta / 1000 / 3600));
  // 小于2小时就返回true，说明是一个multi-click
  return (delta/1000/3600) < 2;
}


module.exports = {
  regeneratorRuntime,
  randomInt,
  generateUUID,
  loadFilter,
  isManager,
  isWifi,
  shuffle,
  shareTo,
  getCurrentPath,
  getGlobalSettings,
  userInfoEq,
  regReplace,
  formatDate,
  checkUpdateVersion,
  checkCanUpload,
  splitFilterLine,
  checkMultiClick,
};