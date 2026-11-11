import { loadFootprintComments, presentFootprintComments } from "../../utils/footprint";
import { getCatItemMulti, getAvatar } from "../../utils/cat";
import { signCosUrl } from "../../utils/common";
import { likeCheck, likeAdd } from "../../utils/inter";

const app = getApp();

Component({
  properties: {
    openid: {
      type: String,
      value: '',
      observer(value) {
        if (value) this.refresh();
      },
    },
  },

  data: {
    photosLoading: true,
    photosError: false,
    catsLoading: true,
    catsError: false,
    commentsLoading: true,
    commentsError: false,
    photoStats: null,
    displayPhotos: [],
    displayComments: [],
    displayCats: [],
  },

  methods: {
    refresh() {
      if (!this.data.openid) return;
      this.loadPhotos();
      this.loadComments();
      this.loadCats();
    },

    async loadPhotos() {
      const openid = this.data.openid;
      this.setData({ photosLoading: true, photosError: false });
      try {
        const collection = app.mpServerless.db.collection('photo');
        const [total, best, response] = await Promise.all([
          collection.count({ _openid: openid }),
          collection.count({ _openid: openid, verified: true, best: true }),
          collection.find(
            { _openid: openid },
            { sort: { create_date: -1, mdate: -1 }, limit: 6 }
          ),
        ]);
        const displayPhotos = await Promise.all((response.result || []).map(async photo => ({
          ...photo,
          url: await signCosUrl(photo.photo_compressed || photo.photo_id),
        })));
        try {
          const liked = displayPhotos.length ? await likeCheck(displayPhotos.map(photo => photo._id)) : [];
          displayPhotos.forEach((photo, index) => { photo.liked = Boolean(liked[index]); });
        } catch (error) {
          console.warn('查询足迹照片点赞状态失败', error);
        }
        if (this.data.openid !== openid) return;
        this.setData({
          photoStats: { total: total.result || 0, best: best.result || 0 },
          displayPhotos,
          photosLoading: false,
        });
      } catch (error) {
        console.error('加载足迹照片失败', error);
        if (this.data.openid !== openid) return;
        this.setData({ photosLoading: false, photosError: true });
      }
    },

    async loadComments() {
      const openid = this.data.openid;
      this.setData({ commentsLoading: true, commentsError: false });
      try {
        const comments = await loadFootprintComments(openid);
        comments.sort((a, b) =>
          (Number(b.like_count) || 0) - (Number(a.like_count) || 0) ||
          new Date(b.create_date || 0) - new Date(a.create_date || 0)
        );
        const displayComments = await presentFootprintComments(comments.slice(0, 2));
        if (this.data.openid !== openid) return;
        this.setData({ displayComments, commentsLoading: false });
        this.triggerEvent('statschange', { numUserComments: comments.length });
      } catch (error) {
        console.error('加载足迹便利贴失败', error);
        if (this.data.openid !== openid) return;
        this.setData({ commentsLoading: false, commentsError: true });
      }
    },

    async loadCats() {
      const openid = this.data.openid;
      this.setData({ catsLoading: true, catsError: false });
      try {
        const countMap = {};
        let numUserLiked = 0;
        const batchSize = 500;
        let skip = 0;
        let batch;
        do {
          const response = await app.mpServerless.db.collection('photo').find(
            { _openid: openid },
            { sort: { _id: 1 }, skip, limit: batchSize }
          );
          batch = response.result || [];
          for (const photo of batch) {
            if (photo.cat_id) countMap[photo.cat_id] = (countMap[photo.cat_id] || 0) + 1;
            numUserLiked += Number(photo.like_count) || 0;
          }
          skip += batch.length;
        } while (batch.length === batchSize);

        const catIds = Object.keys(countMap).sort((a, b) => countMap[b] - countMap[a]);
        const topIds = catIds.slice(0, 3);
        const [cats, avatars] = await Promise.all([
          topIds.length ? getCatItemMulti(topIds) : [],
          topIds.length ? getAvatar(topIds) : [],
        ]);
        const avatarMap = {};
        topIds.forEach((id, index) => { avatarMap[id] = avatars[index]; });
        const displayCats = (cats || []).filter(Boolean).map(cat => ({
          ...cat,
          avatar: avatarMap[cat._id],
          my_photo_count: countMap[cat._id] || 0,
        })).sort((a, b) => b.my_photo_count - a.my_photo_count);
        if (this.data.openid !== openid) return;
        this.setData({ displayCats, catsLoading: false });
        this.triggerEvent('statschange', { numCats: catIds.length, numUserLiked });
      } catch (error) {
        console.error('加载足迹猫咪失败', error);
        if (this.data.openid !== openid) return;
        this.setData({ catsLoading: false, catsError: true });
      }
    },

    openList(e) {
      const type = e.currentTarget.dataset.type;
      wx.navigateTo({ url: `/pages/info/myFootprint/myFootprint?type=${type}` });
    },

    async likePhoto(e) {
      const { itemId } = e.currentTarget.dataset;
      if (!itemId) return;
      const photo = this.data.displayPhotos.find(item => item._id === itemId);
      if (!photo || photo.deleted) return;
      if (!this.likingPhotoIds) this.likingPhotoIds = new Set();
      const locks = this.likingPhotoIds;
      if (locks.has(itemId)) return;
      if (photo.liked) {
        wx.showToast({ title: '已经赞过啦', icon: 'none' });
        return;
      }
      const openid = this.data.openid;
      locks.add(itemId);
      try {
        const added = await likeAdd(itemId, 'photo');
        if (this.data.openid !== openid) return;
        const index = this.data.displayPhotos.findIndex(item => item._id === itemId);
        if (index >= 0) {
          const current = this.data.displayPhotos[index];
          this.setData({
            [`displayPhotos[${index}].liked`]: true,
            ...(added ? { [`displayPhotos[${index}].like_count`]: (Number(current.like_count) || 0) + 1 } : {}),
          });
        }
        if (added) this.loadCats(); // 同步照片被赞总数。
        else wx.showToast({ title: '已经赞过啦', icon: 'none' });
      } catch (error) {
        wx.showToast({ title: '点赞失败，稍后再试', icon: 'none' });
      } finally {
        locks.delete(itemId);
      }
    },

    async likeComment(e) {
      const { itemId } = e.currentTarget.dataset;
      if (!itemId) return;
      const comment = this.data.displayComments.find(item => item._id === itemId);
      if (!comment || comment.deleted || comment.needVerify) return;
      if (!this.likingCommentIds) this.likingCommentIds = new Set();
      const locks = this.likingCommentIds;
      if (locks.has(itemId)) return;
      if (comment.liked) {
        wx.showToast({ title: '已经赞过啦', icon: 'none' });
        return;
      }
      const openid = this.data.openid;
      locks.add(itemId);
      try {
        const added = await likeAdd(itemId, 'comment');
        if (this.data.openid !== openid) return;
        const index = this.data.displayComments.findIndex(item => item._id === itemId);
        if (index >= 0) {
          const current = this.data.displayComments[index];
          this.setData({
            [`displayComments[${index}].liked`]: true,
            ...(added ? { [`displayComments[${index}].like_count`]: (Number(current.like_count) || 0) + 1 } : {}),
          });
        }
        if (!added) wx.showToast({ title: '已经赞过啦', icon: 'none' });
      } catch (error) {
        wx.showToast({ title: '点赞失败，稍后再试', icon: 'none' });
      } finally {
        locks.delete(itemId);
      }
    },

    toCatDetail(e) {
      const catId = e.currentTarget.dataset.cat_id;
      if (catId) wx.navigateTo({ url: `/pages/genealogy/detailCat/detailCat?cat_id=${catId}` });
    },

    toCommentBoard(e) {
      const catId = e.currentTarget.dataset.cat_id;
      if (catId) wx.navigateTo({ url: `/pages/genealogy/commentBoard/commentBoard?cat_id=${catId}` });
    },

    previewPhoto(e) {
      const url = e.currentTarget.dataset.url;
      if (url) wx.previewImage({ urls: [url] });
    },
  },
});
