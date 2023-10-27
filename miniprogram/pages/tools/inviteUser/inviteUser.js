import { getUser, isManagerAsync, setUserRole } from "../../../utils/user";
import { getCurrentPath } from "../../../utils/utils";
import { text as text_cfg } from "../../../config";

const share_text = text_cfg.app_name + ' - ' + text_cfg.inviteUser.share_tip;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    text_cfg,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    if (await isManagerAsync()) {
      this.setData({
        isManager: true
      });
    }
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {},

  /**
   * 生命周期函数--监听页面显示
   */
  async onShow() {
    // 设置为特邀用户
    const {query} = wx.getLaunchOptionsSync();
    console.log("query", query);
    if (query.inviteRole) {
      this.setData({
        invited: true
      });
      await this.doInviteRole(query);

      if (!this.data.isManager) {
        this.toGenealogy();
      }
    }

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

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    if (!this.data.isManager) {
      console.log("not a manager share.");
      return {
        title: share_text,
      }
    }
    // 管理员分享时，邀请用户
    const pagesStack = getCurrentPages();
    const path = getCurrentPath(pagesStack);
    var expire_date = new Date();
    expire_date.setHours(expire_date.getHours() + 6);
    const query = `${path}inviteRole=1&expire=${encodeURIComponent(expire_date)}`;
    console.log(query);
    return {
      title: text_cfg.inviteUser.share_title,
      path: query,
      imageUrl: '/pages/public/images/info/teyao_share.jpg'
    };
  },
  

  async doInviteRole(options) {
    var role = parseInt(options.inviteRole);
    var expire = new Date(options.expire);
    console.log("expire at", expire);
    // 过期了
    if (new Date() > expire) {
      console.log(`invite ${role} expired.`);
      await wx.showModal({
        title: text_cfg.inviteUser.expired_title,
        content: text_cfg.inviteUser.expired_tip,
        showCancel: false,
      });
      return;
    }
    var user = await getUser();
    console.log(user);
    if (user.role >= role) {
      // 已经是了
      await wx.showModal({
        title: text_cfg.inviteUser.success_title,
        content: text_cfg.inviteUser.already_tip,
        showCancel: false,
      });
      return;
    }
    await setUserRole(user.openid, role);
    await wx.showModal({
      title: text_cfg.inviteUser.success_title,
      content: text_cfg.inviteUser.success_tip,
      showCancel: false,
    });
  },
  toGenealogy(e) {
    console.log(e);
    wx.switchTab({
      url: '/pages/genealogy/genealogy',
    })
  }
})