import {
  generateUUID
} from "../../../utils/utils";
import {
  getPageUserInfo,
  checkAuth
} from "../../../utils/user";
import api from "../../../utils/cloudApi";
import { uploadFile } from "../../../utils/common"
const app = getApp();
Page({
  /**
   * 页面的初始数据
   */
  data: {
    auth: false,
    user: {},
    news_id: 0,
    namelength: 0,
    namemaxlength: 30,
    titlelength: 0,
    titlemaxlength: 30,
    length: 0,
    maxlength: 800,
    photos: [],
    photos_path: [],
    photos_pathId: [],
    cover: 0,
    cover_path: "",
    cover_pathId: "",
    uploading: false,
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
      checked: true,
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
    await checkAuth(this, 2);
  },

  onShow: async function () {
    await getPageUserInfo(this);
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

  getUInfo: function() {
    this.setData({
    showEdit: true
    });
  },
  closeEdit: function() {
    this.setData({
    showEdit: false
    });
  },

  async chooseImg(e) {
    if (this.data.photos.length == 9) {
      wx.showToast({
        title: '已满九张',
        icon: 'error',
        duration: 1000
      });
      return;
    }
    var res = await wx.chooseMedia({
      count: 9 - this.data.photos.length,
      mediaType: ['image'],
      sizeType: ["compressed"],
      sourceType: ['album'],
    })

    var photos = this.data.photos;
    for (const file of res.tempFiles) {
      photos.push({
        file: {
          path: file.tempFilePath,
          size: file.size
        }
      });
    }
    this.setData({
      photos: photos
    });
    console.log("[chooseImg] -", this.data.photos);
  },

  deleteImg(event) {
    let that = this;
    wx.showModal({
      content: '确定要删除吗？',
      success: function (sm) {
        if (sm.confirm) {
          let idx = event.currentTarget.dataset.index;
          that.data.photos.splice(idx, 1)
          that.setData({
            photos: that.data.photos,
          })
        }
      }
    })
  },

  previewImg: function (event) {
    console.log("[previewImg] -", event);
    wx.previewImage({
      urls: [event.currentTarget.dataset.url]
    })
  },

  async chooseCover(e) {
    if (this.data.cover != 0) {
      wx.showToast({
        title: '只能选择一张封面',
        icon: 'error',
        duration: 1000
      });
      return;
    }
    var res = await wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ["compressed"],
      sourceType: ['album'],
    })

    for (const file of res.tempFiles) {
      this.setData({
        cover: {
          path: file.tempFilePath,
          size: file.size
        }
      });
    }
    console.log("[chooseCover] -", this.data.photos);
  },

  deleteCover(event) {
    let that = this;
    wx.showModal({
      content: '确定要删除吗？',
      success: function (sm) {
        if (sm.confirm) {
          that.setData({
            cover: 0,
          })
        }
      }
    })
  },

  async uploadAllImg() {
    const photos = this.data.photos;
    if (photos.length == 0) {
      return;
    }

    for (let i = 0; i < photos.length; ++i) {
      wx.showLoading({
        title: '正在上传(' + (photos.length - i) + ')',
        mask: true,
      });
      await this.uploadImg(photos[i], 0);
    }

    this.setData({
      uploading: false,
      photos: [],
    })

    wx.hideLoading();
  },

  async uploadCover() {
    const photo = this.data.cover;
    if (photo == 0) {
      return;
    }

    wx.showLoading({
      title: '正在上传封面',
      mask: true,
    });
    await this.uploadImg(photo, 1);

    this.setData({
      uploading: false,
      cover: 0,
    })

    wx.hideLoading();
  },

  async uploadImg(photo, type) { // type = 0 时上传图片 = 1 时上传封面
    this.setData({
      uploading: true,
    });

    var tempFilePath;
    if (type == 1) {
      tempFilePath = photo.path;
    } else {
      tempFilePath = photo.file.path;
    }
    //获取后缀
    const index = tempFilePath.lastIndexOf(".");
    const ext = tempFilePath.substr(index + 1);

    const that = this;
    const upRes = await uploadFile({
      filePath: tempFilePath, // 小程序临时文件路径
      cloudPath: '/news' + '/' + generateUUID() + '.' + ext, // 上传至云端的路径
    })

    console.log("[uploadImg] - upload Result: ", upRes);
    if (type == 0) { 
      that.data.photos_path.push(upRes.fileUrl);
      that.data.photos_pathId.push(upRes.fileId);
      that.setData({
        photos_path: that.data.photos_path,
        photos_pathId: that.data.photos_pathId
      });
    } else { // 上传封面，更新路径 cover_path
      that.setData({
        cover_path: upRes.fileUrl,
        cover_pathId: upRes.fileId
      });
    }
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
    const that = this;
    console.log("[bindSubmit] - submit data: ", submitData);
    if (!submitData.title) {
      wx.showToast({
        title: '请填写标题后再发布哦',
        icon: 'none'
      })
      return;
    }

    // 上传图片
    await this.uploadCover();
    await this.uploadAllImg();

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
      userNickname: submitData.name,
      date: api.getDate(),
      title: submitData.title,
      mainContent: submitData.mainContent,
      coverPath: that.data.cover_path,
      coverPathId: that.data.cover_pathId,
      photosPath: that.data.photos_path,
      photosPathId: that.data.photos_pathId,
      class: classBelongto,
      setNewsModal: setNewsModal
    };
    console.log("[bindSubmit] - data: ", data);

    const res = await api.curdOp({
      operation: "add",
      collection: "news",
      data: data
    });
    console.log("newOp(create) Result:", res);
    if (res.ok) {
      that.setData({
        news_id: res.insertedId
      });
      wx.showToast({
        title: '发布成功',
        icon: 'success',
        duration: 1000
      });
    }
    setTimeout(wx.navigateBack, 1000);
  },

  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  }
})