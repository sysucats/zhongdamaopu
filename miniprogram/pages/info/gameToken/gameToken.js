import { cloud } from "../../../cloudAccess";
import { getUser } from "../../../user";
import { deepcopy, formatDate } from "../../../utils";

import api from "../../../cloudApi";

Page({

  /**
   * 页面的初始数据
   */
  data: {

  },

  jsData: {
    generatingToken: false,  // 是否在生成token中
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
    await this.loadUser();
    await this.reloadUserTokenCount();
  },

  async loadUser() {
    var user = await getUser({
      nocache: true,
    });
    user = deepcopy(user);
    if (!user.userInfo) {
      user.userInfo = {};
    }
    this.setData({
      user: user
    });
  },

  async reloadUserTokenCount() {
    const db = await cloud.databaseAsync();
    let count = (await db.collection("game_token").where({_openid: this.data.user.openid}).count()).total;
    this.setData({
      userTokenCount: count
    })
  },

  async loadLastestToken() {
    const db = await cloud.databaseAsync();
    let lastestToken = (await db.collection("game_token").where({_openid: this.data.user.openid}).orderBy('acquireTime', 'desc').get()).data[0];
    lastestToken.date =  formatDate(lastestToken.acquireTime, 'yyyy-MM-dd');
    this.setData({
      lastestToken: lastestToken,
    })
  },

  async generateToken(count, acquireType) {
    if (generatingToken) {
      return false;
    }
    generatingToken = true;

    wx.showLoading({
      title: '发放代币ing',
    });
    for (let i = 0; i < count; i++) {
      const token = {
        _openid: this.data.user.openid,
        acquireTime: new Date(),
        acquireType: acquireType,
        used: false,
      }
      await api.curdOp({
        operation: "add",
        collection: "game_token",
        data: token
      });
    }
    await this.reloadUserTokenCount();
    await this.loadLastestToken();

    generatingToken = false;
    wx.hideLoading();
  }
})