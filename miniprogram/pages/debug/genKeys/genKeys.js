// pages/debug/genKeys/genKeys.ts
import { cloud } from "../../../utils/cloudAccess";

Page({

  /**
   * 页面的初始数据
   */
  data: {

  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  async onShow() {
    const res = await this.getKeys();
    // console.log(res);
    this.setData(res);
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  // 生成秘钥对
  async getKeys() {
    let res = (await cloud.callFunction({
      name: "deployTest",
      data: {
        opType: "genRSAKeys"
      }
    })).result;

    res.randomKey = (await cloud.callFunction({
      name: "deployTest",
      data: {
        opType: "genRandomKey"
      }
    })).result;

    return res;
  },

  stripKey(key) {
    // 去除开头和结尾的换行符
    key = key.replace(/^\n+|\n+$/g, '');
  
    // 去除开头和结尾的-----BEGIN/END ...-----行
    key = key.replace(/^-----BEGIN [A-Z ]+-----\n?|-----END [A-Z ]+-----\n?$/g, '');
  
    // 去除中间的换行符
    key = key.replace(/\n/g, '');
  
    return key;
  },

  copyText: function (e) {
    let {text, onlykey} = e.currentTarget.dataset;
    console.log(text, onlykey)
    if (onlykey) {
      text = this.stripKey(text);
    }
    wx.setClipboardData({
      data: text
    });
  },
})