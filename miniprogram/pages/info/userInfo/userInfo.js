import { getUser } from "../../../utils/user";
import { deepcopy } from "../../../utils/utils";
import { getUnlockedList, getShowcase, setShowcase } from "../../../utils/achievement";
import config from "../../../config";
import api from "../../../utils/cloudApi";

const app = getApp();
const defaultAvatarUrl = "/pages/public/images/info/default_avatar.png"
// 分享的标语
const share_text = config.text.app_name + ' - ' + config.text.genealogy.share_tip;

Page({
  data: {
    defaultAvatarUrl: defaultAvatarUrl,
    user: null,
    showEdit: false,

    // 成就展示位
    showcase: [],
    showAchvPicker: false,
    unlockedAchv: [],
    pickerSelected: [],

    // 一些菜单选项
    menu: [
      {
        type: 'option',
        items: [
          {
            label:"邀请好友",
            icon:"icon-friends-o",
            action:"shareApp",
            btnAble: true,
            btnType: "share",
          }, {
            label:"我关注的猫猫",
            icon:"icon-star-o",
            action:"/pages/info/myFollowCats/myFollowCats",
            btnAble: false,
          }, {
            label:"我的足迹",
            img:"/pages/public/images/info/btn/paw_print.png",
            action:"/pages/info/myFootprint/myFootprint",
            btnAble: false,
          }, {
            label:"我的领养",
            img:"/pages/public/images/info/btn/cat_head.png",
            action:"/pages/info/myAdoption/myAdoption",
            btnAble: false,
          }, {
            label:"信息反馈",
            icon:"icon-chat-o",
            action:"/pages/info/feedback/feedback",
            btnAble: false,
          },
        ]
      },{
        type: 'tool',
        items: [
          {
            label:"清除缓存",
            icon:"icon-cross",
            action:"clearCache",
            btnAble: false,
          }
        ]
      }
    ],
  },
  handleContact (e) {
    console.log(e)
  },
  clickbtn(e) {
    const to = e.currentTarget.dataset.to;
    if (this[to] && typeof this[to] === 'function') {
      this[to]();
    }
    if (to == "clearCache") {
      // 清理缓存
      return this.clearCache();
    }
    wx.navigateTo({
      url: to,
    });
  },
  
  // 编辑个人信息弹窗
  editProfile: function() {
    if (!this.data.user) {
      this.setData({
        showEdit: true,
      });
    } else {
      this.setData({
        showEdit: !this.data.showEdit,
      });
    }
  },
  closeEdit: function() {
    if (this.data.user) {
      this.setData({
        showEdit: false,
      });
    }
  },

  onShareAppMessage: function () {
    return {
      title: share_text,
      path: "/pages/genealogy/genealogy",
      imageUrl: "",
    };
  },
  
  clearCache() {
    wx.clearStorageSync();
    wx.showToast({
      title: '清理完成',
    })
  },
  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad() {
    await this.loadUser();
    
    // 获取用户数据
    const openid = this.data.user.openid;
    const result = await api.getUserStats({ openid });
    this.setData({
      numUserComments: result.numUserComments,
      numUserLiked: result.numUserLiked,
      numUserPhotos: result.numUserPhotos,
      numCats: result.numCats,
    });

    // 监听用户信息更新事件
    this.boundLoadUser = this.loadUser.bind(this);
    app.globalData.eventBus.$on('userInfoUpdated', this.boundLoadUser);

    // 加载成就展示位
    this.loadShowcase();
  },

  // 加载成就展示位：优先用户自选的3个，否则默认展示最新解锁的3个
  async loadShowcase() {
    try {
      const openid = this.data.user.openid;
      let showcase = await getShowcase(openid);
      if (showcase.length === 0) {
        const unlocked = await getUnlockedList();
        showcase = unlocked.slice(-3).reverse();
      }
      this.setData({ showcase });
    } catch (e) {
      console.log('加载成就展示位失败', e);
    }
  },

  // 打开展示位选择器
  async openAchvPicker() {
    const unlocked = await getUnlockedList();
    if (unlocked.length === 0) {
      wx.showToast({ title: '还没有解锁成就，先去互动吧~', icon: 'none' });
      return;
    }
    const curKeys = this.data.showcase.map(s => s.key);
    this.setData({
      showAchvPicker: true,
      unlockedAchv: unlocked,
      pickerSelected: curKeys,
    });
    this._refreshPickerList();
  },

  // 刷新选择器列表的选中标记
  _refreshPickerList() {
    const sel = this.data.pickerSelected;
    const list = this.data.unlockedAchv.map(a => ({ ...a, selected: sel.indexOf(a.key) >= 0 }));
    this.setData({ unlockedAchv: list });
  },

  // 选择/取消一个成就（最多3个）
  toggleAchvPick(e) {
    const key = e.currentTarget.dataset.key;
    let selected = this.data.pickerSelected.slice();
    const idx = selected.indexOf(key);
    if (idx >= 0) {
      selected.splice(idx, 1);
    } else {
      if (selected.length >= 3) {
        wx.showToast({ title: '最多展示3个成就', icon: 'none' });
        return;
      }
      selected.push(key);
    }
    this.setData({ pickerSelected: selected });
    this._refreshPickerList();
  },

  noop() {},

  closeAchvPicker() {
    this.setData({ showAchvPicker: false });
  },

  // 保存展示位
  async saveAchvPicker() {
    const keys = this.data.pickerSelected;
    const ok = await setShowcase(keys);
    if (!ok) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      return;
    }
    this.setData({ showAchvPicker: false });
    await this.loadShowcase();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  onUnload() {
    // 移除用户信息更新事件监听
    app.globalData.eventBus.$off('userInfoUpdated', this.boundLoadUser);
  },

  onShow() {
    // 从成就页返回时刷新展示位
    if (this.data.user) {
      this.loadShowcase();
    }
  },

  async loadUser() {
    var user = await getUser({
      nocache: true,
    });
    user = deepcopy(user);

    if (!user.userInfo) {
      user.userInfo = {};
    }
    
    // 创建角色映射便于管理和自定义
    const roleMapping = {
      visitor: { displayName: "访客", className: "visitor" },     // displayName: "游客"
      manager: { displayName: "管理员", className: "manager" },   // displayName: "管理员"
      pro: { displayName: "特邀用户", className: "pro" }          // displayName: "特邀用户"
    };
    
    let roleKey = 'visitor'; // 默认值
    if (user.manager > 0) {
      roleKey = 'manager';
    } else if (user.role === 1) {
      roleKey = 'pro';
    }
    
    const badgeInfo = roleMapping[roleKey];
    
    this.setData({
      user: user,
      badgeName: badgeInfo.displayName,
      badgeClass: badgeInfo.className,
    });
  },
})