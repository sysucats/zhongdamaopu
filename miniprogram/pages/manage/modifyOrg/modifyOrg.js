// miniprogram/pages/manage/modifyOrg/modifyOrg.js
const utils = require('../../../utils');
const generateUUID = utils.generateUUID;
const isManager = utils.isManager;

var org_id = undefined;
var focusing_item = -1;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,

    form_items: [
      {
        key: "status",
        name: "状态",
        enum: ["new", "active", "locked"],
        disc: ["新创建", "活跃", "锁定"],
        value: "",
        index: "",
      },
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
      },
      {
        key: "colour",
        name: "花色",
        optional: true,
        placeholder: "猫猫的花色，新建猫猫前确定，一行一个。删除原有会导致该区域猫猫无法检索，请谨慎修改！",
        maxlength: 300,
        value: ""
      },
      {
        key: "address",
        name: "聚集地",
        optional: true,
        placeholder: "猫猫所在地，新建猫猫前确定，一行一个。删除原有会导致该区域猫猫无法检索，请谨慎修改！",
        maxlength: 300,
        value: ""
      },
      {
        key: "limitphoto",
        name: "照片上限",
        enum: [3, 5, 10, 20, 50],
        value: "",
        index: "",
      },
      {
        key: "limitcat",
        name: "猫猫上限",
        enum: [50, 120, 200, 300, 999],
        value: "",
        index: "",
      },
      {
        key: "limitsize",
        name: "照片大小上限（KB）",
        enum: [300, 1000, 1500, 2000, 3000, 9999],
        value: "",
        index: "",
      },
    ]
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    org_id = options.org_id;
    this.checkAuth();
    this.loadOrg();
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

  async loadOrg (){
    const db = wx.cloud.database();
    var org = (await db.collection('organization').doc(org_id).get()).data;
    console.log(org);
    var form_items = this.data.form_items;
    for (const item of form_items) {
      item.value = item.old_value = org[item.key];

      // picker需要赋值一下index
      if (['status', 'limitphoto', 'limitcat', 'limitsize'].includes(item.key)) {
        item.index = item.enum.findIndex((it)=>it==org[item.key]);
      }
    }

    this.setData({
      form_items: form_items,
    })
  },

  // 提交申请
  async bindSubmit(e) {
    var items = this.data.form_items;
    for (const item of items) {
      if (item.value.length === 0 && !item.optional) {
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
      mDate: new Date(),
    };
    for (const item of items) {
      if (item.value != item.old_value) {
        data[item.key] = item.value;
      }
    }

    // 头像
    if (data["avatar"]) {
      this.deleteOldAvatar();
      data["avatar"] = (await this.uploadAvatar());
    }
    console.log(data);

    var that = this;
    
    const db = wx.cloud.database();
    db.collection('organization').doc(org_id).update({
      data: data,
      success: (res) => {
        wx.hideLoading();
        wx.showToast({
          title: '修改成功~',
          icon: 'success',
          duration: 1000,
          success: () => {
            that.loadOrg();
          }
        })
      },
      fail: console.error
    })
  },

  
  // 准备输入
  bindFocus: function (e) {
    focusing_item = e.target.dataset.index;
  },

  // 开始输入
  bindInput: function (e) {
    var inputData = e.detail.value;
    this.setData({
      [`form_items[${focusing_item}].value`]: inputData
    })
  },

  // 删除旧头像
  deleteOldAvatar() {
    var items = this.data.form_items;
    for (const item of items) {
      if (item.key == 'avatar') {
        wx.cloud.deleteFile({
          fileList: [item.old_value],
        })
      }
    }
  },
  
  // 头像
  chooseAvatar(e) {
    var avatar_index = e.target.dataset.index;

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

  // 修改选择器
  bindPickerChange: function(e) {
    // console.log('picker发送选择改变，携带值为', e);
    var items = this.data.form_items;
    var item_index = e.currentTarget.dataset.index;

    // 注意这里的value和index是不同层次的概念
    var index = e.detail.value;
    var value = items[item_index].enum[index];

    this.setData({
      [`form_items[${item_index}].index`]: index,
      [`form_items[${item_index}].value`]: value,
    })
  },

  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  },
  // 检查权限
  checkAuth() {
    console.log(org_id);
    const that = this;
    wx.cloud.callFunction({
      name: 'isOrgManager',
      data: {
        org_id: org_id
      }
    }).then(res => {
      console.log(res);
      that.setData({
        auth: res.result
      })
    });
  },

})