import {
  getUser
} from "../../../../../../utils/user";
import {
  deepcopy,
  formatDate,
} from "../../../../../../utils/utils";
import {
  loadBadgeDefMap
} from "../../../../../../utils/badge";
import {
  getCatItemMulti,
  getAvatar
} from "../../../../../../utils/cat";
const app = getApp();
Page({

  /**
   * 页面的初始数据
   */
  data: {
    badges: [],
    catInfoMap: {},
    avatarMap: {},
  },

  jsData: {},

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
    await this.loadUser();

    const [_, badgeDefMap] = await Promise.all([
      this.loadMoreBadges(),
      loadBadgeDefMap(),
    ]);
    this.setData({badgeDefMap})
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

  async loadMoreBadges() {
    if (this.jsData.loading) {
      return;
    }
    this.jsData.loading = true;
    let {badges} = this.data;
    let { result: tmp } = await app.mpServerless.db.collection('badge').find({
      _openid: this.data.user.openid,
      catId: { $ne: null }
    }, { skip: badges.length, limit: 20 })

    for (let b of tmp) {
      b.dispTime = formatDate(new Date(b.givenTime), "yyyy-MM-dd hh:mm")
    }

    this.setData({
      badges: badges.concat(tmp),
    });

    await this.loadCatInfo(tmp);

    this.jsData.loading = false;
  },

  async loadCatInfo(badges) {
    let {catInfoMap} = this.data;
    let unkCat = [];
    for (const b of badges) {
      if (catInfoMap[b.catId]) {
        continue;
      }
      unkCat.push(b.catId);
      catInfoMap[b.catId] = {};  // 占位防止重复获取
    }

    const catInfo = await getCatItemMulti(unkCat);
    console.log(catInfo);
    for (const ci of catInfo) {
      catInfoMap[ci._id] = ci;
    }

    this.setData({catInfoMap});

    await this.loadAvatarMap(catInfo);
  },

    async loadAvatarMap(catInfo) {
      let all_querys = [];
      for (const ci of catInfo) {
        all_querys.push(this._getOneAvatar(ci._id, ci.photo_count_best));
      }
      await Promise.all(all_querys);
      return;
    },


    async _getOneAvatar(id, photo_count_best) {
      const avatar = await getAvatar(id, photo_count_best);
      if (!avatar || (!avatar.photo_compressed && !avatar.photo_id)) {
        return;
      }
      this.setData({
        [`avatarMap.${id}`]: avatar.photo_compressed || avatar.photo_id,
      });
    },
  /**
   * 页面上拉触底事件的处理函数
   */
  async onReachBottom() {
    await this.loadMoreBadges();
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
})