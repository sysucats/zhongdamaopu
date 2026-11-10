import { confirmDiscard } from "../../../utils/popup";
// 领养申请审核（管理员）
import { checkAuth, fillUserInfo } from "../../../utils/user";
import { getAvatar, getCatItemMulti } from "../../../utils/cat";
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
    loadError: '',
    submitting: false,
    canConfirm: true,
    statusIcon: { pending: 'icon-clock', reviewing: 'icon-edit', approved: 'icon-check', rejected: 'icon-close', cancelled: 'icon-clean' },
    statusDesc: STATUS_DESC,
    // 审核说明编辑弹层
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

  async switchTab(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeTab || this.data.submitting) return;
    if (this.data.showReviewPanel && !await this.closeReview()) return;
    this.setData({ activeTab: key });
    await this.loadList();
  },

  async loadList() {
    const requestId = this._listRequest = (this._listRequest || 0) + 1;
    this.setData({ loading: true, loadError: '' });
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

        const cats = await getCatItemMulti([...new Set(list.map(item => item.cat_id).filter(Boolean))]);
        const catMap = new Map(cats.filter(Boolean).map(cat => [cat._id, cat]));
        // 填充猫咪封面头像（getAvatar 内部已签名并缓存）
        for (const item of list) {
          const cat = catMap.get(item.cat_id);
          item.cat_campus = cat?.campus || '';
          item.cat_area = cat?.area || '';
          try {
            const avatar = await getAvatar(item.cat_id);
            item.cat_avatar = (avatar && (avatar.photo_compressed || avatar.photo_id)) || '/pages/public/images/info/default_avatar.png';
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

        if (requestId !== this._listRequest) return;
        this.setData({ list });
      } else {
        throw new Error(res.msg || '加载失败');
      }
    } catch (err) {
      if (requestId === this._listRequest) this.setData({ loadError: '申请加载失败，请重试。' });
    } finally {
      if (requestId === this._listRequest) this.setData({ loading: false });
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
    if (this.data.submitting) return;
    const { action, index } = e.currentTarget.dataset;
    this.setData({
      showReviewPanel: true,
      reviewAction: action,
      reviewNote: '',
      canConfirm: action !== 'note',
      reviewTarget: this.data.list[index],
    });
  },

  async closeReview() {
    if (this.data.submitting) return false;
    if (!await confirmDiscard(this, '', this.data.reviewNote)) return false;
    this.setData({ showReviewPanel: false, reviewTarget: null });
    return true;
  },

  onNoteInput(e) {
    if (this.data.submitting) return;
    this.setData({ reviewNote: e.detail.value, canConfirm: this.data.reviewAction !== 'note' || !!e.detail.value.trim() });
  },

  async confirmReview() {
    if (this.data.submitting) return;
    const { reviewAction, reviewNote, reviewTarget } = this.data;
    if (!reviewTarget) return;

    // 补充记录：内容必填
    if (reviewAction === 'note' && !reviewNote.trim()) {
      wx.showToast({ title: '请填写记录内容', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      if (reviewAction === 'approve') {
        const modalRes = await wx.showModal({
          title: '确认通过？',
          content: `通过后「${reviewTarget.cat_name}」将被标记为已领养，同猫的其他申请会自动拒绝。`,
        });
        if (!modalRes.confirm) return;
      }
      wx.showLoading({ title: '处理中...', mask: true });
      const request = reviewAction === 'note'
        ? {
            operation: 'addNote',
            adoption_id: reviewTarget._id,
            note: reviewNote.trim(),
          }
        : {
            operation: 'review',
            adoption_id: reviewTarget._id,
            action: reviewAction,
            note: reviewNote.trim(),
          };
      const res = await api.adoptionOp(request);
      wx.showToast({ title: res.msg || (res.result ? '操作成功' : '操作失败'), icon: 'none' });
      if (res.result) {
        this.setData({ showReviewPanel: false, reviewTarget: null });
        await this.loadList();
      }
    } catch (err) {
      console.error('[confirmReview] - 审核失败:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ submitting: false });
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
