// 我的足迹：我拍的照片、拍过的猫咪、我的便利贴
import { getCatItemMulti, getAvatar } from "../../../utils/cat";
import { signCosUrl } from "../../../utils/common";
import { formatDate } from "../../../utils/utils";
import api from "../../../utils/cloudApi";

const app = getApp();

const TABS = [
  { key: 'photos', name: '我拍的照片' },
  { key: 'cats', name: '拍过的猫咪' },
  { key: 'comments', name: '我的便利贴' },
];

Page({
  data: {
    tabs: TABS,
    activeTab: 'photos',
    loading: true,
    // 我拍的照片
    photos: [],
    // 拍过的猫咪
    cats: [],
    // 我的便利贴
    comments: [],
  },

  jsData: {
    myOpenid: '',
    loaded: {}, // 各 tab 是否已加载
  },

  async onLoad() {
    this.jsData.myOpenid = await api.getCurrentUserOpenid();
    if (!this.jsData.myOpenid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      this.setData({ loading: false });
      return;
    }
    await this.loadPhotos();
  },

  async onShow() {
    // 返回本页时强制刷新：照片可能被管理员转移到正确的猫，归属会变化
    if (!this.jsData.myOpenid) return;
    this.jsData.loaded = {};
    const key = this.data.activeTab;
    if (key === 'photos') await this.loadPhotos();
    else if (key === 'cats') await this.loadCats();
    else if (key === 'comments') await this.loadComments();
  },

  switchTab(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeTab) return;
    this.setData({ activeTab: key });

    // 按需加载
    if (!this.jsData.loaded[key]) {
      if (key === 'photos') this.loadPhotos();
      else if (key === 'cats') this.loadCats();
      else if (key === 'comments') this.loadComments();
    }
  },

  // 我上传过的照片（含猫咪名、上传时间，可定位猫咪主页）
  async loadPhotos() {
    this.setData({ loading: true });
    try {
      const { result: photos } = await app.mpServerless.db.collection('photo').find(
        { _openid: this.jsData.myOpenid },
        { sort: { create_date: -1 }, limit: 100 }
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
      const list = await Promise.all((photos || []).map(async p => ({
        ...p,
        cat: catMap[p.cat_id] || {},
        url: await signCosUrl(p.photo_compressed || p.photo_id),
        create_date_formatted: p.create_date ? formatDate(p.create_date, 'yyyy-MM-dd hh:mm') : '',
        status_desc: p.verified ? (p.best ? '精选' : '已通过') : '待审核',
      })));

      this.jsData.loaded.photos = true;
      this.setData({ photos: list, loading: false });
    } catch (err) {
      console.error('[loadPhotos] - 加载我的照片失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 我拍过的猫咪列表（去重）
  async loadCats() {
    this.setData({ loading: true });
    try {
      const { result: photos } = await app.mpServerless.db.collection('photo').find(
        { _openid: this.jsData.myOpenid },
        { limit: 500 }
      );
      const catIds = [...new Set((photos || []).map(p => p.cat_id).filter(Boolean))];

      // 统计每只猫的照片数
      const countMap = {};
      for (const p of (photos || [])) {
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

      this.jsData.loaded.cats = true;
      this.setData({ cats, loading: false });
    } catch (err) {
      console.error('[loadCats] - 加载拍过的猫咪失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 我的便利贴（含猫咪定位）
  async loadComments() {
    this.setData({ loading: true });
    try {
      const { result: comments } = await app.mpServerless.db.collection('comment').find(
        { user_openid: this.jsData.myOpenid, deleted: { $ne: true } },
        { sort: { create_date: -1 }, limit: 100 }
      );

      const catIds = [...new Set((comments || []).map(c => c.cat_id).filter(Boolean))];
      const catMap = {};
      if (catIds.length) {
        const cats = await getCatItemMulti(catIds);
        for (const cat of cats) {
          if (cat) catMap[cat._id] = cat;
        }
      }

      const list = (comments || []).map(c => ({
        ...c,
        cat: catMap[c.cat_id] || {},
        datetime: c.create_date ? formatDate(new Date(c.create_date), 'yyyy-MM-dd hh:mm') : '',
        status_desc: c.needVerify ? '待审核' : '',
      }));

      this.jsData.loaded.comments = true;
      this.setData({ comments: list, loading: false });
    } catch (err) {
      console.error('[loadComments] - 加载我的便利贴失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
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
