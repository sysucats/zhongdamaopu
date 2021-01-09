// miniprogram/pages/science/science.js
const config = require('../../config.js');

Page({
  data: {
    // 科普卡片背景图（加入缓存）
    // images: config.science_imgs
  },

  onLoad: function (params) {
    const that = this;
    const fileSystem = wx.getFileSystemManager();
    var coverPath = wx.getStorageSync('sciImgStorage0');
    if (coverPath) { // 已有缓存的图片地址
      fileSystem.access({
        path: coverPath,
        success: res => { // 保存的图片文件本身未被清除
          that.setImagesList();
        },
        fail: res => { // 找不到保存的图片文件，重新下载设置
          console.log('fail');
          that.downloadCoverImg();
        }
      })
    } else {//缓存里没有图片地址
      this.downloadCoverImg();
    }
  },

  downloadCoverImg() {
    const fileSystem = wx.getFileSystemManager();
    this.setImagesList = this.setImagesList.bind(this);

    for (let index = 0; index < config.science_imgs.length; index++) {
      const coverImage = config.science_imgs[index];
      wx.cloud.downloadFile({
        fileID: coverImage,
        success: res => { //下载成功
          if (res.statusCode === 200) {
            fileSystem.saveFile({
              tempFilePath: res.tempFilePath,
              success: res => {//图片文件保存成功
                wx.setStorage({
                  key: 'sciImgStorage' + index,
                  data: res.savedFilePath,
                  success: response => {//图片路径缓存成功
                    if (index === config.science_imgs.length - 1) {
                      this.setImagesList()
                    }
                  }
                })
              }
            })
          }
        }
      })
    }
  },

  setImagesList() {
    var coverImgList = [];
    for (let index = 0; index < config.science_imgs.length; index++) {
      const coverPath = wx.getStorageSync('sciImgStorage' + index);
      coverImgList.push(coverPath);
      if (index === config.science_imgs.length - 1) {
        this.setData({
          images: coverImgList
        })
      }
    }
  },
  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: '科普 - 中大猫谱'
    }
  },

  activate(e) {
    const index = e.currentTarget.dataset.index;
    const old_active = this.data.active;
    const setAct = (index == old_active) ? -1 : index;
    this.setData({
      active: setAct,
    });
  },

  gotoDetail(e) {
    const cate = e.currentTarget.dataset.cate;
    wx.navigateTo({
      url: '/pages/science/sciDetail/sciDetail?cate=' + cate,
    });
  },

  imageLoaded(e) {
  },
})

