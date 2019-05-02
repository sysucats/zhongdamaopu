// const regeneratorRuntime = require('./packages/regenerator-runtime/runtime.js');

import regeneratorRuntime from './packages/regenerator-runtime/runtime.js';

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
    db.collection('filter').get().then(res => {
      resolve(res.data[0]);
    })
  });
}

function isManager(callback) {
  // 这里的callback将接受一个参数res，
  // 为bool类型，当前用户为manager时为true，
  // 否则为false
  wx.cloud.callFunction({
    name: 'login',
  }).then(res => {
    console.log(res);
    const db = wx.cloud.database();
    const openid = res.result.openid;
    const _ = db.command;
    const qf = { openid: _.in([openid, 'anyone']) };
    db.collection('manager').where(qf).count().then(res => {
      if (res.total === 1) {
        callback(true);
      } else {
        callback(false);
      }
    })
  })
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

export {
  regeneratorRuntime,
  randomInt,
  generateUUID,
  loadFilter,
  isManager,
  isWifi,
  shuffle,
};