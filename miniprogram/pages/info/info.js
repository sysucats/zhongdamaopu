// miniprogram/pages/info/info.js
import { getUser, isManagerAsync } from "../../user.js";
import { text as text_cfg, mpcode_img } from "../../config";
import { getCurrentPath } from "../../utils";

const share_text = text_cfg.app_name + ' - ' + text_cfg.info.share_tip;

Page({
  data: {
    friendApps: [],
    showManager: false,
    numChkPhotos: 0,
    numFeedbacks: 0,
    numImProcess: 0,
    friendLinkImgLoaded:false,
    text_cfg: text_cfg,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    const that = this;
    const db = wx.cloud.database();

    var friendLinkRes = await db.collection('setting').doc('friendLink').get();
    that.setData({
      friendApps: friendLinkRes.data.apps,
    });

    // 设置为特邀用户
    const {query} = wx.getLaunchOptionsSync();
    console.log("query", query);
    if (query.inviteRole) {
      this.doInviteRole(options);
    }
  },

  // 用 onShow 不用 onLoad，为了在返回这个页面时也能重新加载
  onShow: async function () {
    // 获取version
    this.setData({
      version: getApp().globalData.version
    });

    if (!await isManagerAsync()) {
      return;
    }
    const db = wx.cloud.database();
    const _ = db.command;

    const imProcessQf = { photo_compressed: _.in([undefined, '']), verified: true, photo_id: /^((?!\.heic$).)*$/i };
    var [numChkPhotos, numFeedbacks, numImProcess] = await Promise.all([
      db.collection('photo').where({ verified: false}).count(),
      db.collection('feedback').where({ dealed: false}).count(),
      db.collection('photo').where(imProcessQf).count(),
    ]);
    this.setData({
      numChkPhotos: numChkPhotos.total,
      numFeedbacks: numFeedbacks.total,
      numImProcess: numImProcess.total,
      showManager: true,
    });
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    if (!this.data.showManager) {
      return {
        title: share_text
      }
    }
    // 管理员分享时，邀请用户
    const pagesStack = getCurrentPages();
    const path = getCurrentPath(pagesStack);
    var expire_date = new Date();
    expire_date.setHours(expire_date.getHours() + 1);
    const query = `${path}inviteRole=1&expire=${encodeURIComponent(expire_date)}`;
    console.log(query);
    return {
      title: share_text,
      path: query
    };
  },

  onShareTimeline:function () {
    return {
      title: share_text,
    }
  },

  clickbtn(e) {
    const to = e.currentTarget.dataset.to;
    if (!to) {
      return false;
    }
    wx.navigateTo({
      url: to,
    });
  },

  clickFriendLink(e) {
    const appid = e.currentTarget.dataset.appid;
    wx.navigateToMiniProgram({
      appId: appid
    })
  },

  showMpCode(e) {
    wx.previewImage({
      urls: [mpcode_img],
      fail: function(e) {
        console.error(e)
      }
    })
  },

  async doInviteRole(options) {
    var role = parseInt(options.inviteRole);
    var expire = new Date(options.expire);
    console.log("expire at", expire);
    // 过期了
    if (new Date() > expire) {
      console.log(`invite ${role} expired.`);
      return;
    }
    var user = await getUser();
    console.log(user);
    if (user.role >= role) {
      // 已经是了
      return;
    }
    await wx.cloud.callFunction({
      name: "userOp",
      data: {
        "op": "updateRole",
        "user": {
          openid: user.openid,
          role: role
        },
      }
    });
    wx.showToast({
      title: '已成为特邀用户',
      duration: 5000,
    });
  }
})