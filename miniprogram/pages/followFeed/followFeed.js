import { cloud } from "../../utils/cloudAccess";
import {
  randomInt,
  formatDate,
  deepcopy,
  getDateWithDiffHours
} from "../../utils/utils";
import {
  fillUserInfo,
  getUser
} from "../../utils/user";
import {
  getCatItemMulti,
  getAvatar
} from "../../utils/cat";
import {
  showTab
} from "../../utils/page";

// 每次触底加载的数量
const loadCount = 13;
// 最多加载几天前的照片
const maxNDaysAgo = 30;

// 正则表达式：不以 HEIC 为文件后缀的字符串
const no_heic = /^((?!\.heic$).)*$/i;

Page({
  jsData: {
    loadingLock: false,
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
    feed: [],
    loadnomore: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
    await this.loadUser();
    await this.loadFollowCats();
    await this.loadMoreFeed();
    this.setData({
      refreshing: false
    });
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
    // 切换自定义tab
    showTab(this);
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
  async onPullDownRefresh() {
    await this.onLoad();
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
    // 重置一下，便于下拉刷新用
    this.setData({followCats, feed: [], loadnomore: false});
    this.jsData.waitingList = {
      photo: [],
      comment: [],
    };
    this.jsData.loadedCount = {
      photo: 0,
      comment: 0,
    };
  },

  async _loadData(coll) {
    let {loadedCount} = this.jsData;
    let {followCats} = this.data;

    const db = await cloud.databaseAsync();
    const _ = db.command;

    // let sortField = coll === 'photo' ? 'mdate' : 'create_date';
    let whereField = {};
    let maxCreateDate = getDateWithDiffHours(-1 * maxNDaysAgo * 24);
    if (coll === 'photo') {
      whereField = {
        cat_id: _.in(followCats),
        verified: true,
        photo_id: no_heic,
        create_date: _.gt(maxCreateDate),
      }
    } else if (coll === 'comment') {
      whereField = {
        cat_id: _.in(followCats),
        deleted: _.neq(true),
        needVerify: false,
        create_date: _.gt(maxCreateDate),
      }
    }
    let res = (await db.collection(coll)
    .where(whereField)
    .orderBy('create_date', 'desc')
    .skip(loadedCount[coll])
    .limit(loadCount+1)
    .get()).data;
    // 填充猫和用户数据
    let openidField = coll === 'photo' ? '_openid' : 'user_openid';
    var [cat_res] = await Promise.all([
      getCatItemMulti(res.map(p => p.cat_id)),
      await fillUserInfo(res, openidField, "userInfo"),
    ]);
    for (let i = 0; i < res.length; i++) {
      var p = res[i];
      p.cat = cat_res[i];
      p.cat.avatar = await getAvatar(p.cat._id, p.cat.photo_count_best)
      p.datetime = formatDate(new Date(p.create_date), "yyyy-MM-dd hh:mm")
      if (coll == 'comment') {
        // 便签旋转
        p.rotate = randomInt(-5, 5);
        // 贴纸位置
        p.tape_pos_left = randomInt(20, 520);
        p.tape_rotate = randomInt(-50, +50);
      }
      if (coll == 'photo') {
        p.pic = p.photo_compressed || p.photo_id;
        p.pic_prev = p.photo_watermark || p.photo_id;
      }
    }

    return res;
  },

  // 加载更多的猫猫照片和留言
  async loadMoreFeed() {
    if (this.jsData.loadingLock) {
      return;
    }
    this.jsData.loadingLock = true;
    // 目标效果：每次展示n条新照片或留言，每次新插入的顺序是正确的
    // 1. 加载库存未展示的数据，大于等于n+1条
    // 2. 归并排序，插入到展示队列里，补充信息
    let {waitingList, loadedCount} = this.jsData;

    let loadnomore = true;
    
    if (waitingList.photo.length <= loadCount) {
      let res = await this._loadData("photo");
      if (res.length === loadCount + 1) {
        loadnomore = false;
      }
      // 推入waiting列表
      waitingList.photo.push(...res);
      loadedCount.photo += res.length;
    }
    if (waitingList.comment.length <= loadCount) {
      let res = await this._loadData("comment");
      if (res.length === loadCount + 1) {
        loadnomore = false;
      }
      waitingList.comment.push(...res);
      loadedCount.comment += res.length;
    }
    console.log(waitingList, loadnomore);
    this.setData({loadnomore});

    // 归并排序，waiting队列剩1条
    await this._sortedMerge();

    this.jsData.loadingLock = false;
  },

  async _sortedMerge() {
    let { waitingList } = this.jsData;
    let { loadnomore } = this.data;

    waitingList.photo.sort((a, b) => b.create_date - a.create_date);
    waitingList.comment.sort((a, b) => b.create_date - a.create_date);

    let res = [];
    
    // 按时间归并排序
    // 如果加载到底了，把最后一个守门员也排进去
    let keepCount = loadnomore ? 0 : 1;
    while ((res.length < loadCount || loadnomore) && (waitingList.photo.length > keepCount || waitingList.comment.length > keepCount)) {
      if (waitingList.photo.length <= keepCount) {
        res.push(waitingList.comment.shift());
        res[res.length-1].dtype = 'comment';
        continue;
      }
      if (waitingList.comment.length <= keepCount) {
        res.push(waitingList.photo.shift());
        res[res.length-1].dtype = 'photo';
        continue;
      }
      if (new Date(waitingList.photo[0].create_date) > new Date(waitingList.comment[0].create_date)) {
        res.push(waitingList.photo.shift());
        res[res.length-1].dtype = 'photo';
      } else {
        res.push(waitingList.comment.shift());
        res[res.length-1].dtype = 'comment';
      }
    }

    console.log(res);

    let { feed } = this.data;
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      let newBlock = {
        dtype: item.dtype,
        cat: item.cat,
        items: [item]
      };
      // 几种情况会新增一个block：
      // 1. feed流是空的；2. 上一个是不同类型；3. 上一组不是同一只猫；4. 上一个照片组已经有9张；5. 上一个留言组已经有3张
      if (feed.length === 0) {
        feed.push(newBlock);
        continue;
      }
      let lastOne = feed[feed.length-1];
      if (item.dtype != lastOne.dtype ||
          item.cat._id != lastOne.cat._id ||
          lastOne.items.length >= (lastOne.dtype === 'photo'? 6: 3)) {
        feed.push(newBlock);
      } else {
        lastOne.items.push(item);
      }
    }
    // feed.push(...res);
    this.setData({feed});
  },

  // 点击猫猫卡片
  toCat(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    const detail_url = '/pages/genealogy/detailCat/detailCat';


    wx.navigateTo({
      url: detail_url + '?cat_id=' + cat_id,
    });
  },

  // 打开大图
  clickPhoto(e) {
    const {url} = e.currentTarget.dataset;
    wx.previewImage({
      urls: [url],
    });
  },
})