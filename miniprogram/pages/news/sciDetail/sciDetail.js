import {
  text as text_cfg,
  science_imgs
} from "../../../config";
import api from "../../../utils/cloudApi";
import { signCosUrl } from "../../../utils/common";
const cates = ['猫咪救助', '撸猫指南', '猫咪领养', '猫咪喂养', '猫咪健康'];
const share_text = text_cfg.app_name + ' - ' + text_cfg.science.share_tip;

const app = getApp();
Page({

  /**
   * 页面的初始数据
   */
  data: {
    cate_current: -1,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    // 切换到该分类
    const cate_current = options.cate;
    this.setData({
      cate_current: cate_current,
      cate_active: cates[cate_current]
    });

    let images = await Promise.all(science_imgs.map(val => signCosUrl(val)));
    this.setData({
      images: images
    })

    await this.getSci();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: share_text
    }
  },

  async getSci() {
    wx.showLoading({
      title: '加载中...'
    })

    const res = await api.getAllSci({});

    console.log("getAllSci:", res);
    const data = res;
    this.setData({
      qnas: data
    });
    wx.hideLoading();
  },

  changeCate(e) {
    // 这个cate是0~n范围内的
    const cate = e.detail.current;
    console.log("ChangeCate", cate);
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