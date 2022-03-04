// pages/debug/deployTip/deployTip.js

const dp_cfg = require("./deployConfig.js");

const STATUS_DOING = 0;
const STATUS_OK = 1;
const STATUS_FAIL = 2;


// 检查云开发是否开通
async function checkCloud() {
  try {
    wx.cloud.init({traceUser: true});
    return {status: STATUS_OK};
  } catch (error) {
    console.log(error);
    return {status: STATUS_FAIL};
  }
};

// 检查云函数是否都部署了
async function checkFunctions() {
  wx.cloud.init({traceUser: true});
  var fail_list = [];
  for (const func of dp_cfg.functions) {
    try {
      await wx.cloud.callFunction({
        name: func,
        data: {
          deploy_test: true,
        }
      })
      console.log(`function ${func} ok.`);
    } catch (error) {
      fail_list.push(func);
      console.error(func, error);
    }
  }

  if (fail_list.length == 0) {
    return {status: STATUS_OK};
  }
  var addition = "未部署函数：" + fail_list.join(", ") + "。";
  return {status: STATUS_FAIL, addition: addition};
};

// 检查云数据库是否创建完成
async function checkDatabase() {
  const collections = dp_cfg.collections;
  var fail_list = [];
  for (const coll_name in collections) {
    const init_data = collections[coll_name];
    console.log(coll_name, init_data);
    try {
      await wx.cloud.callFunction({
        name: "initDatabase",
        data: {
          type: "init",
          collection: coll_name,
          init_data: init_data,
        }
      });
    } catch (error) {
      fail_list.push(coll_name);
      console.error(coll_name, error);
    }
  }

  if (fail_list.length == 0) {
    return {status: STATUS_OK, addition: "创建完成。"};
  }
  var addition = "未创建集合：" + fail_list.join(", ") + "。";
  return {status: STATUS_FAIL, addition: addition};
}

// 检查云存储图片是否放好
async function checkImage() {
  var fail_list = [];
  for (var url of dp_cfg.images) {
    try {
      await wx.cloud.downloadFile({fileID: url});
      console.log(`download success: ${url}`);
    } catch (error) {
      fail_list.push(url);
      console.log(`download fail: ${url}`);
    }
  }
  if (fail_list.length == 0) {
    return {status: STATUS_OK, addition: ""};
  }
  var addition = "未上传图片：" + fail_list.join(", ") + "。";
  return {status: STATUS_FAIL, addition: addition};
}

Page({

  /**
   * 页面的初始数据
   */
  data: {
    status_to_text: {
      [STATUS_DOING]: '等待中...',
      [STATUS_OK]: '通过',
      [STATUS_FAIL]: '未通过',
    },
    status_to_css: {
      [STATUS_DOING]: '',
      [STATUS_OK]: 'success',
      [STATUS_FAIL]: 'fail',
    },
    check_list: {
      1: {
        title: "开通云开发",
        status: STATUS_DOING,
        func: checkCloud,
        tip: "点击上方的【云开发】按钮，开通云开发。开通完成后，点击【云开发】-【设置】，修改配额为“按量付费”。",
        break: true,
      },
      2: {
        title: "部署云函数",
        status: STATUS_DOING,
        func: checkFunctions,
        tip: "右键cloudfunctions目录下的每个文件夹，选择【上传并部署，云端安装依赖（不上传...）】，等待所有文件夹都呈绿色图标。注意imProcess函数需要特殊部署，请查看视频教程。",
        addition: ""
      },
      3: {
        title: "创建数据库",
        status: STATUS_DOING,
        func: checkDatabase,
        tip: "数据库如果未创建，将会自动创建并初始化，稍等...",
        addition: ""
      },
      4: {
        title: "系统云存储图片",
        status: STATUS_DOING,
        func: checkImage,
        tip: "请将系统图片上传至【云开发】-【存储】，并修改config.js中的图片链接。",
        addition: ""
      },
    },
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.checkProcess();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {

  },
  // 进行所有检查
  async checkProcess() {
    const check_list = this.data.check_list;
    var failed = false;
    for (var i in check_list) {
      if (!check_list[i].func) {
        continue;
      }
      if (failed) {
        this.setData({
          [`check_list.${i}.status`]: STATUS_FAIL,
        });
        continue;
      }
      var res = await check_list[i].func();
      console.log(i, res);
      this.setData({
        [`check_list.${i}.status`]: res.status,
        [`check_list.${i}.addition`]: res.addition || "",
      });

      // 是否结束后面的
      if (res.status != STATUS_OK && check_list[i].break) {
        failed = true;
      }
    }
  },

})