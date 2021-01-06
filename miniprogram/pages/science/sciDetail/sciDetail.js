// miniprogram/pages/science/sciDetail/sciDetail.js
const cates = ['猫咪救助', '撸猫指南', '猫咪领养', '猫咪喂养', '猫咪健康'];

const config = require('../../../config.js');

Page({

  /**
   * 页面的初始数据
   */
  data: {
    cate_current: -1,
    // 几张背景图
    images: config.science_imgs
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 切换到该分类
    const cate_current = options.cate;
    this.setData({
      cate_current: cate_current,
      cate_active: cates[cate_current-1]
    });

    this.getSci();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: '科普 - 中大猫谱'
    }
  },

  getSci() {
    wx.cloud.callFunction({
      name: 'getAllSci',
    }).then(res => {
      console.log(res);
      const data = res.result.data;
      this.setData({
        qnas: data,
      });
    })
  },

  changeCate(e) {
    // 这个cate是0~n范围内的
    const cate = e.detail.current;
    this.setData({
      cate_active: cates[cate]
    });
  },

  activateQna(e) {
    const index = e.currentTarget.dataset.index;
    const setAct = !this.data.qnas[index].active;
    this.setData({
      ["qnas[" + index + "].active"]: setAct
    })
  }
})