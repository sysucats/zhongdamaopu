// miniprogram/pages/organization/addorgcat/addorgcat.js
const utils = require('../../../utils.js');
const splitFilterLine = utils.splitFilterLine;
const generateUUID = utils.generateUUID;

var org_id = undefined;
var focusing_item = undefined;

var orgcat_id = undefined;

Page ({

  /**
   * 页面的初始数据
   */
  data: {

    tipText: '正在鉴权...',
    tipBtn: false,

    form_items: [
      {
        key: "name",
        name: "猫猫名称",
        maxlength: 10,
        value: "",
      },
      {
        key: "nickname",
        name: "昵称",
        optional: true,
        maxlength: 15,
        value: "",
      },
      {
        key: "colour",
        name: "花色",
        type: "picker",
        enum: [],
        value: "",
        index: "",
      },
      {
        key: "address",
        name: "位置",
        type: "picker",
        enum: [],
        value: "",
        index: "",
      },
      {
        key: "birthday",
        name: "生日",
        optional: true,
        type: "picker-date",
        value: ""
      },
      {
        key: "looks",
        name: "外貌特点",
        optional: true,
        maxlength: 30,
        value: "",
      },
      {
        key: "intro",
        name: "猫猫简介",
        optional: true,
        placeholder: "性格、小故事等",
        maxlength: 600,
        value: "",
      },
      {
        key: "father",
        name: "爸爸",
        optional: true,
        maxlength: 10,
        value: ""
      },
      {
        key: "mother",
        name: "妈妈",
        optional: true,
        maxlength: 10,
        value: ""
      },
      {
        key: "friends",
        name: "好友",
        optional: true,
        maxlength: 10,
        value: ""
      },
      {
        key: "gender",
        name: "性别",
        optional: true,
        type: "picker",
        enum: ["unk", "boy", "girl"],
        disc: ["未知", "男孩", "女孩"],
        value: "unk",
        index: "0",
      },
      {
        key: "sterilized",
        name: "绝育",
        optional: true,
        type: "picker",
        enum: [false, true],
        disc: ["否", "是"],
        value: false,
        index: "0",
      },
      {
        key: "toStar",
        name: "返回喵星",
        optional: true,
        type: "picker",
        enum: [false, true],
        disc: ["否", "是"],
        value: false,
        index: "0",
      },
      {
        key: "hidden",
        name: "小程序中隐藏",
        optional: true,
        type: "picker",
        enum: [false, true],
        disc: ["否", "是"],
        value: false,
        index: "0",
      },
      {
        key: "photos",
        name: "照片",
        optional: true,
        limit: 0,
        value: [],
      }
    ]
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    org_id = options.org_id;
    orgcat_id = options.orgcat_id;
    this.checkAuth();
    this.loadOrg();
    this.loadCat();
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

  async loadOrg () {
    const db = wx.cloud.database();
    var org = (await db.collection('organization').doc(org_id).get()).data;
    console.log(org);

    const items = this.data.form_items;
    const colour_index = items.findIndex(val => val.key == 'colour');
    const address_index = items.findIndex(val => val.key == 'address');
    const photos_index = items.findIndex(val => val.key == 'photos');
    this.setData({
      [`form_items[${colour_index}].enum`]: splitFilterLine(org.colour),
      [`form_items[${address_index}].enum`]: splitFilterLine(org.address),
      [`form_items[${photos_index}].limit`]: org.limitphoto,
    });
  },

  async loadCat () {
    if (!orgcat_id) {
      // 说明正在创建新猫
      return;
    }

    const db = wx.cloud.database();
    var orgcat = (await db.collection('orgcat').doc(orgcat_id).get()).data;
    console.log(orgcat);

    const form_items = this.data.form_items;
    
    for (const item of form_items) {
      if (orgcat[item.key] === undefined) {
        continue;
      }
      item.value = item.old_value = orgcat[item.key];
      
      if (Array.isArray(item.value)) {
        item.old_value = item.value.slice();
      }

      // picker需要赋值一下index
      if (item.type == 'picker') {
        item.index = item.enum.findIndex((it)=>it==orgcat[item.key]);
      }
    }

    this.setData({
      form_items: form_items,
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

  // 修改日期选择器
  bindPickerDateChange: function(e) {
    // console.log('picker发送选择改变，携带值为', e);
    var item_index = e.currentTarget.dataset.index;

    // 注意这里的value和index是不同层次的概念
    var date = e.detail.value;

    this.setData({
      [`form_items[${item_index}].value`]: date,
    })
  },
  
  // 选择新照片
  choosePhoto(e) {
    var photos_index = e.target.dataset.index;
    var limit = this.data.form_items[photos_index].limit;
    var photos = this.data.form_items[photos_index].value;

    wx.chooseImage({
      count: limit - photos.length,
      sizeType: ["compressed"],
      success: (res) => {
        console.log(res);
        var new_photos = [];
        for (const file of res.tempFiles) {
          if (file.size / 1024 <= 300) {
            new_photos.push(file.path);
          }
        }

        if (new_photos.length != res.tempFiles.length) {
          // 说明有超过尺寸的
          wx.showToast({
            title: '有些照片太大了哦~',
            icon: 'none'
          });
        }

        photos = photos.concat(new_photos);
        this.setData({
          [`form_items[${photos_index}].value`]: photos,
        });
      },
    })
  },

  // 修改照片
  bindPhoto(e) {
    var photos_index = e.target.dataset.index;
    var phidx = e.currentTarget.dataset.phidx;
    var photos = this.data.form_items[photos_index].value;
    var op_list = [];
    if (phidx == 0) {
      op_list = ['删除', '后移👉'];
    } else if (phidx == photos.length - 1) {
      op_list = ['删除', '👈前移'];
    } else {
      op_list = ['删除', '👈前移', '后移👉'];
    }

    var that = this;
    wx.showActionSheet({
      itemList: op_list,
      success (res) {
        var op = op_list[res.tapIndex];
        console.log(op);
        if (op == '👈前移') {
          [photos[phidx-1], photos[phidx]] = [photos[phidx], photos[phidx-1]];
        }
        else if (op == '后移👉') {
          [photos[phidx+1], photos[phidx]] = [photos[phidx], photos[phidx+1]];
        }
        else if (op == '删除') {
          photos.splice(phidx, 1);
        }

        that.setData({
          [`form_items[${photos_index}].value`]: photos,
        })
      },
      fail (res) {
        console.log(res.errMsg)
      }
    })
  },
  
  // 上传图片到云
  async uploadPhotos() {
    var items = this.data.form_items;
    var photos_index = (items.findIndex((item) => item.key == "photos"));
    var photos = items[photos_index].value;

    // 先删除无用的照片 TODO: 如果有压缩照片是不是也得删
    var old_photos = items[photos_index].old_value;
    if (old_photos) {
      var delete_list = [];
      for (const ph of old_photos) {
        if (!photos.includes(ph)) {
          delete_list.push(ph);
        }
      }
      
      wx.cloud.deleteFile({
        fileList: delete_list,
      })
    }
     
    for (let i = 0; i < photos.length; i++) {
      const tempFilePath = photos[i];

      if (tempFilePath.startsWith('cloud://')) {
        continue;
      }
      
      //获取后缀
      const index = tempFilePath.lastIndexOf(".");
      const ext = tempFilePath.substr(index + 1);

      let upRes = await wx.cloud.uploadFile({
        cloudPath: 'orgCatPhoto/' + generateUUID() + '.' + ext, // 上传至云端的路径
        filePath: tempFilePath, // 小程序临时文件路径
      });
      // 返回文件 ID
      console.log(upRes.fileID);

      photos[i] = upRes.fileID;
    }

    this.setData({
      [`form_items[${photos_index}].value`]: photos,
    })

    return photos;
  },
  
  async bindSubmit(e) {
    var items = this.data.form_items;
    for (const item of items) {
      if (!item.value.length && !item.optional) {
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

    // 照片
    if (data["photos"]) {
      data["photos"] = (await this.uploadPhotos());
    }
    console.log(data);

    var that = this;
    
    const db = wx.cloud.database();
    var query = {
      data: data,
      success: (res) => {
        wx.hideLoading();

        wx.showToast({
          title: '修改成功~',
          icon: 'success',
          duration: 1000,
          success: () => {
            orgcat_id = orgcat_id || res._id;
            that.loadCat();
          }
        })
      },
      fail: console.error
    };
    if (orgcat_id) {
      // 不是新猫
      db.collection('orgcat').doc(orgcat_id).update(query);
    } else {
      // 是新猫
      db.collection('orgcat').add(query);
    }
  },
})