const config = require('../../../config.js');
const utils = require('../../../utils.js');
const loadFilter = utils.loadFilter;
const isManager = utils.isManager;

const text_cfg = config.text;

var cat_id = undefined;

const photoStep = 5; // 每次加载的图片数量
var phers = {}; // 暂时存放摄影师名字

Page({
  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    pickers: {
      gender: ['公', '母'],
      sterilized: [false, true],
      adopt: config.cat_status_adopt.map((x) => { return {desc: x} }),
      to_star: [false, true],
    },
    picker_selected: {},
    bottomShow: false,
    text_cfg: text_cfg
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.loadPickers().then(res => {
      cat_id = options.cat_id;
      this.checkAuth();
    });
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

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {
    this.loadMorePhotos();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  },
  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  },
  // 检查权限

  checkAuth() {
    const that = this;
    isManager(function (res) {
      if (res) {
        that.setData({
          auth: true
        });
        that.loadCat();
      } else {
        that.setData({
          tipText: '只有管理员Level-2能进入嗷',
          tipBtn: true,
        });
        console.log("Not a manager.");
      }
    }, 2)
  },
  loadCat() {
    if (cat_id===undefined) {
      this.setData({
        cat: {
          nickname: [],
          characteristics: [],
          popularity: 0,
        }
      })
      //说明是新猫
      return false;
    }

    const db = wx.cloud.database();
    db.collection('cat').doc(cat_id).get().then(res => {
      console.log(res);
      res.data.mphoto = String(new Date(res.data.mphoto));
      console.log(res.data.mphoto);
      // 处理一下picker
      var picker_selected = {};
      const pickers = this.data.pickers;
      for (const key in pickers) {
        const items = pickers[key];
        const value = res.data[key];
        if (value == undefined) {
          continue;
        }
        const idx = items.findIndex((v) => v === value);
        if (idx === -1 && typeof value === "number") {
          // 既不是undefined，也找不到，说明存的就是下标
          picker_selected[key] = value;
        } else {
          picker_selected[key] = idx;
        }
      }
      this.setData({
        cat: res.data,
        picker_selected: picker_selected,
      }, () => {
        this.reloadPhotos();
        // this.isCharChecked();
      });
    });
  },
  reloadPhotos() {
    const only_best_photo = this.data.only_best_photo;
    const qf = { cat_id: cat_id, verified: true, best: only_best_photo };
    const db = wx.cloud.database();
    db.collection('photo').where(qf).count().then(res => {
      this.setData({
        photoMax: res.total,
        photo: []
      }, () => {
        this.loadMorePhotos()
      });
    });
  },
  checkNeedLoad() {
    if (this.data.photoMax == 0 || this.data.photo.length >= this.data.photoMax) {
      this.setData({
        bottomShow: true,
        bottomText: "-- 没有更多猫图了 --",
        noMorePhoto: true,
      });
      console.log("Check no more");
      return false;
    } else {
      this.setData({
        bottomShow: true,
        bottomText: '加载更多猫图ing...',
        // noMorePhoto: false,
      });
      return true;
    }
  },
  // 用户点击加载更多
  clickLoad(e) {
    this.loadMorePhotos();
  },

  loadMorePhotos() {
    if (cat_id === undefined) {
      // 新猫，没有照片
      return false;
    }
    var cat = this.data.cat;
    var photo = this.data.photo;
    // 给这个参数是防止异步
    if (!this.checkNeedLoad(cat)) {
      return false;
    }

    const only_best_photo = this.data.only_best_photo;
    const qf = { cat_id: cat_id, verified: true, best: only_best_photo };
    const now = photo.length;

    const db = wx.cloud.database();
    console.log(qf);
    db.collection('photo').where(qf).orderBy('mdate', 'desc').skip(now).limit(photoStep).get().then(res => {
      console.log(res);
      photo = photo.concat(res.data);
      this.setData({
        photo: photo
      });
    });
  },
  // 输入了东西
  inputText(e) {
    console.log(e);
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    // if (this.data.cat[key] instanceof Array) {
    //   // 是Array，要把输入切分
    //   this.setData({
    //     ['cat.' + key]: value.split(',')
    //   });
    // } else {
      
    // }
    this.setData({
      ['cat.' + key]: value
    });
  },
  // 选择了东西
  pickerChange(e) {
    console.log(e);
    const key = e.currentTarget.dataset.key;
    const index = e.detail.value;
    var value = this.data.pickers[key][index];
    if (typeof value === "object" && value.desc != undefined) {
      // 说明是一种映射关系，只保存下标
      value = parseInt(index);
    }
    this.setData({
      ['cat.'+key]: value
    });
    return value;
  },
  // 选择了出生日期
  pickerDateChange(e) {
    console.log(e);
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    this.setData({
      ['cat.' + key]: value
    });
    return value;
  },
  // checkBoxChange(e) {
  //   console.log(e);
  //   this.setData({
  //     "cat.characteristics": e.detail.value
  //   }, () => {
  //     this.isCharChecked();
  //   })
  // },
  // isCharChecked() {
  //   const cat_chars = this.data.cat.characteristics || [];
  //   const chars = this.data.pickers.char;
  //   var checked = [];
  //   for (const c of chars) {
  //     checked.push(cat_chars.includes(c));
  //   }
  //   console.log(checked);
  //   this.setData({
  //     charChecked: checked
  //   });
  // },
  pickerAreaColumnChange(e) {
    var pickers = this.data.pickers;

    const column = e.detail.column;
    const index = e.detail.value;

    if (column == 0) {  // 修改了校区列内容，区域列变为对应校区的区域
      var now_campus = pickers.campus_area[0][index];
      pickers.campus_area[1] = pickers.area_category[now_campus];
      this.setData({
        "pickers.campus_area": pickers.campus_area,
        "pickers.campus_index": [index, 0]
      })
    }
  },
  bindAreaChange(e) {    // 这个和columnChange的区别是要确认才触发
    var pickers = this.data.pickers;
    const indices = e.detail.value;
    this.setData({
      'cat.campus': pickers.campus_area[0][indices[0]],
      'cat.area': pickers.campus_area[1][indices[1]]
    });
  },
  loadPickers() {
    return new Promise((resolve, reject) => {
      loadFilter().then(res => {
        console.log(res);
        // 把area按campus分类
        var area_category = {};
        for (const campus of res.campuses) {
          area_category[campus] = []
        }
        for (const area of res.area) {
          area_category[area.campus].push(area.name);
        }
        var first_campus = res.campuses[0];
        this.setData({
          "pickers.area_category": area_category, // wxml实际上不用到这个值，但是更改area picker时的逻辑需要这些数据
          "pickers.campus_area": [res.campuses, area_category[first_campus]],
          "pickers.campus_index": [0, 0],
          "pickers.colour": res.colour,
        });
      });
      resolve(true);
    });
  },
  upload() {
    wx.showLoading({
      title: '更新中...',
    });
    wx.cloud.callFunction({
      name: 'updateCat',
      data: {
        cat: this.data.cat,
        cat_id: cat_id
      }
    }).then(res => {
      console.log(res);
      if (res.result._id) {
        cat_id = res.result._id;
      }

      // wx.hideLoading();

      wx.showToast({
        title: '操作成功',
      });
    })
  },
  deletePhoto(e) {
    console.log(e);
    const photo = e.currentTarget.dataset.photo;
    const that = this;
    wx.showModal({
      title: '提示',
      content: '确定删除？',
      success(res) {
        if (res.confirm) {
          console.log('开始删除');
          wx.cloud.callFunction({
            name: "managePhoto",
            data: {
              type: "delete",
              photo: photo
            }
          }).then(res => {
            console.log("删除照片记录：" + photo._id);
            wx.showModal({
              title: '完成',
              content: '删除成功',
              showCancel: false,
              success: (res) => {
                that.reloadPhotos();
              }
            });
          })
        }
      }
    })
  },
  // 设置 / 取消 照片精选
  reverseBest(e) {
    console.log(e);
    const photo = e.currentTarget.dataset.photo;
    const index = e.currentTarget.dataset.index;
    const that = this;
    const set_best = !photo.best;
    wx.cloud.callFunction({
      name: "managePhoto",
      data: {
        type: "setBest",
        photo: photo,
        best: set_best
      }
    }).then(res => {
      wx.showModal({
        title: '完成',
        content: '设置成功',
        showCancel: false,
        success: (res) => {
          that.setData({
            ['photo[' + index + '].best']: set_best
          });
        }
      });
    })
  },
  inputPher(e) {
    const input = e.detail.value;
    const pid = e.currentTarget.dataset.pid;
    phers[pid] = input;
  },
  updatePher(e) {
    console.log(e);
    const photo = e.currentTarget.dataset.photo;
    const index = e.currentTarget.dataset.index;
    const pid = photo._id;
    const photographer = phers[pid];
    const that = this;
    wx.cloud.callFunction({
      name: "managePhoto",
      data: {
        type: "setPher",
        photo: photo,
        photographer: photographer
      }
    }).then(res => {
      wx.showModal({
        title: '完成',
        content: '设置成功',
        showCancel: false,
        success: (res) => {
          that.setData({
            ['photo[' + index + '].photographer']: photographer
          });
        }
      });
    })
  },
  switchOnlyBest() {
    const only_best_photo = this.data.only_best_photo;
    this.setData({
      only_best_photo: !only_best_photo
    }, ()=>{
      this.reloadPhotos();
    })
  }
})