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
import { signCosUrl } from "../../utils/common.js";

const app = getApp();

// 每次触底加载的数量
const loadCount = 13;
// 最多加载几天前的照片
const maxNDaysAgo = 30;


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
    // 标记是否需要重新加载Feed数据
    let needRefreshFeed = true;
    let needIncrementalUpdate = false;

    // 尝试从缓存加载数据
    const cachedData = wx.getStorageSync('followFeedCache');

    // 缓存有效期（30分钟，单位为毫秒）
    const CACHE_TTL = 30 * 60 * 1000;

    if (cachedData) {
      // 检查缓存是否过期
      const now = Date.now();
      const isCacheValid = cachedData.timestamp && (now - cachedData.timestamp < CACHE_TTL);
      if (isCacheValid) {
        // 恢复缓存数据
        this.setData({
          feed: cachedData.feed || [],
          followCatsList: cachedData.followCatsList || [],
          followCats: cachedData.followCats || [],
          loadnomore: cachedData.loadnomore,
          user: cachedData.user  // 也恢复用户数据
        });

        // 恢复缓存的jsData
        if (cachedData.jsData) {
          this.jsData.loadedCount = cachedData.jsData.loadedCount || { photo: 0, comment: 0 };
          this.jsData.waitingList = cachedData.jsData.waitingList || { photo: [], comment: [] };
        }

        console.log('从缓存加载Feed数据，缓存时间：', new Date(cachedData.timestamp).toLocaleString());

        // 如果缓存有效且有数据，则使用增量更新模式
        if (cachedData.feed && cachedData.feed.length > 0) {
          needRefreshFeed = false;
          needIncrementalUpdate = true;
        }
      } else {
        console.log('缓存已过期，将重新加载数据');
        // 清除过期的缓存数据，重置feed
        this.resetFeedData();
      }
    }

    // 1. 首先加载用户信息，因为其他函数依赖于此
    await this.loadUser();

    // 2. 然后加载关注的猫咪列表
    await this.loadFollowCats();

    // 3. 猫咪详情需要在获取关注列表后加载
    await this.loadFollowCatsDetail();

    // 4. 根据情况加载Feed数据
    if (needRefreshFeed) {
      // 完全重新加载Feed数据
      await this.loadMoreFeed();
    } else if (needIncrementalUpdate) {
      // 只加载新的数据
      await this.loadLatestFeed();
    }

    this.setData({
      refreshing: false
    });

    // 缓存当前数据
    this._saveDataToCache();
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
    // 页面隐藏时保存数据到缓存
    this._saveDataToCache();
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    // 页面卸载时保存数据到缓存
    this._saveDataToCache();
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  async onPullDownRefresh() {
    // 清除缓存数据
    wx.removeStorageSync('followFeedCache');

    // 重置数据
    this.resetFeedData();

    // 重新加载所有数据
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
    let { openid } = this.data.user;
    // 获取用户的关注列表
    const followCats = (await app.mpServerless.db.collection('user').findOne({
      openid: openid
    }, {
      projection: {
        followCats: 1
      }
    })).result.followCats;

    console.log(followCats);
    // 重置一下，便于下拉刷新用
    this.setData({ followCats, feed: [], loadnomore: false });
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
    const { followCats } = this.data;

    if (!followCats || followCats.length === 0) {
      this.setData({ followCatsList: [] });
      return;
    }

    // 加载关注列表，用于顶部展示
    const followCatsList = await getCatItemMulti(followCats);

    // 获取当前时间和 maxNDaysAgo 天前的时间
    const maxCreateDate = getDateWithDiffHours(-1 * maxNDaysAgo * 24);

    // 批量获取所有关注猫的最新照片（一次查询）
    const latestPhotosQuery = await app.mpServerless.db.collection('photo').find({
      cat_id: { $in: followCats },
      verified: true,
      create_date: { $gt: maxCreateDate },
    }, {
      sort: { create_date: -1 },
    })

    // 批量获取所有关注猫的最新评论（一次查询）
    const latestCommentsQuery = await app.mpServerless.db.collection('comment').find({
      cat_id: { $in: followCats },
      deleted: { $ne: true },
      create_date: { $gt: maxCreateDate },
    }, {
      sort: { create_date: -1 },
    })

    // 并行执行两个批量查询
    const [latestPhotosResult, latestCommentsResult] = await Promise.all([
      latestPhotosQuery,
      latestCommentsQuery
    ]);

    const latestPhotos = latestPhotosResult.result;
    const latestComments = latestCommentsResult.result;

    // 并行获取所有猫咪的头像
    const avatarPromises = followCatsList.map(cat => getAvatar(cat._id, cat.photo_count_best));
    const avatars = await Promise.all(avatarPromises);

    // 将头像信息添加到猫咪对象中
    followCatsList.forEach((cat, index) => {
      cat.avatar = avatars[index];
      cat.unfollowed = false; // 默认未取关
      // 找出该猫的最新照片
      const catLatestPhoto = latestPhotos.find(photo => photo.cat_id === cat._id);
      // 找出该猫的最新评论
      const catLatestComment = latestComments.find(comment => comment.cat_id === cat._id);
      // 记录最近照片，评论的创建时间
      cat.latestTime = Math.max(
        catLatestPhoto ? catLatestPhoto.create_date : 0,
        catLatestComment ? catLatestComment.create_date : 0
      );

      // 动态改变不同状态猫的svg颜色 => 旧动态：#ccc；新动态：#gradient
      const hasNewDynamic = (catLatestPhoto && new Date(catLatestPhoto.create_date) > maxCreateDate) ||
        (catLatestComment && new Date(catLatestComment.create_date) > maxCreateDate);

      cat.svgImg = hasNewDynamic
        ? (cat._id === this.data.currentCatId)
          ? gradientAvatarSvg('url(#gradient)', '5, 15') // 选中状态
          : gradientAvatarSvg('url(#gradient)', '0')     // 有新动态，未选中
        : gradientAvatarSvg('#ccc');                     // 无新动态

      cat.selected = hasNewDynamic && (cat._id === this.data.currentCatId);
    });

    // 按最新动态时间排序
    followCatsList.sort((a, b) => b.latestTime - a.latestTime);
    console.log('关注列表', followCatsList);
    this.setData({ followCatsList: followCatsList });
  },

  async _loadData(coll, catId = null) {
    let { loadedCount } = this.jsData;
    let { followCats } = this.data;
    // 每次加载每种类型数据的数量
    const limit = loadCount + 1;

    // 构建查询条件
    let whereField = {};
    let maxCreateDate = getDateWithDiffHours(-1 * maxNDaysAgo * 24);
    if (coll === 'photo') {
      whereField = {
        verified: true,
        create_date: { $gt: maxCreateDate },
      }
    } else if (coll === 'comment') {
      whereField = {
        deleted: { $ne: true },
        needVerify: false,
        create_date: { $gt: maxCreateDate },
      };
    }

    if (catId) {
      // 加载指定猫猫的数据
      whereField.cat_id = catId;
    } else {
      // 加载全部数据
      whereField.cat_id = { $in: followCats };
    }

    // 查询数据
    let { result: res } = await app.mpServerless.db.collection(coll).find(whereField, {
      sort: { create_date: -1 },
      skip: loadedCount[coll],
      limit: limit,
    });

    // 如果没有数据直接返回
    if (!res || res.length === 0) {
      return [];
    }
    // 预处理数据
    // 填充用户信息（可并行执行）
    let openidField = coll === 'photo' ? '_openid' : 'user_openid';
    const fillUserPromise = fillUserInfo(res, openidField, "userInfo");

    // 同时预处理每条数据
    res.forEach(async p => {
      // 已经在followCatsList中的猫咪数据，直接引用
      p.cat = this.data.followCatsList.find(cat => cat._id === p.cat_id);

      // 格式化时间
      p.datetime = this.formatDateTime(new Date(p.create_date));

      if (coll == 'comment') {
        // 便签旋转和贴纸位置
        p.rotate = randomInt(-5, 5);
        p.tape_pos_left = randomInt(20, 520);
        p.tape_rotate = randomInt(-50, +50);
      }

      if (coll == 'photo') {
        // 使用压缩版图片
        p.pic = await signCosUrl(p.photo_compressed || p.photo_id);
        p.pic_prev = await signCosUrl(p.photo_watermark || p.photo_id);
      }
    });

    // 等待用户信息填充完成
    await fillUserPromise;

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
    // 防止重复加载
    if (this.jsData.loadingLock) {
      return;
    }
    this.jsData.loadingLock = true;

    try {
      let { waitingList, loadedCount } = this.jsData;
      let loadnomore = true;
      const { currentCatId } = this.data;

      // 并行加载照片和评论数据
      let photoPromise, commentPromise;

      if (currentCatId) {
        // 加载指定猫猫的数据
        if (waitingList.photo.length <= loadCount) {
          photoPromise = this._loadData("photo", currentCatId);
        }
        if (waitingList.comment.length <= loadCount) {
          commentPromise = this._loadData("comment", currentCatId);
        }
      } else {
        // 加载全部关注猫的数据
        if (waitingList.photo.length <= loadCount) {
          photoPromise = this._loadData("photo");
        }
        if (waitingList.comment.length <= loadCount) {
          commentPromise = this._loadData("comment");
        }
      }

      // 并行等待数据加载完成
      let photoRes = photoPromise ? await photoPromise : [];
      let commentRes = commentPromise ? await commentPromise : [];

      // 检查是否还有更多数据可加载
      if (photoRes.length === loadCount + 1 || commentRes.length === loadCount + 1) {
        loadnomore = false;
      }
      // 更新waiting列表和加载计数
      if (photoRes.length > 0) {
        waitingList.photo.push(...photoRes);
        loadedCount.photo += photoRes.length;
      }
      if (commentRes.length > 0) {
        waitingList.comment.push(...commentRes);
        loadedCount.comment += commentRes.length;
      }

      console.log(waitingList, loadnomore);
      this.setData({ loadnomore });

      // 归并排序，合并数据
      await this._sortedMerge();
    } catch (error) {
      console.error('加载Feed数据失败:', error);
    } finally {
      this.jsData.loadingLock = false;
    }
  },

  async _sortedMerge() {
    let { waitingList } = this.jsData;
    let { loadnomore, feed } = this.data;

    // 排序优化：只在必要时进行排序
    if (waitingList.photo.length > 1) {
      waitingList.photo.sort((a, b) => b.create_date - a.create_date);
    }
    if (waitingList.comment.length > 1) {
      waitingList.comment.sort((a, b) => b.create_date - a.create_date);
    }

    // 创建新的数组以存储要添加的feed项
    let newFeedItems = [];

    // 需要保留的元素数量
    const keepCount = loadnomore ? 0 : 1;

    // 时间间隔设置（5分钟）
    const TIME_INTERVAL = 5 * 60 * 1000;

    // 每组最大数量限制
    const MAX_PHOTOS_PER_GROUP = 6;
    const MAX_COMMENTS_PER_GROUP = 3;

    // 归并排序照片和评论，按时间降序排列
    while ((newFeedItems.length < loadCount || loadnomore) &&
      (waitingList.photo.length > keepCount || waitingList.comment.length > keepCount)) {
      // 如果照片队列已空，添加评论
      if (waitingList.photo.length <= keepCount) {
        const comment = waitingList.comment.shift();
        comment.dtype = 'comment';

        // 获取最新的feed项
        const latestFeedItem = newFeedItems.length > 0 ? newFeedItems[newFeedItems.length - 1] : null;

        // 检查是否可以合并到现有组
        const canMerge = latestFeedItem &&
          latestFeedItem.dtype === 'comment' &&
          latestFeedItem.cat._id === comment.cat_id &&
          latestFeedItem.items.length < MAX_COMMENTS_PER_GROUP &&
          Math.abs(new Date(latestFeedItem.items[0].create_date).getTime() -
            new Date(comment.create_date).getTime()) <= TIME_INTERVAL;

        if (canMerge) {
          latestFeedItem.items.push(comment);
        } else {
          newFeedItems.push({
            _id: `comment_${Date.now()}_${Math.random()}`,
            dtype: 'comment',
            cat: comment.cat,
            items: [comment]
          });
        }
        continue;
      }
      // 如果评论队列已空，添加照片
      if (waitingList.comment.length <= keepCount) {
        const photo = waitingList.photo.shift();
        photo.dtype = 'photo';

        // 获取最新的feed项
        const latestFeedItem = newFeedItems.length > 0 ? newFeedItems[newFeedItems.length - 1] : null;

        // 检查是否可以合并到现有组
        const canMerge = latestFeedItem &&
          latestFeedItem.dtype === 'photo' &&
          latestFeedItem.cat._id === photo.cat_id &&
          latestFeedItem.items[0]._openid === photo._openid &&
          latestFeedItem.items.length < MAX_PHOTOS_PER_GROUP &&
          Math.abs(new Date(latestFeedItem.items[0].create_date).getTime() -
            new Date(photo.create_date).getTime()) <= TIME_INTERVAL;

        if (canMerge) {
          latestFeedItem.items.push(photo);
        } else {
          newFeedItems.push({
            _id: `photo_${Date.now()}_${Math.random()}`,
            dtype: 'photo',
            cat: photo.cat,
            items: [photo]
          });
        }
        continue;
      }
      // 比较照片和评论的时间，较新的先加入
      const latestPhoto = waitingList.photo[0];
      const latestComment = waitingList.comment[0];
      if (latestPhoto.create_date > latestComment.create_date) {
        const photo = waitingList.photo.shift();
        photo.dtype = 'photo';

        // 获取最新的feed项
        const latestFeedItem = newFeedItems.length > 0 ? newFeedItems[newFeedItems.length - 1] : null;

        // 检查是否可以合并到现有组
        const canMerge = latestFeedItem &&
          latestFeedItem.dtype === 'photo' &&
          latestFeedItem.cat._id === photo.cat_id &&
          latestFeedItem.items[0]._openid === photo._openid &&
          latestFeedItem.items.length < MAX_PHOTOS_PER_GROUP &&
          Math.abs(new Date(latestFeedItem.items[0].create_date).getTime() -
            new Date(photo.create_date).getTime()) <= TIME_INTERVAL;

        if (canMerge) {
          latestFeedItem.items.push(photo);
        } else {
          newFeedItems.push({
            _id: `photo_${Date.now()}_${Math.random()}`,
            dtype: 'photo',
            cat: photo.cat,
            items: [photo]
          });
        }
      } else {
        const comment = waitingList.comment.shift();
        comment.dtype = 'comment';

        // 获取最新的feed项
        const latestFeedItem = newFeedItems.length > 0 ? newFeedItems[newFeedItems.length - 1] : null;

        // 检查是否可以合并到现有组
        const canMerge = latestFeedItem &&
          latestFeedItem.dtype === 'comment' &&
          latestFeedItem.cat._id === comment.cat_id &&
          latestFeedItem.items.length < MAX_COMMENTS_PER_GROUP &&
          Math.abs(new Date(latestFeedItem.items[0].create_date).getTime() -
            new Date(comment.create_date).getTime()) <= TIME_INTERVAL;

        if (canMerge) {
          latestFeedItem.items.push(comment);
        } else {
          newFeedItems.push({
            _id: `comment_${Date.now()}_${Math.random()}`,
            dtype: 'comment',
            cat: comment.cat,
            items: [comment]
          });
        }
      }
    }
    // 更新feed数据，添加新项到现有feed中
    if (newFeedItems.length > 0) {
      this.setData({
        feed: [...feed, ...newFeedItems]
      });
    }
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
      title: `${unfollowed ? "关注" : "取关"}${res ? "成功" : "失败"}`,
      icon: res ? "success" : "error"
    });

    // 如果当前是该猫动态，取关后关闭
    if (this.data.currentCatId === catid && !unfollowed) {
      this.closeThisCatFeed();
    }
    this.jsData.updatingFollowCats = false;
  },

  /**
   * 保存数据到本地缓存
   */
  _saveDataToCache() {
    const cacheData = {
      feed: this.data.feed,
      followCatsList: this.data.followCatsList,
      followCats: this.data.followCats,
      loadnomore: this.data.loadnomore,
      user: this.data.user,  // 添加用户数据到缓存
      jsData: {
        loadedCount: this.jsData.loadedCount,
        waitingList: this.jsData.waitingList
      },
      timestamp: Date.now()
    };
    try {
      wx.setStorageSync('followFeedCache', cacheData);
      console.log('已保存Feed数据到缓存');
    } catch (e) {
      console.error('缓存Feed数据失败:', e);
    }
  },

  /**
   * 增量加载最新的Feed数据
   */
  async loadLatestFeed() {
    // 获取当前Feed中最新一条数据的时间
    let latestTimestamp = 0;
    const { feed } = this.data;
    if (feed && feed.length > 0) {
      // 查找当前Feed中最新的一条数据
      for (const item of feed) {
        if (item.items && item.items.length > 0) {
          const itemTimestamp = new Date(item.items[0].create_date).getTime();
          if (itemTimestamp > latestTimestamp) {
            latestTimestamp = itemTimestamp;
          }
        }
      }
    }
    // 如果没有现有数据，直接加载所有数据
    if (latestTimestamp === 0) {
      return this.loadMoreFeed();
    }

    console.log('加载晚于以下时间的新动态:', new Date(latestTimestamp).toLocaleString());

    // 防止重复加载
    if (this.jsData.loadingLock) {
      return;
    }
    this.jsData.loadingLock = true;

    try {
      // 准备数据库查询
      const { followCats, currentCatId } = this.data;

      // 构建查询条件 - 只查询比现有数据更新的内容
      const latestDate = new Date(latestTimestamp);

      // 查询条件
      let photoQuery, commentQuery;

      if (currentCatId) {
        // 查询指定猫的最新照片
        photoQuery = app.mpServerless.db.collection('photo').find({ cat_id: currentCatId, verified: true, create_date: { $gt: latestDate } }, { sort: { create_date: -1 } });

        // 查询指定猫的最新评论
        commentQuery = app.mpServerless.db.collection('comment').find({ cat_id: currentCatId, deleted: { $ne: true }, needVerify: false, create_date: { $gt: latestDate } }, { sort: { create_date: -1 } });
      } else {
        // 查询所有关注猫的最新照片
        photoQuery = app.mpServerless.db.collection('photo').find({ cat_id: { $in: followCats }, verified: true, create_date: { $gt: latestDate } }, { sort: { create_date: -1 } });

        // 查询所有关注猫的最新评论
        commentQuery = app.mpServerless.db.collection('comment').find({ cat_id: { $in: followCats }, deleted: { $ne: true }, needVerify: false, create_date: { $gt: latestDate } }, { sort: { create_date: -1 } });
      }

      // 并行执行查询
      const [photoRes, commentRes] = await Promise.all([photoQuery, commentQuery]);

      // 处理新照片
      let newPhotos = photoRes.result || [];
      let newComments = commentRes.result || [];

      console.log(`发现${newPhotos.length}张新照片，${newComments.length}条新评论`);

      // 如果没有新内容，直接返回
      if (newPhotos.length === 0 && newComments.length === 0) {
        this.jsData.loadingLock = false;
        return;
      }

      // 处理数据
      if (newPhotos.length > 0) {
        await fillUserInfo(newPhotos, '_openid', "userInfo");
        newPhotos.forEach(async p => {
          p.cat = this.data.followCatsList.find(cat => cat._id === p.cat_id);
          p.datetime = this.formatDateTime(new Date(p.create_date));
          p.pic = await signCosUrl(p.photo_compressed || p.photo_id);
          p.pic_prev = await signCosUrl(p.photo_watermark || p.photo_id);
          p.dtype = 'photo';
        });
      }

      if (newComments.length > 0) {
        await fillUserInfo(newComments, 'user_openid', "userInfo");
        newComments.forEach(p => {
          p.cat = this.data.followCatsList.find(cat => cat._id === p.cat_id);
          p.datetime = this.formatDateTime(new Date(p.create_date));
          p.rotate = randomInt(-5, 5);
          p.tape_pos_left = randomInt(20, 520);
          p.tape_rotate = randomInt(-50, +50);
          p.dtype = 'comment';
        });
      }

      // 合并所有新数据并按时间排序
      let allNewItems = [...newPhotos, ...newComments];
      allNewItems.sort((a, b) => new Date(b.create_date) - new Date(a.create_date));

      // 创建新的feed项
      let newFeedItems = [];
      let lastType = null;
      let lastCatId = null;
      let lastOpenId = null;
      let currentGroup = null;

      // 分组处理
      allNewItems.forEach(item => {
        // 如果是新的类型、猫咪或用户，则创建新组
        if (item.dtype !== lastType || item.cat._id !== lastCatId ||
          (item.dtype === 'photo' && item._openid !== lastOpenId)) {

          // 创建新组
          currentGroup = {
            _id: `${item.dtype}_${Date.now()}_${Math.random()}`,
            dtype: item.dtype,
            cat: item.cat,
            items: [item]
          };

          newFeedItems.push(currentGroup);

          // 更新lastType和lastCatId
          lastType = item.dtype;
          lastCatId = item.cat._id;
          lastOpenId = item.dtype === 'photo' ? item._openid : null;
        } else {
          // 添加到现有组
          currentGroup.items.push(item);
        }
      });
      // 将新items添加到feed的前面
      this.setData({
        feed: [...newFeedItems, ...feed]
      });
    } catch (error) {
      console.error('加载最新Feed数据失败:', error);
    } finally {
      this.jsData.loadingLock = false;
    }
  },
})