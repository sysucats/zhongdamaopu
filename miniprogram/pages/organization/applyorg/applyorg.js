// miniprogram/pages/organization/applyorg/applyorg.js
const utils = require('../../../utils.js');
const generateUUID = utils.generateUUID;

const user = require('../../../user.js');
const getUserInfoOrFalse = user.getUserInfoOrFalse;

// 正在输入的
var focusing_item = -1;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    isAuth: false,
    user: {},

    form_items: [
      {
        key: "name",
        name: "组织名称",
        maxlength: 15,
        value: "",
      },
      {
        key: "slogan",
        name: "标语",
        maxlength: 30,
        value: "",
      },
      {
        key: "intro",
        name: "详细介绍",
        maxlength: 300,
        value: "",
      },
      {
        key: "avatar",
        name: "头像",
        value: "",
      },
      {
        key: "contact",
        name: "联系方式",
        placeholder: "微信/QQ/邮箱",
        maxlength: 30,
        value: ""
      }
    ]
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {

  },
  
  getUInfo() {
    const that = this;
    // 检查用户信息有没有拿到，如果有就更新this.data
    getUserInfoOrFalse().then(res => {
      if (!res) {
        console.log('未授权');
        return;
      }
      console.log(res);
      that.setData({
        isAuth: true,
        user: res,
      });
    });
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  },

  // 准备输入
  bindFocus: function (e) {
    var items = this.data.form_items;
    var key = e.target.dataset.key;
    focusing_item = (items.findIndex((item) => item.key == key));
  },

  // 开始输入
  bindInput: function (e) {
    var inputData = e.detail.value;
    this.setData({
      [`form_items[${focusing_item}].value`]: inputData
    })
  },
  
  // 提交申请
  async bindSubmit(e) {
    var items = this.data.form_items;
    for (const item of items) {
      if (!item.value.length) {
        wx.showToast({
          title: `请填写\"${item.name}\"后再提交哦`,
          icon: 'none'
        })
        return;
      }
    }
    wx.showLoading({
      title: '正在提交...',
      mask: true,
    });

    
    var data = {
      status: "new",
      userInfo: this.data.user.userInfo,
      openDate: new Date(),
    };
    for (const item of items) {
      data[item.key] = item.value;
    }

    // 头像
    data["avatar"] = (await this.uploadAvatar());
    
    const db = wx.cloud.database();
    db.collection('organization').add({
      data: data,
      success: (res) => {
        wx.hideLoading();
        wx.showToast({
          title: '申请提交成功~',
          icon: 'success',
          duration: 1000,
          success: () => {
            setTimeout(() => {
              wx.switchTab({
                url: "/pages/organization/orglist/orglist"
              })
            }, 1000)
          }
        })
      },
      fail: console.error
    })
  },

  // 头像
  chooseAvatar(e) {
    var items = this.data.form_items;
    var key = "avatar";
    var avatar_index = (items.findIndex((item) => item.key == key));

    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      success: (res) => {
        var avatar = res.tempFilePaths[0];
        this.setData({
          [`form_items[${avatar_index}].value`]: avatar,
        });
      },
    })
  },

  // 上传图片到云
  async uploadAvatar() {
    var items = this.data.form_items;
    var key = "avatar";
    var avatar_index = (items.findIndex((item) => item.key == key));
    const tempFilePath = items[avatar_index].value;
    //获取后缀
    const index = tempFilePath.lastIndexOf(".");
    const ext = tempFilePath.substr(index + 1);

    let upRes = await wx.cloud.uploadFile({
      cloudPath: 'orgAvatar/' + generateUUID() + '.' + ext, // 上传至云端的路径
      filePath: tempFilePath, // 小程序临时文件路径
    });
    // 返回文件 ID
    console.log(upRes.fileID);

    return upRes.fileID;
  },
})