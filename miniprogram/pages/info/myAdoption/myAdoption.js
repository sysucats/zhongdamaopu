// 我的领养申请（含状态跟踪时间线）
import api from "../../../utils/cloudApi";
import { formatDate } from "../../../utils/utils";

const STATUS_DESC = {
  pending: '待审核',
  reviewing: '审核中',
  approved: '已通过',
  rejected: '未通过',
  cancelled: '已撤销',
};

const STATUS_CLASS = {
  pending: 'status-pending',
  reviewing: 'status-pending',
  approved: 'status-approved',
  rejected: 'status-rejected',
  cancelled: 'status-cancelled',
};

Page({
  data: {
    list: [],
    loading: true,
    statusDesc: STATUS_DESC,
    statusClass: STATUS_CLASS,
  },

  async onShow() {
    await this.loadList();
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const res = await api.adoptionOp({ operation: 'listMine' });
      if (res.result) {
        const list = (res.data || []).map(item => ({
          ...item,
          apply_time_formatted: formatDate(item.apply_time, 'yyyy-MM-dd hh:mm'),
          timeline: (item.timeline || []).map(t => ({
            ...t,
            time_formatted: formatDate(t.time, 'yyyy-MM-dd hh:mm'),
            status_desc: STATUS_DESC[t.status] || t.status,
          })),
        }));
        this.setData({ list, loading: false });
      } else {
        wx.showToast({ title: res.msg || '加载失败', icon: 'none' });
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('[loadList] - 加载我的领养申请失败:', err);
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

  async cancelApply(e) {
    const { id, index } = e.currentTarget.dataset;
    const modalRes = await wx.showModal({
      title: '撤销申请',
      content: '确定要撤销这条领养申请吗？',
    });
    if (!modalRes.confirm) return;

    wx.showLoading({ title: '处理中...' });
    try {
      const res = await api.adoptionOp({ operation: 'cancel', adoption_id: id });
      wx.hideLoading();
      wx.showToast({ title: res.msg || (res.result ? '已撤销' : '操作失败'), icon: 'none' });
      if (res.result) {
        await this.loadList();
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[cancelApply] - 撤销失败:', err);
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },
});
