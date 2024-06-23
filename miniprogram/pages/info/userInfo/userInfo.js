import { getUser } from "../../../utils/user";
import { deepcopy } from "../../../utils/utils";
import config from "../../../config";
import { cloud } from "../../../utils/cloudAccess";
import api from "../../../utils/cloudApi";

const defaultAvatarUrl = "/pages/public/images/info/default_avatar.png"
// 分享的标语
const share_text = config.text.app_name + ' - ' + config.text.genealogy.share_tip;

Page({
  data: {
    defaultAvatarUrl: defaultAvatarUrl,
    user: null,
    showEdit: false,

    // 一些菜单选项
    menu: [
      {
        type: 'option',
        items: [
          {
            label:"修改个人信息",
            icon:"icon-edit",
            action:"editProfile",
            btnAble: false,
          }, {
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
  // 保存后触发更新 toDo 昵称更新了，头像403
  onUserInfoUpdated(event) {
    const { user } = event.detail;
    this.setData({ user });
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
    const {result}  = await api.getUserStats({ openid });
    this.setData({
      numUserComments: result.numUserComments,
      numUserLiked: result.numUserLiked,
      numUserPhotos: result.numUserPhotos
    });
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
    const roleMapping = {                                         // 自定义部分：（感觉可以写入config.js，但就这几个不知道是否有必要）
      visitor: { displayName: "VISITOR", className: "visitor" },  // displayName: "游客"
      manager: { displayName: "MANAGER", className: "manager" },  // displayName: "管理员"
      pro: { displayName: "PRO", className: "pro" }               // displayName: "特邀用户"
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