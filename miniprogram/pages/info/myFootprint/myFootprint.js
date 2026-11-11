import { loadFootprintComments, presentFootprintComments } from "../../../utils/footprint";
// 我的足迹：我拍的照片、拍过的猫咪、我的便利贴
import { getCatItemMulti, getAvatar } from "../../../utils/cat";
import { signCosUrl } from "../../../utils/common";
import { formatDate } from "../../../utils/utils";
import { likeCheck, likeAdd } from "../../../utils/inter";
import api from "../../../utils/cloudApi";

const app = getApp();

const PHOTO_PAGE_SIZE = 8;
const PAGE_TITLES = { photos: '我拍的照片', cats: '拍过的猫咪', comments: '我的便利贴' };

Page({
  data: {
    viewMode: 'overview',
    myOpenid: '',
    photoSort: 'recent',
    photosLoading: true,
    catsLoading: true,
    commentsLoading: true,
    // 我拍的照片
    photos: [],
    displayPhotos: [],
    photosNoMore: false,
    // 照片统计（单次 count，与分页加载无关）
    photoStats: null,
    // 拍过的猫咪
    cats: [],
    displayCats: [],
    // 我的便利贴
    comments: [],
    displayComments: [],
  },

  async onLoad(options) {
    this.jsData = {
      myOpenid: '',
      photoSkip: 0,
      photosLoading: false,
      hasShown: false,
    };
    const viewMode = PAGE_TITLES[options.type] ? options.type : 'overview';
    const photoSort = viewMode === 'photos' && options.sort === 'likes' ? 'likes' : 'recent';
    this.setData({ viewMode, photoSort });
    if (viewMode !== 'overview') wx.setNavigationBarTitle({ title: photoSort === 'likes' ? '照片被赞' : PAGE_TITLES[viewMode] });
    this.jsData.myOpenid = await api.getCurrentUserOpenid();
    if (!this.jsData.myOpenid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      this.setData({ photosLoading: false, catsLoading: false, commentsLoading: false });
      return;
    }
    this.setData({ myOpenid: this.jsData.myOpenid });
    if (viewMode !== 'overview') this.refresh();
  },

  onShow() {
    if (!this.jsData) return;
    if (!this.jsData.hasShown) {
      this.jsData.hasShown = true;
      return;
    }
    if (!this.jsData.myOpenid) return;
    this.refresh();
  },

  onReachBottom() {
    if (this.data.viewMode === 'photos') this.loadMorePhotos();
  },

  refresh() {
    const mode = this.data.viewMode;
    if (mode === 'overview') {
      this.selectComponent('#footprint-overview')?.refresh();
    }
    if (mode === 'photos') {
      this.loadPhotos();
      if (this.data.photoSort !== 'likes') this.loadPhotoStats();
    }
    if (mode === 'cats') this.loadCats();
    if (mode === 'comments') this.loadComments();
  },

  // 我上传过的照片（含猫咪名、上传时间，可定位猫咪主页）
  async loadPhotos() {
    // 重置分页游标，重新拉第一页
    this.jsData.photoSkip = 0;
    this.setData({ photos: [], displayPhotos: [], photosNoMore: false, photosLoading: true });
    await this.loadMorePhotos();
  },

  // 分页追加：每次拉 PHOTO_PAGE_SIZE 张，触底后由 onReachBottom 触发
  async loadMorePhotos() {
    if (this.jsData.photosLoading) return;
    if (this.jsData.photoSkip > 0 && this.data.photosNoMore) return;
    this.jsData.photosLoading = true;
    const isFirstPage = this.jsData.photoSkip === 0;
    if (isFirstPage) this.setData({ photosLoading: true });
    try {
      const pageSize = PHOTO_PAGE_SIZE;
      const mostLiked = this.data.photoSort === 'likes';
      const { result: photos } = await app.mpServerless.db.collection('photo').find(
        mostLiked
          ? { _openid: this.jsData.myOpenid, like_count: { $gt: 0 } }
          : { _openid: this.jsData.myOpenid },
        // create_date 旧数据可能缺失（老后端迁移），用 mdate 兜底排序
        { sort: mostLiked ? { like_count: -1, _id: -1 } : { create_date: -1, mdate: -1 }, skip: this.jsData.photoSkip, limit: pageSize }
      );
      // 猫名
      const catIds = [...new Set((photos || []).map(p => p.cat_id).filter(Boolean))];
      const catMap = {};
      if (catIds.length) {
        const cats = await getCatItemMulti(catIds);
        for (const cat of cats) {
          if (cat) catMap[cat._id] = cat;
        }
      }

      // 签名URL（压缩图优先，省流量）
      // 时间兜底：老后端迁移的照片缺 create_date，用 mdate 顶上
      const list = await Promise.all((photos || []).map(async p => {
        const rawDate = p.create_date || p.mdate;
        const d = rawDate ? new Date(rawDate) : null;
        return {
          ...p,
          cat: catMap[p.cat_id] || {},
          url: await signCosUrl(p.photo_compressed || p.photo_id),
          create_date_formatted: (d && !isNaN(d.getTime())) ? formatDate(d, 'yyyy-MM-dd hh:mm') : '',
          status_desc: p.verified ? (p.best ? '精选' : '已通过') : '待审核',
          status_icon: p.verified ? (p.best ? 'icon-star' : 'icon-check') : 'icon-clock',
          status_type: p.verified ? (p.best ? 'best' : 'passed') : 'pending',
        };
      }));

      try {
        const liked = list.length ? await likeCheck(list.map(item => item._id)) : [];
        list.forEach((item, index) => { item.liked = Boolean(liked[index]); });
      } catch (error) {
        console.warn('查询足迹照片点赞状态失败', error);
      }

      this.jsData.photoSkip += (photos || []).length;
      const noMore = !photos || photos.length < pageSize;
      const allPhotos = isFirstPage ? list : this.data.photos.concat(list);
      this.setData({
        photos: allPhotos,
        displayPhotos: allPhotos,
        photosNoMore: noMore,
        photosLoading: false,
      });
    } catch (err) {
      console.error('[loadMorePhotos] - 加载我的照片失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ photosLoading: false });
    } finally {
      this.jsData.photosLoading = false;
    }
  },

  // 照片统计：总数 + 精选数（单次 count，与分页加载无关）
  async loadPhotoStats() {
    try {
      const qf = { _openid: this.jsData.myOpenid };
      const [total, best] = await Promise.all([
        app.mpServerless.db.collection('photo').count(qf),
        app.mpServerless.db.collection('photo').count({ ...qf, verified: true, best: true }),
      ]);
      this.setData({ photoStats: { total: total.result, best: best.result } });
    } catch (err) {
      console.error('[loadPhotoStats] - 统计照片数失败:', err);
    }
  },

  // 我拍过的猫咪列表（去重）
  async loadCats() {
    this.setData({ catsLoading: true });
    try {
      const photos = [];
      const batchSize = 500;
      let batch;
      do {
        const response = await app.mpServerless.db.collection('photo').find(
          { _openid: this.jsData.myOpenid },
          { sort: { _id: 1 }, skip: photos.length, limit: batchSize }
        );
        batch = response.result || [];
        photos.push(...batch);
      } while (batch.length === batchSize);
      const catIds = [...new Set(photos.map(p => p.cat_id).filter(Boolean))];

      // 统计每只猫的照片数
      const countMap = {};
      for (const p of photos) {
        if (p.cat_id) countMap[p.cat_id] = (countMap[p.cat_id] || 0) + 1;
      }

      let cats = catIds.length ? await getCatItemMulti(catIds) : [];
      // 封面图（cat文档本身不含头像对象，需单独获取）
      const avatars = catIds.length ? await getAvatar(catIds) : [];
      const avatarMap = {};
      catIds.forEach((id, i) => { avatarMap[id] = avatars[i]; });
      cats = (cats || []).filter(c => c).map(c => ({
        ...c,
        avatar: avatarMap[c._id],
        my_photo_count: countMap[c._id] || 0,
      }));
      // 按我拍的照片数降序
      cats.sort((a, b) => b.my_photo_count - a.my_photo_count);

      this.setData({ cats, displayCats: cats, catsLoading: false });
    } catch (err) {
      console.error('[loadCats] - 加载拍过的猫咪失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ catsLoading: false });
    }
  },

  // 我的便利贴（含猫咪定位）
  async loadComments() {
    this.setData({ commentsLoading: true });
    try {
      const comments = await loadFootprintComments(this.jsData.myOpenid);
      const list = await presentFootprintComments(comments);
      this.setData({ comments: list, displayComments: list, commentsLoading: false });
    } catch (err) {
      console.error('[loadComments] - 加载我的便利贴失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ commentsLoading: false });
    }
  },

  likePhoto(e) {
    return this.likeItem(e, 'photo', 'photos', 'displayPhotos');
  },

  likeComment(e) {
    return this.likeItem(e, 'comment', 'comments', 'displayComments');
  },

  async likeItem(e, type, sourceField, displayField) {
    const { itemId } = e.currentTarget.dataset;
    const item = this.data[displayField].find(item => item._id === itemId);
    if (!item || item.deleted || (type === 'comment' && item.needVerify)) return;
    if (!this.likingIds) this.likingIds = new Set();
    const lock = `${type}:${itemId}`;
    if (this.likingIds.has(lock)) return;
    if (item.liked) {
      wx.showToast({ title: '已经赞过啦', icon: 'none' });
      return;
    }
    this.likingIds.add(lock);
    try {
      const added = await likeAdd(itemId, type);
      const patch = {};
      for (const field of [sourceField, displayField]) {
        const index = this.data[field].findIndex(item => item._id === itemId);
        if (index < 0) continue;
        patch[`${field}[${index}].liked`] = true;
        if (added) patch[`${field}[${index}].like_count`] = (Number(this.data[field][index].like_count) || 0) + 1;
      }
      this.setData(patch);
      if (!added) wx.showToast({ title: '已经赞过啦', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: '点赞失败，稍后再试', icon: 'none' });
    } finally {
      this.likingIds.delete(lock);
    }
  },

  // 定位到猫咪主页
  toCatDetail(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    if (!cat_id) return;
    wx.navigateTo({
      url: '/pages/genealogy/detailCat/detailCat?cat_id=' + cat_id,
    });
  },

  // 定位到猫咪的便利贴墙
  toCommentBoard(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    if (!cat_id) return;
    wx.navigateTo({
      url: '/pages/genealogy/commentBoard/commentBoard?cat_id=' + cat_id,
    });
  },

  previewPhoto(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({ urls: [url] });
  },
});
