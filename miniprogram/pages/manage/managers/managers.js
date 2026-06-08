// miniprogram/pages/manage/managers.js
import { checkAuth } from "../../../utils/user";
import { formatDate } from "../../../utils/utils";
import api from "../../../utils/cloudApi";
import { isDemoMode } from "../../../utils/demo";

// 是否正在加载
var loading = false;
const app = getApp();
Page({

  /**
   * 页面的初始数据
   */
  data: {
    tipText: '正在鉴权...',
    tipBtn: false,
    userSearch: '',
    managerOnly: false,
    users: [],
    windowHeight: "300",
    manager_types: ['0-非管理员', '1-审核照片、删除便利贴', '2-修改猫猫、校区、关系、徽章', '3-发布公告', '99-管理成员、页面设置、处理图片'],
    role_types: ['游客', '特邀用户'],
    // Tab
    currentTab: 'users',
    // 地图待审申请
    applications: [],
    appsLoading: false,
    appCount: 0,
  },
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    if (await checkAuth(this, 99)) {
      await this.loadUsers(true);
      this.getHeights();
      this.loadApplications();
    }
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    // 每次切回来刷新待审数量
    if (this.data.auth) {
      this.loadApplications();
    }
  },

  // ========== Tab 切换 ==========

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    if (tab === 'apps') {
      this.loadApplications();
    }
  },

  // ========== 用户列表 ==========

  // 读取用户列表
  loadUsers: async function (reload) {
    if (loading) {
      return false;
    }
    var users = this.data.users;
    loading = true;
    wx.showLoading({
      title: '加载中...',
    });
    var userSearch = this.data.userSearch;
    var query = {};
    if (userSearch) {
      query["userInfo.nickName"] = { $regex: userSearch }
    }
    if (this.data.managerOnly) {
      query["manager"] = { $gt: 0 }
    }
    if (this.data.role1Only) {
      query["role"] = { $gt: 0 }
    }
    if (this.data.mapAccessOnly) {
      query["mapAccess.status"] = "approved"
    }
    console.log("query", query);
    var { result: userRes } = await app.mpServerless.db.collection('user').find(query, { skip: users.length, limit: 10 })
    console.log(userRes);
    wx.hideLoading();
    if (reload) {
      users = userRes;
    } else {
      if (!userRes.length) {
        wx.showToast({
          title: '加载完啦',
          icon: 'none',
        })
        loading = false;
        return;
      }
      users = users.concat(userRes);
    }
    this.setData({
      users: users
    });
    loading = false;
  },

  // 滑到底部来reload
  scrollToReload: async function (e) {
    await this.loadUsers();
  },

  fSearchInput: function (e) {
    const value = e.detail.value;
    this.setData({
      userSearch: value
    });
  },

  // 搜索
  fSearch: async function (e) {
    this.data.users = [];
    await this.loadUsers(true);
  },

  // 筛选条件复选框
  async filterChange(e) {
    let filters = e.detail.value;
    this.data.managerOnly = filters.indexOf('manager-only') != -1;
    this.data.role1Only = filters.indexOf('role1-only') != -1;
    this.data.mapAccessOnly = filters.indexOf('mapAccess-only') != -1;
    this.data.users = [];
    await this.loadUsers(true);
  },

  // 获取一下页面高度，铺满scroll-view
  getHeights() {
    const res = wx.getSystemInfoSync();
    this.setData({
      "windowHeight": res.windowHeight,
    });
  },

  // ========== 用户设置更新（管理员等级 + 角色，一次更新） ==========

  // 管理员等级 picker 变动
  onManagerChange(e) {
    const index = e.currentTarget.dataset.index;
    const value = parseInt(e.detail.value);
    this.setData({
      ["users[" + index + "].manager"]: value
    });
  },

  // 角色 picker 变动
  onRoleChange(e) {
    const index = e.currentTarget.dataset.index;
    const value = parseInt(e.detail.value);
    this.setData({
      ["users[" + index + "].role"]: value
    });
  },

  // 一次性更新管理员等级和角色
  async updateUserSettings(e) {
    const formData = e.detail.value;
    const index = parseInt(formData.index);
    const _id = formData._id;
    var level = parseInt(formData.level);
    var role = parseInt(formData.role);

    if (isNaN(level)) {
      level = null;
    }
    if (level == this.data.manager_types.length - 1) {
      // 最后一个是99管理员
      level = 99;
    }
    if (isNaN(role)) {
      role = null;
    }

    console.log("updateUserSettings #" + index, _id, "manager:", level, "role:", role);

    const res = await api.curdOp({
      operation: "update",
      collection: "user",
      item_id: _id,
      data: {
        manager: level,
        role: role
      }
    })

    console.log("updateUserSettings Result:", res);
    if (res.ok && res.n == 1) {
      wx.showToast({
        title: '更新成功',
      });
      // 同步本地数据
      if (level !== null) {
        this.setData({ ["users[" + index + "].manager"]: level });
      }
      if (role !== null) {
        this.setData({ ["users[" + index + "].role"]: role });
      }
    } else {
      wx.showToast({
        title: '更新失败',
        icon: 'none',
      })
    }
  },

  // ========== 地图权限开关（即时生效） ==========

  async toggleMapAccess(e) {
    const index = e.currentTarget.dataset.index;
    const user = this.data.users[index];
    if (!user) return;

    const currentApproved = user.mapAccess && user.mapAccess.status === 'approved';
    const nextVal = currentApproved
      ? null
      : { status: 'approved', applyReason: '管理员手动开通', applyDate: api.getDate() };

    // 乐观更新 UI
    this.setData({ ["users[" + index + "].mapAccess"]: nextVal });

    if (isDemoMode()) {
      return;
    }

    try {
      const res = await api.curdOp({
        operation: "update",
        collection: "user",
        item_id: user._id,
        data: { mapAccess: nextVal }
      });
      if (!res.ok) {
        // 回滚
        const rollback = currentApproved
          ? { status: 'approved', applyReason: '管理员手动开通', applyDate: api.getDate() }
          : null;
        this.setData({ ["users[" + index + "].mapAccess"]: rollback });
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    } catch (err) {
      console.error('地图权限更新失败:', err);
      const rollback = currentApproved
        ? { status: 'approved', applyReason: '管理员手动开通', applyDate: api.getDate() }
        : null;
      this.setData({ ["users[" + index + "].mapAccess"]: rollback });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // ========== 地图权限待审申请 ==========

  async loadApplications() {
    this.setData({ appsLoading: true });
    try {
      const { result: users } = await app.mpServerless.db.collection('user')
        .find({ 'mapAccess.status': 'pending' }, { sort: { 'mapAccess.applyDate': -1 } });
      const apps = await Promise.all((users || []).map(async u => {
        const [photoRes, commentRes] = await Promise.all([
          app.mpServerless.db.collection('photo').count({ openid: u.openid, verified: true }),
          app.mpServerless.db.collection('comment').count({ openid: u.openid, deleted: { $ne: true }, needVerify: { $ne: true } })
        ]);
        return {
          _id: u._id,
          openid: u.openid,
          userInfo: u.userInfo,
          mapAccess: {
            ...u.mapAccess,
            applyDate: formatDate(u.mapAccess.applyDate, 'yyyy-MM-dd hh:mm:ss')
          },
          photoCount: photoRes.result,
          commentCount: commentRes.result,
        };
      }));
      this.setData({
        applications: apps,
        appCount: apps.length,
        appsLoading: false
      });
    } catch (e) {
      console.error('加载申请列表失败:', e);
      this.setData({ appsLoading: false });
    }
  },

  async approveApplication(e) {
    const index = e.currentTarget.dataset.index;
    const application = this.data.applications[index];
    if (!application) return;

    const reasonPreview = (application.mapAccess.applyReason || '').substring(0, 20);
    wx.showModal({
      title: '确认通过',
      content: '确定通过「' + reasonPreview + '...」的申请吗？',
      confirmText: '通过',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return;

        try {
          await api.curdOp({
            operation: "update",
            collection: "user",
            item_id: application._id,
            data: {
              mapAccess: {
                status: 'approved',
                applyReason: application.mapAccess.applyReason,
                applyDate: application.mapAccess.applyDate,
              }
            }
          });

          const apps = [...this.data.applications];
          apps.splice(index, 1);
          this.setData({
            applications: apps,
            appCount: apps.length
          });
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
            collection: "user",
            item_id: application._id,
            data: { mapAccess: null }
          });
          const apps = [...this.data.applications];
          apps.splice(index, 1);
          this.setData({
            applications: apps,
            appCount: apps.length
          });
          wx.showToast({ title: '已拒绝申请', icon: 'success' });
        } catch (e) {
          console.error('操作失败:', e);
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      }
    });
  },
})