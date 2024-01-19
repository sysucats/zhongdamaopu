import { text as text_cfg, cat_status_adopt } from "../../../config";
import { checkAuth, fillUserInfo } from "../../../utils/user";
import { loadFilter } from "../../../utils/page";
import { getCatItemMulti } from "../../../utils/cat";
import { cloud } from "../../../utils/cloudAccess";
import api from "../../../utils/cloudApi";

const photoStep = 5; // 每次加载的图片数量

Page({
  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    pickers: {
      gender: ['公', '母'],
      sterilized: [false, true],
      adopt: cat_status_adopt.map((x) => { return {desc: x} }),
      to_star: [false, true],
    },
    picker_selected: {},
    bottomShow: false,
    text_cfg: text_cfg
  },

  jsData: {
    cat_id: null,
    phers: {}, // 暂时存放摄影师名字
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    await this.loadPickers();
    this.jsData.cat_id = options.cat_id;
    if (await checkAuth(this, 2)) {
      await this.loadCat();
    }
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
  onReachBottom: async function () {
    await this.loadMorePhotos();
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

  async loadCat() {
    if (this.jsData.cat_id===undefined) {
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

    var cat = (await getCatItemMulti([this.jsData.cat_id], {nocache: true}))[0];
    console.log("[loadCat] -", cat);
    cat.mphoto = String(new Date(cat.mphoto));
    // 处理一下picker
    var picker_selected = {};
    const pickers = this.data.pickers;
    for (const key in pickers) {
      const items = pickers[key];
      const value = cat[key];
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
    await this.setData({
      cat: cat,
      picker_selected: picker_selected,
    });

    await this.reloadPhotos();
  },

  async reloadPhotos() {
    const only_best_photo = this.data.only_best_photo;
    const qf = { cat_id: this.jsData.cat_id, verified: true, best: only_best_photo };
    const db = await cloud.databaseAsync();
    var photoRes = await db.collection('photo').where(qf).count();
    this.setData({
      photoMax: photoRes.total,
      photo: []
    });
    await this.loadMorePhotos();
  },
  checkNeedLoad() {
    if (this.data.photoMax == 0 || this.data.photo.length >= this.data.photoMax) {
      this.setData({
        bottomShow: true,
        bottomText: "-- 没有更多猫图了 --",
        noMorePhoto: true,
      });
      console.log("[checkNeedLoad] - Check no more");
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
  async clickLoad(e) {
    await this.loadMorePhotos();
  },

  async loadMorePhotos() {
    if (this.jsData.cat_id === undefined) {
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
    const qf = { cat_id: this.jsData.cat_id, verified: true, best: only_best_photo };
    const now = photo.length;

    const db = await cloud.databaseAsync();
    var newPhotos = await db.collection('photo').where(qf).orderBy('mdate', 'desc').skip(now).limit(photoStep).get();
    await fillUserInfo(newPhotos.data, "_openid", "userInfo");
    
    console.log("[loadMorePhotos] -", newPhotos);
    photo = photo.concat(newPhotos.data);
    this.setData({
      photo: photo
    });
  },
   // 输入了东西
   inputText(e) {
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
  async loadPickers() {
    var filterRes = await loadFilter();
    console.log(filterRes);
    // 把area按campus分类
    var area_category = {};
    for (const campus of filterRes.campuses) {
      area_category[campus] = []
    }
    for (const area of filterRes.area) {
      area_category[area.campus].push(area.name);
    }
    var first_campus = filterRes.campuses[0];
    this.setData({
      "pickers.area_category": area_category, // wxml实际上不用到这个值，但是更改area picker时的逻辑需要这些数据
      "pickers.campus_area": [filterRes.campuses, area_category[first_campus]],
      "pickers.campus_index": [0, 0],
      "pickers.colour": filterRes.colour,
    });
  },
  async upload() {
    // 检查必要字段
    if (!this.data.cat.name) {
      wx.showToast({
        title: '缺少名字',
        icon: 'error'
      });
      return false;
    }
    if (!this.data.cat.campus || !this.data.cat.area) {
      wx.showToast({
        title: '缺少校区及区域',
        icon: 'error'
      });
      return false;
    }

    wx.showLoading({
      title: '更新中...',
    });
    var res = (await api.updateCat({
      cat: this.data.cat,
      cat_id: this.jsData.cat_id
    })).result;
    console.log("updateCat res:", res);
    if (res.id) {
      this.jsData.cat_id = res.id;
    }
    wx.showToast({
      title: '操作成功',
    });
    // 刷新缓存
    await getCatItemMulti([this.jsData.cat_id], {nocache: true});
  },
  async deletePhoto(e) {
    console.log("[deletePhoto] -", e);
    const photo = e.currentTarget.dataset.photo;
    const ActionRes = await wx.showActionSheet({
      itemList: ['删除照片', '移动到其他猫猫']
    })

    // 删除
    if (ActionRes.tapIndex === 0) {
      await this.doDelectPhoto(photo);
      return;
    }

    // 移动照片
    if (ActionRes.tapIndex === 1) {
      await this.showMovePhoto(photo);
      return;
    }
  },

  async doDelectPhoto(photo) {
    const modalRes = await wx.showModal({
      title: '提示',
      content: '确定删除？',
    });

    if (!modalRes.confirm) {
      return;
    }

    console.log('开始删除');
    await api.managePhoto({
      type: "delete",
      photo: photo
    });

    console.log("删除照片记录：" + photo._id);
    wx.showToast({
      title: '删除成功',
    })
    await this.reloadPhotos();
  },


  // 设置 / 取消 照片精选
  async reverseBest(e) {
    const photo = e.currentTarget.dataset.photo;
    const index = e.currentTarget.dataset.index;
    const set_best = !photo.best;
    await api.managePhoto({
      type: "setBest",
      photo: photo,
      best: set_best
    });

    await wx.showModal({
      title: '完成',
      content: '设置成功',
      showCancel: false,
    });

    this.setData({
      ['photo[' + index + '].best']: set_best
    });
  },
  inputPher(e) {
    const input = e.detail.value;
    const pid = e.currentTarget.dataset.pid;
    this.jsData.phers[pid] = input;
  },
  async updatePher(e) {
    const photo = e.currentTarget.dataset.photo;
    const index = e.currentTarget.dataset.index;
    const pid = photo._id;
    const photographer = this.jsData.phers[pid];
    await api.managePhoto({
      type: "setPher",
      photo: photo,
      photographer: photographer
    });
    await wx.showModal({
      title: '完成',
      content: '设置成功',
      showCancel: false,
    });

    this.setData({
      ['photo[' + index + '].photographer']: photographer
    });
  },
  async switchOnlyBest() {
    const only_best_photo = this.data.only_best_photo;
    this.setData({
      only_best_photo: !only_best_photo
    })
    await this.reloadPhotos();
  },

  // 移动照片时的猫猫搜索（TODO：考虑做成模块）
  async showMovePhoto(photo) {
    this.setData({
      showSelectCat: true,
      movePhoto: photo,
    });
  },

  // 选择移动到的猫
  async selectMoveCat(e) {
    const cat = e.detail,
      photo = this.data.movePhoto;
    if (!cat || !photo) {
      return;
    }

    await api.curdOp({
      operation: "update",
      collection: "photo",
      item_id: photo._id,
      data: { cat_id: cat._id },
    })

    wx.showToast({
      title: '移动完成',
    });

    this.setData({
      showSelectCat: false
    });
    await this.reloadPhotos();
  },

})