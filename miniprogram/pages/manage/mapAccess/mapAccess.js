import { checkAuth, getUserInfo } from "../../../utils/user";
import api from "../../../utils/cloudApi";
import { isDemoMode } from "../../../utils/demo";

const app = getApp();

Page({
  data: {
    auth: false,
    currentTab: 'users',
    // 用户权限 tab
    users: [],
    searchValue: '',
    pageSkip: 0,
    pageLimit: 10,
    userTotal: 0,
    loading: false,
    // 待审申请 tab
    applications: [],
    appsLoading: false,
  },

  onLoad() {
    this.init();
  },

  async init() {
    const isAuth = await checkAuth(this, 1);
    if (!isAuth) return;
    this.loadUsers();
    this.loadApplications();
  },

  // ========== 用户权限管理 ==========

  async loadUsers() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      let query = {};
      if (this.data.searchValue) {
        query = { 'userInfo.nickName': app.mpServerless.db.RegExp ? null : this.data.searchValue };
      }

      const { result: users } = await app.mpServerless.db.collection('user')
        .where(query)
        .skip(this.data.pageSkip)
        .limit(this.data.pageLimit)
        .get();

      const newUsers = this.data.pageSkip === 0
        ? (users || [])
        : [...this.data.users, ...(users || [])];

      this.setData({
        users: newUsers,
        userTotal: newUsers.length,
        pageSkip: this.data.pageSkip + (users || []).length,
        loading: false,
      });
    } catch (e) {
      console.error('加载用户列表失败:', e);
      this.setData({ loading: false });
    }
  },

  onSearchInput(e) {
    this.setData({ searchValue: e.detail.value });
  },

  doSearch() {
    this.setData({ pageSkip: 0, users: [] });
    this.loadUsers();
  },

  scrollToReload() {
    this.loadUsers();
  },

  async toggleMapAccess(e) {
    const index = e.currentTarget.dataset.index;
    const user = this.data.users[index];
    if (!user) return;

    const newVal = !user.mapAccess;
    // 乐观更新 UI
    this.setData({ [`users[${index}].mapAccess`]: newVal });

    try {
      if (isDemoMode()) {
        return;
      }
      const res = await api.curdOp({
        operation: "update",
        collection: "user",
        item_id: user._id,
        data: { mapAccess: newVal }
      });
      if (!res.ok) {
        this.setData({ [`users[${index}].mapAccess`]: !newVal });
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    } catch (e) {
      console.error('更新失败:', e);
      this.setData({ [`users[${index}].mapAccess`]: !newVal });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // ========== 待审申请管理 ==========

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
  },

  async loadApplications() {
    this.setData({ appsLoading: true });
    try {
      const query = { status: 'pending' };
      const { result: apps } = await app.mpServerless.db.collection('map_access')
        .where(query)
        .orderBy('createDate', 'desc')
        .get();
      this.setData({ applications: apps || [], appsLoading: false });
    } catch (e) {
      console.error('加载申请列表失败:', e);
      this.setData({ appsLoading: false });
    }
  },

  async approveApplication(e) {
    const index = e.currentTarget.dataset.index;
    const application = this.data.applications[index];
    if (!application) return;

    wx.showModal({
      title: '确认通过',
      content: `确定通过「${application.reason?.substring(0, 20)}...」的申请吗？`,
      confirmText: '通过',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return;

        try {
          // 1. 更新申请状态
          await api.curdOp({
            operation: "update",
            collection: "map_access",
            item_id: application._id,
            data: { status: 'approved', reviewDate: api.getDate() }
          });

          // 2. 查找用户并开启 mapAccess
          if (!isDemoMode()) {
            const userRes = await app.mpServerless.db.collection('user')
              .where({ openid: application.openid })
              .get();
            const user = (userRes.result || [])[0];
            if (user) {
              await api.curdOp({
                operation: "update",
                collection: "user",
                item_id: user._id,
                data: { mapAccess: true }
              });
            }
          }

          // 3. 从列表移除
          const apps = [...this.data.applications];
          apps.splice(index, 1);
          this.setData({ applications: apps });
          wx.showToast({ title: '已通过申请', icon: 'success' });
        } catch (e) {
          console.error('审批失败:', e);
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      }
    });
  },

  async rejectApplication(e) {
    const index = e.currentTarget.dataset.index;
    const application = this.data.applications[index];
    if (!application) return;

    wx.showModal({
      title: '确认拒绝',
      content: '确定拒绝该申请吗？',
      confirmText: '拒绝',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.curdOp({
            operation: "update",
            collection: "map_access",
            item_id: application._id,
            data: { status: 'rejected', reviewDate: api.getDate() }
          });
          const apps = [...this.data.applications];
          apps.splice(index, 1);
          this.setData({ applications: apps });
          wx.showToast({ title: '已拒绝申请', icon: 'success' });
        } catch (e) {
          console.error('操作失败:', e);
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      }
    });
  },
});
