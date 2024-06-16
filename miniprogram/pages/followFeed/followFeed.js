import { cloud } from "../../utils/cloudAccess";
import {
  shareTo,
  getCurrentPath,
  checkMultiClick,
  formatDate,
  deepcopy
} from "../../utils/utils";
import {
  checkCanUpload,
  checkCanComment,
  getUser
} from "../../utils/user";

// 每次触底加载的数量
const loadCount = 6;

Page({
  jsData: {
    waitingList: {
      photo: [],
      comment: [],
    },
    loadedCount: {
      photo: 0,
      comment: 0,
    }
  },
  data: {

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

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

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
    const db = await cloud.databaseAsync();
    let { openid } = this.data.user;
    // 获取用户的关注列表
    const followCats = (await db.collection("user")
    .where({ openid })
    .field({ followCats: 1 })
    .get()).data[0].followCats;

    console.log(followCats);
    this.setData({followCats});
  },

  // 加载更多的猫猫照片和留言
  async loadMoreFeed() {
    // 目标效果：每次展示6条新照片或留言，每次新插入的顺序是正确的
    // 1. 加载库存未展示的数据，大于等于6+1条
    // 2. 归并排序，插入到展示队列里，补充信息
    let {waitingList, loadedCount} = this.jsData;
    let {followCats} = this.data;
    
    const db = await cloud.databaseAsync();
    const _ = db.command;
    if (waitingList.photo.length <= loadCount) {
      let res = (await db.collection("photo")
      .where({ cat_id: _.in(followCats) })
      .orderBy('mdate', 'desc')
      .skip(loadedCount.photo)
      .limit(loadCount+1)
      .get()).data;
      // 推入waiting列表
      waitingList.photo.push(...res);
      loadedCount.photo += res.length;
    }
    if (waitingList.comment.length <= loadCount) {
      let res = (await db.collection("comment")
      .where({ cat_id: _.in(followCats) })
      .orderBy('mdate', 'desc')
      .skip(loadedCount.comment)
      .limit(loadCount+1)
      .get()).data;
      waitingList.comment.push(...res);
      loadedCount.comment += res.length;
    }
    console.log(waitingList);

    // 归并排序加6条
  }
})