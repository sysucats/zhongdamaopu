import {
  checkAuth,
  fillUserInfo,
  getUser
} from "../../../utils/user";
import {
  requestNotice,
  sendVerifyCommentNotice,
  getMsgTplId
} from "../../../utils/msg";
import cache from "../../../utils/cache";
import {
  getCatItem
} from "../../../utils/cat";
import {
  formatDate
} from "../../../utils/utils";
import api from "../../../utils/cloudApi";
const app = getApp();
Page({

  /**
   * 页面的初始数据
   */
  data: {
    campus_list: {},
    mode: 'pending',
    pendingCount: 0,
    historyList: [],
    historyLoading: false,
    historyNoMore: false,
    historyError: '',
    historyDeleting: false,
    reviewing: false,
  },

  jsData: {
    notice_list: [],
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
    if (await checkAuth(this, 1)) {
      this.loadComments();
    }
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {
    console.log('[onUnload] - 页面退出');

    // 发送审核消息
    sendVerifyCommentNotice(this.jsData.notice_list);
  },

  async switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.mode || this.data.historyLoading || this.data.historyDeleting || this.data.reviewing) return;
    this.setData({ mode });
    if (mode === 'history') await this.loadHistory(true);
  },

  async onReachBottom() {
    if (this.data.mode === 'history') await this.loadHistory();
  },

  async loadHistory(reset = false) {
    if (this.data.historyLoading || this.data.historyDeleting || (!reset && this.data.historyNoMore)) return;
    const previous = reset ? [] : this.data.historyList;
    this.setData({ historyLoading: true, historyError: '' });
    try {
      // 只展示已通过且未删除的内容。
      const { result: list } = await app.mpServerless.db.collection('comment').find({
        needVerify: { $ne: true }, deleted: { $ne: true },
      }, { sort: { check_time: -1, create_date: -1, _id: -1 }, skip: previous.length, limit: 20 });
      await fillUserInfo(list.filter(item => item.user_openid), 'user_openid', 'userInfo');
      await fillUserInfo(list.filter(item => item.manager_openid), 'manager_openid', 'managerInfo');
      for (const item of list) {
        item.checkedAt = item.check_time ? formatDate(new Date(item.check_time), 'yyyy-MM-dd hh:mm:ss') : '审核时间未记录';
        try { item.cat = await getCatItem(item.cat_id) || {}; }
        catch (error) { item.cat = {}; }
      }
      this.setData({ historyList: previous.concat(list), historyNoMore: list.length < 20 });
    } catch (error) {
      this.setData({ historyError: '审核记录加载失败，请重试。' });
    } finally {
      this.setData({ historyLoading: false });
    }
  },

  retryHistory() { return this.loadHistory(this.data.historyList.length === 0); },

  async deleteHistoryComment(e) {
    if (this.data.historyDeleting || this.data.historyLoading) return;
    const id = e.currentTarget.dataset.id;
    if (!this.data.historyList.some(item => item._id === id)) return;
    this.setData({ historyDeleting: true });
    try {
      const { confirm } = await wx.showModal({
        title: '删除便利贴？', content: '删除后将不再展示这条便利贴。', confirmText: '删除',
      });
      if (!confirm) return;
      wx.showLoading({ title: '删除中...' });
      const result = await api.curdOp({ operation: 'update', collection: 'comment', item_id: id,
        data: { deleted: true } });
      if (!result || result.ok === false || result.matchedCount === 0 || result.n === 0) throw new Error('删除保存失败');
      this.setData({ historyList: this.data.historyList.filter(item => item._id !== id) });
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: '删除失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ historyDeleting: false });
    }
  },

  async loadComments() {
    // 常用的对象
    var comments = [];
    var { result } = await app.mpServerless.db.collection('comment').find({
      needVerify: { $eq: true },
      deleted: { $ne: true }
    }, {
      sort: {
        create_date: -1
      }
    })
    console.log(result);

    // 填充userInfo
    await fillUserInfo(result, "user_openid", "userInfo");
    for (var item of result) {
      item.datetime = formatDate(new Date(item.create_date), "yyyy-MM-dd hh:mm:ss")
      comments.push(item);
    }

    // 填充猫猫信息
    var campus_list = {};
    var memory_cache = {};
    for (var c of comments) {
      if (memory_cache[c.cat_id]) {
        c.cat = memory_cache[c.cat_id];
      } else {
        c.cat = await getCatItem(c.cat_id);
        memory_cache[c.cat_id] = c.cat;
      }

      // 分类记录到campus里
      c.cat = c.cat || {};
      var campus = c.cat.campus || '未知校区';
      if (!campus_list[campus]) {
        campus_list[campus] = [];
      }
      campus_list[campus].push(c);
    }

    // 恢复最后一次审批的校区
    var cache_active_campus = cache.getCacheItem("checkPhotoCampus");
    if (!cache_active_campus || !campus_list[cache_active_campus]) {
      cache_active_campus = undefined
    }

    this.setData({
      campus_list: campus_list,
      active_campus: cache_active_campus,
      pendingCount: comments.length,
    })
  },

  bindClickCampus(e) {
    if (this.data.reviewing) return;
    var campus = e.currentTarget.dataset.key;
    var active_campus = this.data.active_campus;
    // console.log(campus);

    if (active_campus == campus) {
      return;
    }

    this.setData({
      active_campus: campus
    });
  },

  // 标记审核
  bindMark(e) {
    if (this.data.reviewing) return;
    const index = e.currentTarget.dataset.index;
    var mark_type = e.currentTarget.dataset.type;
    var active_campus = this.data.active_campus;
    var comments = this.data.campus_list[active_campus];

    if (comments[index].mark == mark_type) {
      mark_type = ""; // 反选
    }
    this.setData({
      [`campus_list.${active_campus}[${index}].mark`]: mark_type
    });
  },

  openBigPhoto(e) {
    let pid = e.currentTarget.dataset.pid;
    // EMAS 外链可能含中文目录，previewImage 要求 URL 先编码
    try { pid = encodeURI(decodeURI(pid)); } catch (err) { pid = encodeURI(pid); }
    wx.previewImage({
      urls: [pid]
    });
  },

  // 点击所属猫猫名称，可以跳转到猫猫详情
  toCatDetail(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    wx.navigateTo({
      url: '/pages/genealogy/detailCat/detailCat?cat_id=' + cat_id,
    })
  },

  // 确定处理
  async bindCheckMulti(e) {
    if (this.data.reviewing) return;
    var active_campus = this.data.active_campus;
    var comments = (this.data.campus_list[active_campus] || []).map(comment => ({ ...comment }));
    var nums = {},
      total_num = 0;
    if (comments.length === 0) {
      wx.showToast({
        title: '无审核内容',
      });
      return;
    }

    for (const comment of comments) {
      if (!comment.mark || comment.mark == "") {
        continue;
      }
      if (!(comment.mark in nums)) {
        nums[comment.mark] = 0;
      }
      nums[comment.mark]++;
      total_num++;
    }

    if (total_num == 0) {
      return false;
    }

    this.setData({ reviewing: true });
    try {
      const modalRes = await wx.showModal({
        title: '确定批量审核？',
        content: `删除${nums['delete'] || 0}条，通过${nums['pass'] || 0}条`,
      });
      if (modalRes.confirm) await this.doCheckMulti(active_campus, comments);
      cache.setCacheItem("checkPhotoCampus", active_campus, cache.cacheTime.checkPhotoCampus);
    } finally {
      this.setData({ reviewing: false });
    }
  },

  // 开始批量处理
  async doCheckMulti(campus, comments) {
    wx.showLoading({ title: '处理中...', mask: true });
    try {
      const user = await getUser();
      if (!user?.openid) throw new Error('登录状态无效');
      const marked = comments.filter(item => item.mark === 'pass' || item.mark === 'delete');
      const results = await Promise.allSettled(marked.map(async comment => {
        const result = await api.curdOp({ operation: 'update', collection: 'comment', item_id: comment._id,
          data: { needVerify: false, ...(comment.mark === 'delete' ? { deleted: true } : {}),
            check_time: new Date(), review_action: comment.mark, manager_openid: user.openid } });
        if (!result || result.ok === false || result.matchedCount === 0 || result.n === 0) throw new Error('审核保存失败');
        this.addNotice(comment, comment.mark === 'pass');
        return comment._id;
      }));
      const completed = new Set(results.filter(item => item.status === 'fulfilled').map(item => item.value));
      this.setData({ [`campus_list.${campus}`]: comments.filter(item => !completed.has(item._id)),
        pendingCount: Math.max(0, this.data.pendingCount - completed.size) });
      wx.showToast({ title: completed.size === marked.length ? '审核完成' : '部分失败，请重试', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: '审核失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 添加一条通知记录，等页面退出的时候统一发送通知
  addNotice(comment, accepted) {
    const openid = comment.user_openid;
    let { notice_list } = this.jsData;
    if (!notice_list[openid]) {
      notice_list[openid] = {
        accepted: 0,
        deleted: 0,
      }
    }
    if (accepted) {
      notice_list[openid].accepted++;
    } else {
      notice_list[openid].deleted++;
    }
  },

  // 管理员点击订阅
  async requestSubscribeMessage() {
    const notifyVerifyTplId = getMsgTplId("notifyVerify");
    wx.getSetting({
      withSubscriptions: true,
      success: res => {
        console.log("[requestSubscribeMessage] - subscribeSet:", res);
        if ('subscriptionsSetting' in res) {
          if (!(notifyVerifyTplId in res['subscriptionsSetting'])) {
            // 第一次申请或只点了取消，未永久拒绝也未允许
            requestNotice('notifyVerify');
            // console.log("firstRequest");
          } else if (res.subscriptionsSetting[notifyVerifyTplId] === 'reject') {
            // console.log("已拒绝");// 不再请求/重复弹出toast
          } else if (res.subscriptionsSetting[notifyVerifyTplId] === 'accept') {
            console.log('[requestSubscribeMessage] - 重新请求下个一次性订阅');
            requestNotice('notifyVerify');
          }
        }
      }
    })
  },

})
