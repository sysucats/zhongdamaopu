import dp_cfg from "./deployConfig";
import {
  cloud,
  ensureToken,
} from "../../../utils/cloudAccess";
import { use_private_tencent_cos } from "../../../config";

const STATUS_DOING = 0;
const STATUS_OK = 1;
const STATUS_FAIL = 2;


// 检查云函数是否都部署了
async function checkFunctions() {
  // 清理缓存
  wx.clearStorageSync();
  // 重新获取token
  await ensureToken();

  if (!wx.getStorageSync('accessToken')) {
    return {
      status: STATUS_FAIL,
      addition: "登录失败，尝试重启Laf后台应用，或检查云函数依赖。"
    };
  }

  const res = (await cloud.callFunction({
    name: "deployTest",
    data: {
      opType: "function",
      funcs: dp_cfg.functions,
    }
  })).result;
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

// 检查AppSecret表是否正确填入
async function checkAppSecret() {
  var addition = [];
  const MP_ERR_MSG = "MP_APPID、MP_SECRET";
  const OSS_ERR_MSG = "OSS_PORT、OSS_ENDPOINT、OSS_BUCKET";
  const COS_ERR_MSG = "OSS_SECRET_ID、OSS_SECRET_KEY";
  // 重置一下后台缓存
  await cloud.callFunction({
    name: "deployTest",
    data: {
      opType: "resetSecret",
    }
  });

  // 检查cos配置
  console.log(cloud.cos);
  if (use_private_tencent_cos && !cloud.cos) {
    addition.push(COS_ERR_MSG);
  }
  // 签名一个cos链接
  try {
    console.log("check signCosUrl");
    const res = await cloud.signCosUrl("https://test-123456789.cos.ap-guangzhou.myqcloud.com/user/avatar/test.png");
    console.log("checksignCosUrl", res);
    if (!res) {
      addition.push(COS_ERR_MSG);
    }
  } catch (err) {
    addition.push(COS_ERR_MSG);
    console.error(err);
  }

  // 获取openid
  try {
    const code = (await wx.login()).code;
    const res = await cloud.invokeFunction('login', { code });
    console.log("checkAppSecret", res);
    if (!res.openid) {
      addition.push(MP_ERR_MSG);
    }
  } catch (err) {
    addition.push(MP_ERR_MSG);
    console.error(err);
  }

  // 上传文件
  const data = (await cloud.callFunction({
    name: "getURL",
    data: {
      fileName: "deployTest"
    }
  })).result;
  console.log("checkAppSecret data", data);
  if (!data || data.error || !data.postURL) {
    addition.push(OSS_ERR_MSG)
  }

  if (!addition.length) {
    return {
      status: STATUS_OK
    };
  }

  return {
    status: STATUS_FAIL,
    addition: "配置错误：" + addition.join("、")
  }
}

// 检查云数据库是否创建完成
async function checkDatabase() {
  const collections = dp_cfg.collections;
  var fail_list = [];
  for (const collName in collections) {
    const initData = collections[collName];
    console.log(collName, initData);
    try {
      const res = (await cloud.callFunction({
        name: "deployTest",
        data: {
          opType: "database",
          dbName: collName,
          dbInit: initData,
        }
      })).result;
      console.log("checkDatabase", collName, res)
      if (!res.ok) {
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
      addition: "创建完成。"
    };
  }
  var addition = "未创建集合：" + fail_list.join(", ") + "。";
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
    let url = await cloud.signCosUrl(oriUrl);
    try {
      const res = await cloud.downloadFile({
        fileID: url
      });
      console.log("checkImage", res);
      if (res.statusCode !== 200) {
        fail_list.push(`("${key}": "${oriUrl}")`);
        console.log(`download fail: ${url}`);
        continue;
      }
      console.log(`download success: ${url}`);
    } catch (error) {
      fail_list.push(`("${key}": "${oriUrl}")`);
      console.log(`download fail: ${url}`);
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
        tip: "请更新云函数，“laf func push”。\n",
        addition: "",
        break: true,
      },
      2: {
        title: "数据库初始化",
        status: STATUS_DOING,
        func: checkDatabase,
        tip: "数据库如果未创建，将会自动创建并初始化，稍等...\n",
        addition: "",
      },
      3: {
        title: "Laf后台配置",
        status: STATUS_DOING,
        func: checkAppSecret,
        tip: "在Laf后台，左下角设置，填写环境变量，保存重启laf应用。\n" +
          "如果使用Laf的存储，则无需填OSS_PORT、OSS_ENDPOINT、OSS_SECRET_ID、OSS_SECRET_KEY。\n",
        addition: "",
      },
      4: {
        title: "系统云存储图片",
        status: STATUS_DOING,
        func: checkImage,
        tip: "请将系统图片上传至【云开发】-【存储】，并修改config.js中的图片链接。",
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