import dp_cfg from "./deployConfig";

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
  // 都部署好了，设置一下
  var config_res = await setFuncConfigs();

  var fail_list = [];
  var wrong_version = [];
  for (const func in dp_cfg.functions) {
    const version = dp_cfg.functions[func];
    try {
      var res = await wx.cloud.callFunction({
        name: func,
        data: {
          deploy_test: true,
        }
      });
      if (res.result != version) {
        wrong_version.push(func);
        console.error(Error(`function ${func} got wrong version ${res.result}, should be ${version}`));
        continue;
      }
      console.log(`function ${func} ok.`);
    } catch (error) {
      fail_list.push(func);
      console.error(func, error);
    }
  }
  

  if (fail_list.length == 0 && wrong_version.length == 0 && config_res.addition.length == 0) {
    return {status: STATUS_OK};
  }
  var addition = fail_list.length ? `未部署函数：${fail_list.join(", ")}。` : "";
  addition += wrong_version.length ? `版本错误：${wrong_version.join(", ")}。` : "";
  return {status: STATUS_FAIL, addition: config_res.addition + addition};
};

// 设置云函数配置
async function setFuncConfigs() {
  const func_configs = dp_cfg.func_configs;
  var fail_list = [];
  for (const func_name in func_configs) {
    const config = func_configs[func_name];
    console.log("setFuncConfigs", func_name, config);
    try {
      await wx.cloud.callFunction({
        name: "initDeploy",
        data: {
          type: "init_func",
          func_name: func_name,
          config: config,
        }
      });
    } catch (error) {
      fail_list.push(func_name);
      console.error(func_name, error);
    }
  }
  if (fail_list.length == 0) {
    return {status: STATUS_OK, addition: ""};
  }
  var addition = "设置失败函数：" + fail_list.join(", ") + "。";
  return {status: STATUS_FAIL, addition: addition};
}

// 检查云数据库是否创建完成
async function checkDatabase() {
  const collections = dp_cfg.collections;
  var fail_list = [];
  for (const coll_name in collections) {
    const init_data = collections[coll_name];
    console.log(coll_name, init_data);
    try {
      await wx.cloud.callFunction({
        name: "initDeploy",
        data: {
          type: "init_db",
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
        tip: "右键cloudfunctions目录下的每个文件夹，选择【创建并部署，云端安装依赖（不上传...）】，等待所有文件夹都呈绿色图标。\n" + 
              "\n* 对于imProcess函数，请下载“imProcess_node_module_v2.zip”，解压到imProcess文件夹下，得到node_modules文件夹，最后点击【创建并部署，所有文件】。",
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