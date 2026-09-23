// 领养申请审核（管理员）
import { checkAuth, fillUserInfo } from "../../../utils/user";
import { getAvatar } from "../../../utils/cat";
import api from "../../../utils/cloudApi";
import { formatDate } from "../../../utils/utils";

const STATUS_DESC = {
  pending: '待审核',
  reviewing: '审核中',
  approved: '已通过',
  rejected: '未通过',
  cancelled: '已撤销',
};

const TABS = [
  { key: 'pending', name: '待审核' },
  { key: 'reviewing', name: '审核中' },
  { key: 'approved', name: '已通过' },
  { key: 'rejected', name: '未通过' },
];

Page({
  data: {
    tipText: '需要管理员权限',
    tabs: TABS,
    activeTab: 'pending',
    list: [],
    loading: false,
    statusDesc: STATUS_DESC,
    // 审核面板（内嵌，不用 fixed 弹窗，避免部分模拟器无法输入）
    showReviewPanel: false,
    reviewAction: '',
    reviewNote: '',
    reviewTarget: null,
  },

  async onLoad() {
    if (await checkAuth(this, 1)) {
      await this.loadList();
    }
  },

  async onShow() {
    if (this.data.activeTab) {
      await this.loadList();
    }
  },

  switchTab(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeTab) return;
    this.setData({ activeTab: key, showReviewPanel: false });
    this.loadList();
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const res = await api.adoptionOp({
        operation: 'list',
        status: this.data.activeTab,
      });
      if (res.result) {
        const list = (res.data || []).map(item => ({
          ...item,
          apply_time_formatted: formatDate(item.apply_time, 'yyyy-MM-dd hh:mm'),
          review_time_formatted: item.review_time ? formatDate(item.review_time, 'yyyy-MM-dd hh:mm') : '',
          showTimeline: false,
        }));

        // 填充猫咪封面头像（getAvatar 内部已签名并缓存）
        for (const item of list) {
          try {
            const avatar = await getAvatar(item.cat_id);
            item.cat_avatar = (avatar && avatar.photo_compressed) || '/pages/public/images/info/default_avatar.png';
          } catch (e) {
            item.cat_avatar = '/pages/public/images/info/default_avatar.png';
          }
        }

        // 填充审核人昵称（回溯：所有管理员的审核记录互相可见）
        await fillUserInfo(list, 'reviewer_openid', 'reviewerInfo');

        // 填充流转时间线中操作人的昵称
        const timelineEntries = [];
        for (const item of list) {
          for (const t of (item.timeline || [])) {
            t.time_formatted = t.time ? formatDate(t.time, 'MM-dd hh:mm') : '';
            t.status_desc = STATUS_DESC[t.status] || t.status;
            timelineEntries.push(t);
          }
        }
        await fillUserInfo(timelineEntries, 'operator', 'operatorInfo');

        this.setData({ list, loading: false });
      } else {
        wx.showToast({ title: res.msg || '加载失败', icon: 'none' });
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('[loadList] - 加载领养申请失败:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  toCatDetail(e) {
    const cat_id = e.currentTarget.dataset.cat_id;
    wx.navigateTo({
      url: '/pages/genealogy/detailCat/detailCat?cat_id=' + cat_id,
    });
  },

  // 展开/收起流转记录
  toggleTimeline(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      [`list[${index}].showTimeline`]: !this.data.list[index].showTimeline,
    });
  },

  // 打开审核面板
  openReview(e) {
    const { action, index } = e.currentTarget.dataset;
    this.setData({
      showReviewPanel: true,
      reviewAction: action,
      reviewNote: '',
      reviewTarget: this.data.list[index],
    });
    // 滚动到顶部面板位置
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  closeReview() {
    this.setData({ showReviewPanel: false, reviewTarget: null });
  },

  onNoteInput(e) {
    this.setData({ reviewNote: e.detail.value });
  },

  async confirmReview() {
    const { reviewAction, reviewNote, reviewTarget } = this.data;
    if (!reviewTarget) return;

    if (reviewAction === 'approve') {
      const modalRes = await wx.showModal({
        title: '确认通过？',
        content: `通过后「${reviewTarget.cat_name}」将被标记为已领养，同猫的其他申请会自动拒绝。`,
      });
      if (!modalRes.confirm) return;
    }

    wx.showLoading({ title: '处理中...' });
    try {
      const res = await api.adoptionOp({
        operation: 'review',
        adoption_id: reviewTarget._id,
        action: reviewAction,
        note: reviewNote.trim(),
      });
      wx.hideLoading();
      wx.showToast({ title: res.msg || (res.result ? '操作成功' : '操作失败'), icon: 'none' });
      if (res.result) {
        this.closeReview();
        await this.loadList();
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[confirmReview] - 审核失败:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  // 复制联系方式
  copyContact(e) {
    // 兼容 contact 为数字的情况（setClipboardData 只接受字符串，否则静默失败）
    wx.setClipboardData({
      data: String(e.currentTarget.dataset.contact || ''),
      fail: () => wx.showToast({ title: '复制失败，请长按文字选择复制', icon: 'none' }),
    });
  },
});
