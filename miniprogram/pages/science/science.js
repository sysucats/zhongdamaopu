// miniprogram/pages/science/science.js
const config = require('../../config.js');
const text_cfg = config.text;
const share_text = text_cfg.app_name + ' - ' + text_cfg.science.share_tip;

Page({
  data: {
    // 科普卡片背景图（加入缓存）
    // images: config.science_imgs
  },

  onLoad: function (params) {
    const that = this;
    const fileSystem = wx.getFileSystemManager();
    var coverPath = wx.getStorageSync('sciImgStorage'+ Math.floor(Math.random()*5));
    if (coverPath) { // 已有缓存的图片地址
      fileSystem.access({
        path: coverPath,
        success: res => { // 保存的图片文件本身未被清除
          that.setImagesList();
        },
        fail: res => { // 找不到保存的图片文件，重新下载设置
          that.downloadCoverImg();
        }
      })
    } else { //缓存里没有图片地址
      this.downloadCoverImg();
    }
  },

  downloadCoverImg() {
    // 下载并缓存，但本次先使用云端图片
    this.setData({images:config.science_imgs})

    const fileSystem = wx.getFileSystemManager();
    this.setImagesList = this.setImagesList.bind(this);

    for (let index = 0; index < config.science_imgs.length; index++) {
      const coverImage = config.science_imgs[index];
      wx.cloud.downloadFile({
        fileID: coverImage,
        success: res => { //下载成功
            fileSystem.saveFile({
              tempFilePath: res.tempFilePath,
              success:res => {//图片文件保存成功
                  wx.setStorage({
                  key: 'sciImgStorage' + index,
                  data: res.savedFilePath,
                })
              }
            })
        }
      })
    }
  },

  async setImagesList() {
    var coverImgList = [];
    for (let index = 0; index < config.science_imgs.length; index++) {
      const coverPath = wx.getStorageSync('sciImgStorage' + index);
      await coverImgList.push(coverPath);
    }
    this.setData({images: coverImgList})
  },
  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: share_text
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
      url: '/pages/science/sciDetail/sciDetail?cate=' + cate +'&coverImgList=' + this.data.images,
    });
  },

  imageLoaded(e) {
  },
})

