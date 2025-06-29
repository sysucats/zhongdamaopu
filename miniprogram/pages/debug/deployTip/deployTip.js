import dp_cfg from "./deployConfig";
import { getCurrentUserOpenid, signCosUrl, downloadFile } from "../../../utils/common"

const app = getApp();

const STATUS_DOING = 0;
const STATUS_OK = 1;
const STATUS_FAIL = 2;


async function _checkFuncs() {
  let res = {
    "ok": [],
    "ver_err": [],
    "not_exist": [],
  };
  const funcs = dp_cfg.functions
  for (const name in funcs) {
    try {
      const {result: funcRes} = await await app.mpServerless.function.invoke(name, { deploy_test: true });
      console.log(name, funcs[name], funcRes);
      if (funcRes == funcs[name]) {
        res["ok"].push(name);
      } else {
        res["ver_err"].push(name);
      }
    } catch {
        res["not_exist"].push(name);
    }
    
  }
  return res;
}



// 检查云函数是否都部署了
async function checkFunctions() {
  const openid = await getCurrentUserOpenid();
  if (!openid) {
    return {
      status: STATUS_FAIL,
      addition: "登录失败，请检查本地“AppSecret.js”是否配置正确、检查EMAS云函数是否部署"
    };
  }
  
  const res = await _checkFuncs();
  console.log(res);

  if (res["ver_err"].length === 0 && res["not_exist"].length === 0) {
    return {
      status: STATUS_OK
    };
  }

  var addition = res["not_exist"].length ? `未部署函数：${res["not_exist"].join(", ")}。` : "";
  addition += res["ver_err"].length ? `版本错误：${res["ver_err"].join(", ")}。` : "";
  return {
    status: STATUS_FAIL,
    addition: addition
  };
};

// 检查云数据库是否创建完成
async function checkDatabase() {
  const collections = dp_cfg.collections;
  var fail_list = [];
  for (const collName in collections) {
    // const initData = collections[collName];
    // console.log(collName, initData);
    try {
      const res = await app.mpServerless.db.collection(collName).count({});
      // console.log("checkDatabase", collName, res)
      if (res.result === 'undefined') {
        fail_list.push(collName);
      }
    } catch (error) {
      fail_list.push(collName);
      console.error(collName, error);
    }
  }

  if (fail_list.length == 0) {
    return {
      status: STATUS_OK,
      addition: "数据表创建成功"
    };
  }
  var addition = "未创建数据表：" + fail_list.join(", ") + "。";
  return {
    status: STATUS_FAIL,
    addition: addition
  };
}

// 检查云存储图片是否放好
async function checkImage() {
  var fail_list = [];
  for (var key in dp_cfg.images) {
    const oriUrl = dp_cfg.images[key];
    let url = await signCosUrl(oriUrl);
    try {
      const res = await downloadFile(url);
      if (res.statusCode !== 200) {
        fail_list.push(`("${key}": "${oriUrl}")`);
        console.log(`download fail: ${url}`);
        continue;
      }
      console.log(`download success: ${url}`);
    } catch (error) {
      fail_list.push(`("${key}": "${oriUrl}")`);
      console.log(`download fail: ${url}, error: ${JSON.stringify(error)}`);
    }
  }
  if (fail_list.length == 0) {
    return {
      status: STATUS_OK,
      addition: ""
    };
  }
  var addition = "未上传图片：" + fail_list.join(", ") + "。";
  return {
    status: STATUS_FAIL,
    addition: addition
  };
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
        title: "部署云函数",
        status: STATUS_DOING,
        func: checkFunctions,
        tip: "请创建上传并部署云函数。\n",
        addition: "",
        break: true,
      },
      2: {
        title: "数据库初始化",
        status: STATUS_DOING,
        func: checkDatabase,
        tip: "数据表如果未创建，请通过控制台添加数据表吧\n",
        addition: "",
      },
      3: {
        title: "系统云存储图片",
        status: STATUS_DOING,
        func: checkImage,
        tip: "请将系统图片上传至【云存储】，并修改config.js中的图片链接。",
        addition: "",
        break: true,
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