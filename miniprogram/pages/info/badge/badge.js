import {
  cloud
} from "../../../cloudAccess";
import {
  getUser
} from "../../../user";
import {
  deepcopy,
  formatDate
} from "../../../utils";
import {
  loadUserBadge,
  loadBadgeDefMap
} from "../../../utils/badge";

import api from "../../../cloudApi";

Page({

  /**
   * 页面的初始数据
   */
  data: {

  },

  jsData: {
    badgeDefMap: null
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
    await this.loadUser()
    await this.loadAD()
    await this.reloadUserBadge()
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

  async loadAD() {
    let pictureAd = null
    if (wx.createInterstitialAd) {
      pictureAd = wx.createInterstitialAd({
        adUnitId: 'adunit-287bf3706975a01b'
      })
      pictureAd.onLoad(() => {})
      pictureAd.onError((err) => {})
      pictureAd.onClose((res) => {
        this.getBadge(1, 'watchPictureAD')
      })
    }

    let videoAd = null
    if (wx.createRewardedVideoAd) {
      videoAd = wx.createRewardedVideoAd({
        adUnitId: 'adunit-0bdd3872e84a0a60'
      })
      videoAd.onLoad(() => {})
      videoAd.onError((err) => {})
      videoAd.onClose((res) => {
        this.getBadge(2, 'watchVideoAD')
      })
    }

    this.setData({
      pictureAd,
      videoAd,
    });
  },

  async reloadUserBadge() {
    if (!this.jsData.badgeDefMap) {
      this.jsData.badgeDefMap = await loadBadgeDefMap();
    }
    this.setData({
      userBadges: await loadUserBadge(this.data.user.openid, this.jsData.badgeDefMap),
    })
  },

  async reloadLastCheckInTime() {
    const db = await cloud.databaseAsync();
    let lastestBadgeGottenByCheckIn = (await db.collection("badge").where({
      _openid: this.data.user.openid,
      reason: 'checkIn'
    }).orderBy('acquireTime', 'desc').get()).data[0];
    if (lastestBadgeGottenByCheckIn) {
      lastestBadgeGottenByCheckIn.date = formatDate(lastestToken.acquireTime, 'yyyy-MM-dd');
      this.setData({
        lastestBadgeGottenByCheckIn: lastestBadgeGottenByCheckIn,
      })
    }
  },

  async tapForGetBadge(e) {
    const {
      count,
      reason
    } = e.currentTarget.dataset;
    this.getBadge(count, reason)
  },

  // 处理获取徽章的请求与 UI
  async getBadge(count, reason) {
    await api.getBadge({
      count: Number(count),
      reason
    });
    this.reloadUserBadge()
  },

  async watchADForGetBadge(e) {
    const {
      type
    } = e.currentTarget.dataset;
    switch (type) {
      case 'picture':
        if (this.data.pictureAd) {
          this.data.pictureAd.show()
        }
        break;
      case 'video':
        if (this.data.videoAd) {
          this.data.videoAd.show()
        }
        break
    }
  }
})