import {
  deepcopy
} from "../../../utils/utils";
import {
  getUser
} from "../../../utils/user";
import {
  getAvatar
} from "../../../utils/cat";
import api from "../../../utils/cloudApi";
const app = getApp();
Page({

  /**
   * 页面的初始数据
   */
  jsData: {
    updatingFollowCats: false,
  },
  data: {
    followCount: 0,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
    await this.loadUser();
    await this.loadFollowCats();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

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


  async loadUser() {
    var user = await getUser({
      nocache: true,
    });
    user = deepcopy(user);
    if (!user.userInfo) {
      user.userInfo = {};
    }
    this.setData({
      user,
    });
  },


  async loadFollowCats() {
    let { openid } = this.data.user;
    // 获取用户的关注列表
    const followCatIds = (await app.mpServerless.db.collection('user').findOne({
      openid: openid
    }, {
      projection: {
        followCats: 1
      }
    })).result.followCats;

    console.log(followCatIds);

    // 加载猫猫的信息
    const { result: followCats } = await app.mpServerless.db.collection('cat').find({ _id: { $in: followCatIds } })
    console.log(followCats);

    for (let i = 0; i < followCats.length; i++) {
      var p = followCats[i];
      p.unfollowed = false;
      p.avatar = await getAvatar(p._id, p.photo_count_best)
    }
    this.setData({
      followCats,
      followCount: followCats.length,
    });
  },

  async doFollowCat(e) {
    if (this.jsData.updatingFollowCats) {
      return;
    }

    this.jsData.updatingFollowCats = true;

    let { unfollowed, catid, index } = e.currentTarget.dataset;
    let res = await api.updateFollowCats({
      updateCmd: unfollowed ? "add" : "del",
      catId: catid,
    });

    let { followCount } = this.data;
    followCount += unfollowed ? 1 : -1;

    this.setData({
      [`followCats[${index}].unfollowed`]: !unfollowed,
      followCount
    });

    wx.showToast({
      title: `${unfollowed ? "关注" : "取关"}${res ? "成功" : "失败"}`,
      icon: res ? "success" : "error"
    });
    this.jsData.updatingFollowCats = false;
  }
})