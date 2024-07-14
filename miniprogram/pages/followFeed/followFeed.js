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

import api from "../../utils/cloudApi";

// 每次触底加载的数量
const loadCount = 13;
// 最多加载几天前的照片
const maxNDaysAgo = 30;

// 正则表达式：不以 HEIC 为文件后缀的字符串
const no_heic = /^((?!\.heic$).)*$/i;

// 头像渐变边框
const { gradientAvatarSvg } = require('./gradientAvatar.svg.js');

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
    },
    updatingFollowCats: false,
  },
  data: {
    feed: [],
    loadnomore: false,
    currentCatId: null,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
    await this.loadUser();
    await this.loadFollowCats();
    await this.loadFollowCatsDetail();
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

  // 加载关注猫列表的详细信息
  async loadFollowCatsDetail() {
    const db = await cloud.databaseAsync();
    const _ = db.command;
    const { followCats } = this.data;
  
    // 加载关注列表，用于顶部展示
    const followCatsList = await getCatItemMulti(followCats);
  
    // 获取当前时间和 maxNDaysAgo 天前的时间
    const maxCreateDate = getDateWithDiffHours(-1 * maxNDaysAgo * 24);

    const promises = followCatsList?.map(async (p) => {
      p.avatar = await getAvatar(p._id, p.photo_count_best); // 获取猫猫头像
      p.unfollowed = false; // 默认未取关

      const latestPhoto = (await db.collection("photo")
        .where({
          cat_id: p._id,
          verified: true,
          photo_id: no_heic,
          create_date: _.gt(maxCreateDate),
        })
        .orderBy("create_date", "desc")
        .limit(1)
        .get()).data[0];
        
      const latestComment = (await db.collection("comment")
      .where({
        cat_id: p._id,
        deleted: _.neq(true),
        create_date: _.gt(maxCreateDate),
      })
      .orderBy("create_date", "desc")
      .limit(1)
      .get()).data[0];

      // 记录最近照片，评论的创建时间
      p.latestTime = Math.max(
        latestPhoto ? latestPhoto.create_date : 0,
        latestComment ? latestComment.create_date : 0
      );

      // 动态改变不同状态猫的svg颜色 => 旧动态：#ccc；新动态：#gradient
      // TODO: 添加动态过渡动画
      p.svgImg = (latestPhoto && new Date(latestPhoto.create_date) > maxCreateDate) || 
        (latestComment && new Date(latestComment.create_date) > maxCreateDate)
        ? (p._id === this.data.currentCatId)
          ? gradientAvatarSvg('url(#gradient)', '5, 15') // 选中状态
          : gradientAvatarSvg('url(#gradient)', '0')     // 有新动态，未选中
        : gradientAvatarSvg('#ccc');                     // 无新动态

      p.selected = ((latestPhoto && new Date(latestPhoto.create_date) > maxCreateDate) || 
        (latestComment && new Date(latestComment.create_date) > maxCreateDate)) && 
        (p._id === this.data.currentCatId);

      return p;
    }) || [];
    
    const updatedFollowCatsList = await Promise.all(promises);

    // 按最新动态时间排序
    updatedFollowCatsList.sort((a, b) => b.latestTime - a.latestTime);
    console.log('关注列表', updatedFollowCatsList);
    this.setData({followCatsList: updatedFollowCatsList});
  },

  async _loadData(coll, catId = null) {
    let {loadedCount} = this.jsData;
    let {followCats} = this.data;

    const db = await cloud.databaseAsync();
    const _ = db.command;

    // let sortField = coll === 'photo' ? 'mdate' : 'create_date';
    let whereField = {};
    let maxCreateDate = getDateWithDiffHours(-1 * maxNDaysAgo * 24);
    if (coll === 'photo') {
      whereField = {
        verified: true,
        photo_id: no_heic,
        create_date: _.gt(maxCreateDate),
      }
    } else if (coll === 'comment') {
      whereField = {
        deleted: _.neq(true),
        needVerify: false,
        create_date: _.gt(maxCreateDate),
      };
    }
  
    if (catId) {
      // 加载指定猫猫的数据
      whereField.cat_id = catId;
    } else {
      // 加载全部数据
      whereField.cat_id = _.in(followCats);
    }
    let res = (await db.collection(coll)
    .where(whereField)
    .orderBy('create_date', 'desc')
    .skip(loadedCount[coll])
    .limit(loadCount+1)
    .get()).data;
    // 填充猫和用户数据
    let openidField = coll === 'photo' ? '_openid' : 'user_openid';
    await fillUserInfo(res, openidField, "userInfo");
    for (let i = 0; i < res.length; i++) {
      var p = res[i];
      p.cat = this.data.followCatsList.find(cat => cat._id === p.cat_id); // 用followCatsList里的数据填充cat字段
      p.datetime = this.formatDateTime(new Date(p.create_date));  // 另一种格式化时间的方案，或许对动态展示更友好
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

  // 格式化时间
  // 1. 如果是当天：xx小时前；
  // 2. 如果是一周内：xx天前；
  // 3. 超过一周：1周前；
  // 4. 超过两周：xx月xx日；
  // 5. 超过一年：xxxx年xx月xx日（对于目前来说不需要，先写了）。
  formatDateTime(date) {
    const now = new Date();
    const diff = now - date;
    const secondsDiff = Math.floor(diff / 1000);
    const minutesDiff = Math.floor(diff / (1000 * 60));
    const hoursDiff = Math.floor(diff / (1000 * 60 * 60));
    const daysDiff = Math.floor(diff / (1000 * 60 * 60 * 24));
    const weeksDiff = Math.floor(daysDiff / 7);
    const yearsDiff = now.getFullYear() - date.getFullYear();
  
    const formatMap = [    
      [() => secondsDiff < 60, '刚刚'],
      [() => minutesDiff < 60, `${minutesDiff}分钟前`],
      [() => hoursDiff < 24, `${hoursDiff}小时前`],
      [() => daysDiff < 7, `${daysDiff}天前`],
      [() => weeksDiff < 2, '1周前'],
      [() => yearsDiff < 1, `${date.getMonth() + 1}月${date.getDate()}日`],
      [() => true, `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`],
    ];
  
    for (const [condition, format] of formatMap) {
      if (condition()) {
        return format;
      }
    }
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

    const { currentCatId } = this.data;
    if (currentCatId) {
      // 加载指定猫猫的数据
      if (waitingList.photo.length <= loadCount) {
        let res = await this._loadData("photo", currentCatId);
        if (res.length === loadCount + 1) {
          loadnomore = false;
        }
        waitingList.photo.push(...res);
        loadedCount.photo += res.length;
      }
      if (waitingList.comment.length <= loadCount) {
        let res = await this._loadData("comment", currentCatId);
        if (res.length === loadCount + 1) {
          loadnomore = false;
        }
        waitingList.comment.push(...res);
        loadedCount.comment += res.length;
      }
    } else {
    // 加载全部数据
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
    const timeInterval = 5 * 60 * 1000; // 5分钟内的动态合并
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      
      // 当展示该猫猫的动态时进行取关再刷新，此时关注列表不包含此猫，但feed数组中仍然存在该猫动态数据，因此当 item.cat 为 undefined，跳过该条数据
      if (!item.cat) {
        this.setData({loadnomore: true});
        continue;
      }
      let newBlock = {
        dtype: item.dtype,
        cat: item.cat,
        items: [item]
      };
      // 几种情况会新增一个block：
      // 1. feed流是空的；2. 上一个是不同类型；3. 上一组不是同一只猫；4. 上一个照片组已经有9张；5. 上一个留言组已经有3张；6. 按用户分组，时间间隔超过5分钟
      // 实际上这就是每个用户每次上传照片/留言审核的记录，如果能直接将其在通过审核后记录在数据库里作为一条动态集合，这样前端就不用这么麻烦了
      if (feed.length === 0) {
        feed.push(newBlock);
        continue;
      }
      let lastOne = feed[feed.length-1];
      const currentTimestamp = new Date(item.create_date).getTime();
      const lastTimestamp = lastOne ? new Date(lastOne.items[0].create_date).getTime() : null;

      if (!lastOne || 
          item.dtype != lastOne.dtype ||
          item.cat._id != lastOne.cat._id ||
          item.user_id != lastOne.items[0].user_id ||
          lastTimestamp - currentTimestamp > timeInterval ||
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

    // 关掉弹窗
    this.closeMenu();
  },

  // 打开大图
  clickPhoto(e) {
    const { photoIndex, feedIndex } = e.currentTarget.dataset;
    console.log(photoIndex, feedIndex);
    const currentItems = this.data.feed[feedIndex].items;

    const urls = currentItems.map(item => item.pic_prev);

    wx.previewImage({
      urls: urls,
      current: urls[photoIndex],
    });
  },

  // 如何引导用户去长按猫猫头像
  // 点击猫猫头像
  onCatAvatarTap(e) {
    const selectedCat = e.currentTarget.dataset.cat;
    // 对于 #gradient 头像,触发点击事件
    if (selectedCat.svgImg.includes('url(%23gradient)')) {
      // 判断是展示某只猫猫的动态，还是全部动态
      const currentCatId = selectedCat._id === this.data.currentCatId ? null : selectedCat._id;
      
      // 更新当前猫猫名字
      const currentCatName = currentCatId ? selectedCat.name : '';

      // 更新猫猫头像状态
      const followCatsList = this.data.followCatsList.map(cat => {
        return this.updateCatAvatarStatus(cat, selectedCat);
      });

      this.setData({
        currentCatId,
        currentCatName,
        feed: [],
        loadnomore: false,
        followCatsList,
      }, () => {
        this.resetFeedData();
      });
    } else {
      // 对于 #ccc 头像,不触发点击事件
      wx.showToast({
        title: 'ta最近没有新动态哦',
        icon: 'none',
      });
    };
  },

  // 更新猫猫头像状态 TODO: 添加dasharray过渡动画
  updateCatAvatarStatus(cat, selectedCat) {
    const statusMap = {
      selected: {
        true: gradientAvatarSvg('url(#gradient)', '5, 15'), // 选中状态
        false: gradientAvatarSvg('url(#gradient)', '0'),    // 点击另一只猫复原当前状态
      },
      unselected: gradientAvatarSvg('url(#gradient)', '0'), // 未选中状态
    };

    if (cat._id === selectedCat._id) {
      cat.selected = !cat.selected;
      cat.svgImg = statusMap.selected[cat.selected];
    } else if (cat.selected) {
      cat.selected = false;
      cat.svgImg = statusMap.unselected;
    }

    return cat;
  },

  // 重置动态数据
  resetFeedData() {
    this.jsData.waitingList = {
      photo: [],
      comment: [],
    };
    this.jsData.loadedCount = {
      photo: 0,
      comment: 0,
    };
    this.loadMoreFeed();
  },

  closeThisCatFeed() {
    const currentCatId = this.data.currentCatId;
    
    // 更新猫猫头像状态
    const followCatsList = this.data.followCatsList.map(cat => {
      if (cat._id === currentCatId) {
        return this.updateCatAvatarStatus(cat, cat);
      }
      return cat;
    });

    this.setData({
      currentCatId: null,
      currentCatName: '',
      feed: [],
      loadnomore: false,
      followCatsList,
    }, () => {
      this.resetFeedData();
    });
  },

  // 长按猫猫头像
  onCatAvatarLongPress(e) {
    const selectedCat = e.currentTarget.dataset.cat;
    
    // 触发动画
    const followCatsList = this.data.followCatsList.map(cat => {
      if (cat._id === selectedCat._id) {
        cat.showAnimation = true;
      }
      return cat;
    });
    this.setData({ followCatsList });

    wx.vibrateShort({ type: 'medium' });
    
    this.setData({ 
      showMenu: true,
      selectedCat: selectedCat,
    });

    // 一段时间后隐藏动画
    setTimeout(() => {
      const followCatsList = this.data.followCatsList.map(cat => {
        if (cat._id === selectedCat._id) {
          cat.showAnimation = false;
        }
        return cat;
      });
      this.setData({ followCatsList });
    }, 350);  // 0.35s后隐藏动画
  },
  
  closeMenu() {
    this.setData({ showMenu: false });
  },

  async toggleFollowCat(e) {
    if (this.jsData.updatingFollowCats) {
      return;
    }

    this.jsData.updatingFollowCats = true;

    let { unfollowed, catid } = e.currentTarget.dataset;
    let res = await api.updateFollowCats({
      updateCmd: unfollowed ? "add" : "del",
      catId: catid,
    });

    // 更新取消关注/继续关注按钮的颜色，
    let newUnfollowedStatus = !this.data.selectedCat.unfollowed;
    this.setData({
      'selectedCat.unfollowed': newUnfollowedStatus
    });

    // 同步更新 followCatsList 中对应的猫的属性
    let updatedCatsList = this.data.followCatsList.map(catItem => {
      if (catItem._id === catid) {
        return { ...catItem, unfollowed: newUnfollowedStatus };
      }
      return catItem;
    });
    this.setData({
      followCatsList: updatedCatsList,
      // currentCatId: newUnfollowedStatus ? null : catid,
    });

    wx.showToast({
      title: `${unfollowed ? "关注" : "取关"}${res.result ? "成功": "失败"}`,
      icon: res.result ? "success": "error"
    });

    // 如果当前是该猫动态，取关后关闭
    if (this.data.currentCatId === catid && !unfollowed) {
      this.closeThisCatFeed();
    }
    
    this.jsData.updatingFollowCats = false;
  },
})