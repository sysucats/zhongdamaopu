// miniprogram/pages/manage/managers.js
import { checkAuth } from "../../../utils/user";
import { formatDate } from "../../../utils/utils";
import api from "../../../utils/cloudApi";
import { signCosUrl } from "../../../utils/common";
import config from "../../../config";
import { confirmDiscard } from "../../../utils/popup";
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
    role1Only: false,
    mapAccessOnly: false,
    users: [],
    minRequired: config.mapAccessMinRequired,
    manager_types: ['0 非管理员', '1 审核管理', '2 内容管理', '3 公告管理', '99 超级管理'],
    manager_descriptions: ['无管理员权限', '审核照片、删除便利贴', '修改猫猫、校区、关系、徽章', '发布公告', '管理成员、页面设置、处理图片'],
    role_types: ['游客', '特邀用户'],
    showUserEditor: false,
    editingUser: null,
    userDraft: { level: 0, role: 0 },
    userDraftDirty: false,
    savingUser: false,
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
      this.loadApplications();
    }
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
    await this.signUserAvatars(userRes);
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

  async signUserAvatars(users) {
    for (let i = 0; i < users.length; i++) {
      if (users[i].userInfo?.avatarUrl) {
        users[i].userInfo.avatarUrl = await signCosUrl(users[i].userInfo.avatarUrl);
      }
    }
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
    this.setData({
      managerOnly: filters.indexOf('manager-only') !== -1,
      role1Only: filters.indexOf('role1-only') !== -1,
      mapAccessOnly: filters.indexOf('mapAccess-only') !== -1,
      users: [],
    });
    await this.loadUsers(true);
  },

  // ========== 用户设置更新（管理员等级 + 角色，一次更新） ==========

  openUserEditor(e) {
    const user = this.data.users[e.currentTarget.dataset.index];
    const draft = {
      level: user.manager === 99 ? this.data.manager_types.length - 1 : (user.manager || 0),
      role: user.role || 0,
    };
    this._initialUserDraft = { ...draft };
    this.setData({
      editingUser: {
        _id: user._id,
        name: user.userInfo?.nickName || '匿名用户',
        avatar: user.userInfo?.avatarUrl || '/pages/public/images/info/default_avatar.png',
      },
      userDraft: draft,
      userDraftDirty: false,
      showUserEditor: true,
    });
  },

  changeUserDraft(patch) {
    const draft = { ...this.data.userDraft, ...patch };
    this.setData({
      userDraft: draft,
      userDraftDirty: draft.level !== this._initialUserDraft.level || draft.role !== this._initialUserDraft.role,
    });
  },

  onManagerChange(e) {
    this.changeUserDraft({ level: Number(e.detail.value) });
  },

  onRoleChange(e) {
    this.changeUserDraft({ role: Number(e.currentTarget.dataset.role) });
  },

  async closeUserEditor() {
    if (this.data.savingUser) return;
    if (await confirmDiscard(this, this._initialUserDraft, this.data.userDraft)) {
      this.setData({ showUserEditor: false });
    }
  },

  async updateUserSettings() {
    if (this.data.savingUser || !this.data.userDraftDirty) return;
    const { editingUser, userDraft, manager_types } = this.data;
    const manager = userDraft.level === manager_types.length - 1 ? 99 : userDraft.level;
    const role = userDraft.role;
    this.setData({ savingUser: true });
    try {
      const res = await api.curdOp({
        operation: 'update',
        collection: 'user',
        item_id: editingUser._id,
        data: { manager, role },
      });
      if (res.ok && res.n === 1) {
        const index = this.data.users.findIndex(user => user._id === editingUser._id);
        if (index !== -1) {
          this.setData({
            [`users[${index}].manager`]: manager,
            [`users[${index}].role`]: role,
          });
        }
        this.setData({ showUserEditor: false });
        wx.showToast({ title: '更新成功' });
      } else {
        wx.showToast({ title: '更新失败', icon: 'none' });
      }
    } catch (err) {
      console.error('更新人员设置失败:', err);
      wx.showToast({ title: '更新失败', icon: 'none' });
    } finally {
      this.setData({ savingUser: false });
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
          app.mpServerless.db.collection('photo').count({ _openid: u.openid, verified: true }),
          app.mpServerless.db.collection('comment').count({ user_openid: u.openid, deleted: { $ne: true }, needVerify: { $ne: true } })
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