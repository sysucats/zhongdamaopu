const regeneratorRuntime = require('./packages/regenerator-runtime/runtime.js');

const sha256 = require('./packages/sha256/sha256.js');

// import regeneratorRuntime from './packages/regenerator-runtime/runtime.js';

function getMaopuApp(opts?: WechatMiniprogram.App.GetAppOption): MaoPuApp {
    const maoPuApp = <MaoPuApp>getApp(opts)
    getAndRefreshMountData(maoPuApp)
    return maoPuApp
}

// TODO: 挂载还是不要懒加载了，太麻烦了
async function getAndRefreshMountData(app: MaoPuApp):Promise<MaoPu.MountData> {
    return <MaoPu.MountData>(await Promise.all([
        async () => {
            if (app.globalData.settings) return ["globalData",app.globalData]
            const db = wx.cloud.database();
            const res = await db.collection('setting').doc('pages').get()
            app.globalData.settings = res.data;
            return ["globalData",app.globalData!]
        }
    ])).reduce((result, item) => {
        result[item[0]] = item[1]
        return result
    },{})

}

function randomInt(min: number, max: number):number {
  return Math.floor(Math.random() * (max - min)) + min;
}

function generateUUID():string {
  let d = new Date().getTime();
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c == 'x' ? r : (r & 0x7 | 0x8)).toString(16);
  });
  return uuid;
};

async function loadFilter():Promise<DB.IDocumentData> {
    const db = wx.cloud.database();
    const res = await db.collection('setting').doc('filter').get()
    return res.data
}

/**
 * 
 * @param req 要求的等级，是一个整数值
 */
async function isManager(req:number = 1):Promise<Boolean> {
  const res = await wx.cloud.callFunction({
    name: 'isManager',
    data: {
      req: req
    }
  })
  return <Boolean>res.result
}

async function isWifi():Promise<Boolean> {
  // 检查是不是Wifi网络正在访问
  const res = await wx.getNetworkType()
  return res.networkType == 'wifi'
}

/**
 * Shuffles array in place. ES6 version
 * @param {Array} a items An array containing the items.
 */
function shuffle<T>(a: T[]):T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 获取分享连接，从首页跳转过去
function shareTo(title: string, path:string) {
  return {
    title: title,
    path: '/pages/genealogy/genealogy?toPath=' + encodeURIComponent(path)
  }
}

// 获取当前页面的path，包括参数
function getCurrentPath(pagesStack: WechatMiniprogram.Page.Instance<Record<string, any>, Record<string, any>>[]):string {
  const currentPage = pagesStack[pagesStack.length - 1];
  const route = currentPage.route;
  const options = currentPage.options;
  let path = '/' + route + '?'
  for (const key in options) {
    path += key + '=' + options[key] + '&';
  }
  return path;
}

// 获取全局的设置
async function getGlobalSettings<T>(key:string):Promise<T|undefined> {
  const app = getMaopuApp();
  if (app.globalData.settings) return app.globalData.settings[key]

  const db = wx.cloud.database();
  const res = await db.collection('setting').doc('pages').get()
  app.globalData.settings = res.data;
  return app.globalData.settings[key]
}


// 判断两个userInfo是否相同，初级版
function userInfoEq(a: WechatMiniprogram.UserInfo, b: WechatMiniprogram.UserInfo):Boolean {
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
function regReplace(raw: string):string {
  const sp_char = "*.?+$^[](){}|\/";
  for (const ch of sp_char) {
    raw = raw.replace(ch, '\\'+ch);
  }
  return raw;
}

function formatDate(date: Date, fmt: string):string {
  const o = {
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
 * 
 * TODO
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
async function checkCanUpload(): Promise<Boolean> {
  // 如果是管理员，开启
  let manager = (await wx.cloud.callFunction({
    name: 'isManager',
    data: {
      req: 1
    }
  })).result;
  let manageUpload = (await getGlobalSettings<{manageUpload:Boolean}>('detailCat'))!.manageUpload;
  if (manager && manageUpload) {
    return true;
  }

  // 加载设置、关闭上传功能
  const app = getMaopuApp();
  let cantUpload = (await getGlobalSettings<{cantUpload:string}>('detailCat'))!.cantUpload;
  return (cantUpload !== '*') && (cantUpload !== app.globalData.version);
}


// 切分org的filter
function splitFilterLine(lineStr:string):string[] {
  if (!lineStr) {
    return [];
  }
  var line = lineStr.split('\n');
  return line.filter((val) => val.length);
}


function checkMultiClick(cat_id: string):Boolean {
  const last_click = wx.getStorageSync(cat_id);
  if(!cat_id) {
    return false;
  }
  const today = new Date();
  const delta = today.valueOf() - (new Date(last_click)).valueOf();
  console.log("last click: " + (delta / 1000 / 3600));
  // 小于2小时就返回true，说明是一个multi-click
  return (delta/1000/3600) < 2;
}


module.exports = {
  regeneratorRuntime,
  sha256,
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