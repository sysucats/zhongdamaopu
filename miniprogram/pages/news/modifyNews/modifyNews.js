import {
  getPageUserInfo,
  checkAuth
} from "../../../utils/user";
import api from "../../../utils/cloudApi";
const app = getApp();
Page({

  /**
   * 页面的初始数据
   */
  data: {
    news_id: 0,
    news: 0,
    isAuth: false,
    auth: false,
    user: {},
    namelength: 0,
    namemaxlength: 30,
    titlelength: 0,
    titlemaxlength: 30,
    length: 0,
    maxlength: 800,
    photos_path: [],
    buttons: [{
      id: 0,
      name: '领养',
      checked: false,
    }, {
      id: 1,
      name: '救助',
      checked: false,
    }, {
      id: 2,
      name: '活动',
      checked: false,
    }, {
      id: 3,
      name: '其他',
      checked: false,
    }],
    modalButtons: [{
      id: 0,
      name: '否',
      checked: true,
    }, {
      id: 1,
      name: '是',
      checked: false,
    }],
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    this.setData({
      news_id: options.news_id
    })
    await Promise.all([
      this.loadNews(),
      checkAuth(this, 2)
    ])
  },

  onShow: async function () {
    await getPageUserInfo(this);
  },

  async loadNews() {
    const that = this;
    const { result } = await app.mpServerless.db.collection('news').findOne({
      _id: this.data.news_id
    })
    console.log("[loadNews] - NewsDetail:", result);
    for (var i = 0; i < that.data.buttons.length; i++) {
      if (that.data.buttons[i].name == result.class) {
        that.data.buttons[i].checked = true;
      }
    }
    var modalButtons = [{
      id: 0,
      name: '否',
      checked: true,
    }, {
      id: 1,
      name: '是',
      checked: false,
    }];
    if (result.setNewsModal == true) {
      modalButtons = [{
        id: 0,
        name: '否',
        checked: false,
      }, {
        id: 1,
        name: '是',
        checked: true,
      }];
    }
    that.setData({
      news: result,
      photos_path: result.photosPath,
      titlelength: result.title.length,
      length: result.mainContent.length,
      buttons: that.data.buttons,
      modalButtons: modalButtons,
    })
  },

  previewImg: function (event) {
    const that = this;
    console.log("[previewImg] -", event);
    wx.previewImage({
      current: that.data.photos_path[event.currentTarget.dataset.index],
      urls: that.data.photos_path
    })
  },

  previewCover: function (event) {
    console.log("[previewCover] -", event);
    wx.previewImage({
      urls: [event.currentTarget.dataset.url]
    })
  },

  bindInputName(e) {
    var inputData = e.detail.value;
    this.setData({
      namelength: inputData.length
    })
  },

  bindInputTitle(e) {
    var inputData = e.detail.value;
    this.setData({
      titlelength: inputData.length
    })
  },

  bindInput(e) {
    var inputData = e.detail.value;
    this.setData({
      length: inputData.length
    })
  },

  async getUInfo() {
    await getPageUserInfo(this);
  },

  radioButtonTap: function (e) {
    console.log("[radioButtonTap] -", e);
    let id = e.currentTarget.dataset.id;
    for (let i = 0; i < this.data.buttons.length; i++) {
      if (this.data.buttons[i].id == id) {
        this.data.buttons[i].checked = true;
      } else {
        this.data.buttons[i].checked = false;
      }
    }
    this.setData({
      buttons: this.data.buttons
    })
  },

  radioModalButtonTap: function (e) {
    let id = e.currentTarget.dataset.id;
    var mb = this.data.modalButtons;
    for (let i = 0; i < mb.length; i++) {
      if (mb[i].id == id) {
        mb[i].checked = true;
      } else {
        mb[i].checked = false;
      }
    }
    this.setData({
      modalButtons: mb
    });
  },

  async bindSubmit(e) {
    var submitData = e.detail.value;
    console.log(submitData);
    if (!submitData.title) {
      wx.showToast({
        title: '标题不能为空',
        icon: 'none'
      })
      return;
    }

    var classBelongto = "";
    for (let i = 0; i < this.data.buttons.length; i++) {
      if (this.data.buttons[i].checked == true) {
        classBelongto = this.data.buttons[i].name;
      }
    }

    var setNewsModal = false;
    if (this.data.modalButtons[1].checked == true) {
      setNewsModal = true;
    }

    var data = {
      openidLastModify: this.data.user.openid,
      userNicknameLastModify: submitData.name,
      dateLastModify: api.getDate(),
      title: submitData.title,
      mainContent: submitData.mainContent,
      class: classBelongto,
      setNewsModal: setNewsModal,
    }

    const resModal = await wx.showModal({
      content: '确认修改'
    })
    if (resModal.confirm) {
      await this.doModify(this.data.news_id, data)
    }
  },

  async doModify(item_id, item_data) {
    console.log(item_id, item_data);
    const res = (await api.curdOp({
      operation: "update",
      collection: "news",
      item_id: item_id,
      data: item_data
    })).result;
    console.log("[doModify] - 修改成功", res);
    wx.showToast({
      title: '修改成功',
      icon: 'success',
      duration: 1000
    })
    setTimeout(wx.navigateBack, 1000)
  },
})