// miniprogram/pages/addPhoto/addPhoto.js

import { generateUUID } from '../../utils.js';

Page({

  /**
   * 页面的初始数据
   */
  data: {
    isAuth: false,
    userInfo: {},
    uploading: false,
    birth_date: '2008-01-01',
    photos: [],
    set_all: {},
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    const db = wx.cloud.database();
    const cat = db.collection('cat');
    const cat_id = options.cat_id;

    console.log(cat_id);
    cat.doc(cat_id).get().then(res => {
      console.log(res.data);

      this.setData({
        cat: res.data,
        birth_date: res.data.birthday
      });
    })
    this.checkUInfo();

    // 获取一下现在的日期，用在拍摄日前选择上
    const today = new Date();
    var now_date = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
    console.log(now_date);
    this.setData({
      now_date: now_date
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

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  },

  checkUInfo() {
    const that = this;
    wx.getSetting({
      success(res) {
        if (res.authSetting['scope.userInfo']) {
          // 已经授权，可以直接调用 getUserInfo 获取头像昵称
          wx.getUserInfo({
            success(res) {
              console.log(res.userInfo)
              that.setData({
                isAuth: true,
                userInfo: res.userInfo,
              })
            }
          })
        } else {
          console.log("未授权");
        }
      }
    });
  },

  getUInfo(event) {
    console.log(event);
    this.checkUInfo();
  },

  chooseImg(e) {
    wx.chooseImage({
      count: 9,
      success: (res) => {
        console.log(res);
        var photos = [];
        for (const file of res.tempFiles) {
          photos.push({file: file});
        }
        this.setData({
          photos: photos,
          set_all: {},
        });
      },
    })
  },

  // 点击单个上传
  uploadSingleClick(e) {
    const currentIndex = e.currentTarget.dataset.index;
    const photo = this.data.photos[currentIndex];
    this.uploadImg(photo);
  },

  // 点击多个上传
  uploadAllClick(e, rec=false) {
    // rec 表示是不是递归回来的，说明有已经上传的照片
    const photos = []; // 这里只会保存可以上传的照片
    for (const item of this.data.photos) {
      if (item.shooting_date && item.file.path) {
        photos.push(item);
      }
    }
    wx.showLoading({
      title: '正在上传(' + photos.length + ')',
    });
    if (photos.length == 0 && rec) {
      wx.hideLoading();
      wx.showModal({
        title: '上传成功！',
        content: '审核通过后就会被展示出来啦',
        showCancel: false
      });
    } else {
      this.uploadImg(photos[0], true);
    }
  },
  
  uploadImg(photo, multiple=false) {
    // multiple 表示当前是否在批量上传，如果是就不显示上传成功的弹框
    const that = this;
    this.setData({
      uploading: true,
    }, function() {
      const cat = this.data.cat;
      const tempFilePath = photo.file.path;
      //获取后缀
      const index = tempFilePath.lastIndexOf(".");
      const ext = tempFilePath.substr(index + 1);

      wx.cloud.uploadFile({
        cloudPath: cat.campus + '/' + generateUUID() + '.' + ext, // 上传至云端的路径
        filePath: tempFilePath, // 小程序临时文件路径
        success: res => {
          // 返回文件 ID
          console.log(res.fileID);
          // 添加记录
          const db = wx.cloud.database();
          db.collection('photo').add({
            data: {
              cat_id: cat._id,
              photo_id: res.fileID,
              userInfo: that.data.userInfo,
              verified: false,
              mdate: (new Date()),
              shooting_date: photo.shooting_date,
              photographer: photo.pher
            },
            success: (res) => {
              console.log(res);
              if (!multiple) {
                wx.showModal({
                  title: '上传成功！',
                  content: '审核通过后就会被展示出来啦',
                  showCancel: false,
                  success: () => {
                    const photos = that.data.photos;
                    const new_photos = photos.filter((ph) => {
                      // 这个photo是用户点击的photo，在上面定义的
                      return tempFilePath != ph.file.path;
                    });
                    that.setData({
                      uploading: false,
                      photos: new_photos,
                    });
                  }
                });
              } else {
                const photos = that.data.photos;
                const new_photos = photos.filter((ph) => {
                  // 这个photo是用户点击的photo，在上面定义的
                  return tempFilePath != ph.file.path;
                });
                that.setData({
                  uploading: false,
                  photos: new_photos,
                }, ()=> {
                  that.uploadAllClick(null, true);
                });
              }
            }
          })
        },
        fail: console.error
      });
    });
  },
  pickDate(e) {
    console.log(e);
    const index = e.currentTarget.dataset.index;
    this.setData({
      ["photos[" + index + "].shooting_date"]: e.detail.value
    });
  },
  inputPher(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      ["photos[" + index + "].pher"]: e.detail.value
    })
  },

  // 下面是统一设置
  setAllDate(e) {
    const value = e.detail.value;
    var photos = this.data.photos;
    console.log(photos);
    for (var ph of photos) {
      ph.shooting_date = value;
    }
    this.setData({
      "set_all.shooting_date": value,
      photos: photos,
    });
  },
  setAllPher(e) {
    const photographer = e.detail.value;
    var photos = this.data.photos;
    for (var ph of photos) {
      ph.pher = photographer;
    }
    this.setData({
      "set_all.pher": photographer,
      photos: photos,
    });
  },

  // 移除其中一个
  removeOne(e) {
    const index = e.currentTarget.dataset.index;
    const photos = this.data.photos;
    const new_photos = photos.filter((ph, ind, arr) => {
      // 这个photo是用户点击的photo，在上面定义的
      return index != ind;
    });
    this.setData({
      photos: new_photos
    });
  }
})