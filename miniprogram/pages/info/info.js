// miniprogram/pages/info/info.js
import { isManagerAsync } from "../../utils/user";
import { text as text_cfg, mpcode_img } from "../../config";
import { showTab } from "../../utils/page";

const share_text = text_cfg.app_name + ' - ' + text_cfg.info.share_tip;

const logo_img = "/pages/public/images/app_logo.png";

import { signCosUrl } from "../../utils/common";

const app = getApp();

Page({
  data: {
    logo_img,
    friendApps: [],
    friendLinkImgLoaded: false,
    text_cfg: text_cfg,

    // 卡片，不需要设计绘制卡片图，只需用放图标即可
    cards: [
      {
        icon: "/pages/public/images/info/btn/user.svg", // 一个示例
        label: "个人主页",
        path: "/pages/info/userInfo/userInfo",
      }, {
        icon: "/pages/public/images/info/btn/badge.svg",
        label: "徽章口袋",
        path: "/pages/packageA/pages/info/badge/badge",
      }, {
        icon: "/pages/public/images/info/btn/team.svg",
        label: "开发团队",
        path: "/pages/info/devTeam/devTeam",
      }, {
        icon: "/pages/public/images/info/btn/reward.svg",
        label: "投喂罐头",
        path: "/pages/info/reward/reward",
      }
    ],

    nums: {},  // 菜单栏的各个数量
    // 菜单栏是否显示的条件
    showCond: {
      tools: true,
      dev: false,
      manager: false,
    },
    // 菜单列表
    menuList: [
      {
        title: "开发者工具（手机端不显示）",
        show: "dev",
        items: [
          {
            name: "部署指引",
            path: "/pages/debug/deployTip/deployTip",
            icon: "icon-deploy"
          },
          // {
          //   name: "生成秘钥",
          //   path: "/pages/debug/genKeys/genKeys",
          //   icon: "icon-genkey"
          // },
        ],
      }, {
        title: "管理后台",
        show: "manager",
        items: [
          {
            name: "操作手册",
            path: "guide",
            icon: "icon-description",
            dot: "true"
          },
          {
            name: "照片审核",
            path: "/pages/manage/checkPhotos/checkPhotos",
            num: "numChkPhotos",
            icon: "icon-photo-o"
          },
          {
            name: "便利贴审核",
            path: "/pages/manage/checkComment/checkComment",
            num: "numChkComments",
            icon: "icon-smile-comment-o"
          },
          {
            name: "反馈处理",
            path: "/pages/manage/checkFeedbacks/checkFeedbacks",
            num: "numFeedbacks",
            icon: "icon-envelop-o"
          },
          {
            name: "猫抓板公告",
            path: "/pages/news/createNews/createNews",
            icon: "icon-edit"
          },
          {
            name: "校区/区域/花色",
            path: "/pages/manage/filters/filters",
            icon: "icon-location-o"
          },
          {
            name: "猫猫管理",
            path: "/pages/manage/catManage/catManage",
            icon: "icon-cluster-o"
          },
          {
            name: "人员管理",
            path: "/pages/manage/managers/managers",
            icon: "icon-manager-o"
          },
          {
            name: "特邀用户",
            path: "/pages/tools/inviteUser/inviteUser",
            icon: "icon-star-o"
          },
          {
            name: "徽章管理",
            path: "/pages/manage/badgeDef/badgeDef",
            icon: "icon-medel-o"
          },
          {
            name: "页面配置",
            path: "/pages/manage/pageSettings/pageSettings",
            icon: "icon-newspaper-o"
          },
          {
            name: "投喂记录",
            path: "/pages/manage/rewards/rewards",
            icon: "icon-balance-o"
          },
          {
            name: "照片处理",
            path: "/pages/manage/imProcess/imProcess",
            num: "numImProcess",
            icon: "icon-todo-list-o"
          }
        ]
      }
    ],

  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function (options) {
    // 开发模式
    const sysInfo = wx.getSystemInfoSync();
    this.setData({
      "showCond.dev": sysInfo.platform === "devtools"
    });

    const { result: friendLinkRes } = await app.mpServerless.db.collection('setting').findOne({ _id: 'friendLink' });
    
    let { apps } = friendLinkRes;
    for (let i = 0; i < apps.length; i++) {
      apps[i].logo = await signCosUrl(apps[i].logo);
    }
    this.setData({
      friendApps: apps,
    });

    // 设置为特邀用户
    const { query } = wx.getLaunchOptionsSync();
    console.log("query", query);
    if (query.inviteRole) {
      this.doInviteRole(options);
    }
  },

  // 用 onShow 不用 onLoad，为了在返回这个页面时也能重新加载
  onShow: async function () {
    // 切换自定义tab
    showTab(this);

    // 获取version
    this.setData({
      version: getApp().globalData.version
    });

    // 获取普通用户也能看的数据
    // 所有猫猫数量
    const allCatQf = {};
    // 所有照片数量
    const allPhotoQf = { verified: true };
    // 所有便利贴数量
    const allCommentQf = { deleted: { $ne: true }, needVerify: { $ne: true } };
    // 所有领养
    const adoptQf = { adopt: 1 };
    // 所有绝育量
    const sterilizedQf = { sterilized: true };
    // 去除已领养、失踪、去喵星的猫猫
    const currentCatsQf = {
      adopt: { $ne: 1 },
      to_star: { $ne: true },
      missing: { $ne: true }
    };

    const { result: numAllCats } = await app.mpServerless.db.collection('cat').count(allCatQf);
    const { result: numAllPhotos } = await app.mpServerless.db.collection('photo').count(allPhotoQf);
    const { result: numAllComments } = await app.mpServerless.db.collection('comment').count(allCommentQf);
    const { result: numSterilized } = await app.mpServerless.db.collection('cat').count(sterilizedQf);
    const { result: numAdoptQf } = await app.mpServerless.db.collection('cat').count(adoptQf);
    const { result: numCurrentCats } = await app.mpServerless.db.collection('cat').count(currentCatsQf);

    // 计算绝育率
    const adoptRate = (numAdoptQf / numAllCats * 100).toFixed(1);
    const sterilizationRate = (numSterilized / numAllCats * 100).toFixed(1);

    this.setData({
      numAllCats: numAllCats,
      numAllPhotos: numAllPhotos,
      numAllComments: numAllComments,
      sterilizationRate: sterilizationRate + '%',
      adoptRate: adoptRate + '%',
      currentCatsCount: numCurrentCats,
    });

    if (!await isManagerAsync()) {
      return;
    }
    // 待处理照片
    const imProcessQf = { photo_compressed: { $in: [undefined, ''] }, verified: true };
    const { result: numChkPhotos } = await app.mpServerless.db.collection('photo').count({ verified: false });
    const { result: numChkComments } = await app.mpServerless.db.collection('comment').count({ needVerify: true });
    const { result: numFeedbacks } = await app.mpServerless.db.collection('feedback').count({ dealed: false });
    const { result: numImProcess } = await app.mpServerless.db.collection('photo').count(imProcessQf);
    this.setData({
      "nums.numChkPhotos": numChkPhotos,
      "nums.numChkComments": numChkComments,
      "nums.numFeedbacks": numFeedbacks,
      "nums.numImProcess": numImProcess,
      "showCond.manager": true,
    });
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: share_text
    }
  },

  onShareTimeline: function () {
    return {
      title: share_text,
    }
  },

  clickbtn(e) {
    const to = e.currentTarget.dataset.to;
    if (!to) {
      return false;
    }
    const actionMap = {
      clearCache: () => this.clearCache(),
      guide: () => this.guide(e),
      // 可扩展
    };
    const action = actionMap[to];
    if (action) {
      return action();
    }
    wx.navigateTo({
      url: to,
    });
  },

  clickFriendLink(e) {
    const appid = e.currentTarget.dataset.appid;
    wx.navigateToMiniProgram({
      appId: appid
    })
  },

  async showMpCode(e) {
    wx.previewImage({
      urls: [await signCosUrl(mpcode_img)],
      fail: function (e) {
        console.error(e)
      }
    })
  },

  async showLogo(e) {
    wx.previewImage({
      urls: [await signCosUrl(logo_img)],
      fail: function (e) {
        console.error(e)
      }
    })
  },

  // 打开管理员手册tx文档
  guide(e) {
    wx.showModal({
      title: '操作文档请查看github仓库文档链接',
      content: 'laf版文档链接也在仓库md文件中',
      showCancel: true,
    })
    // wx.openEmbeddedMiniProgram({
    //   appId: 'wxd45c635d754dbf59',
    //   path: 'pages/detail/detail?url=https%3A%2F%2Fdocs.qq.com%2Fdoc%2FDSEl0aENOSEx5cmtE',// 此处链接需删除tx文档所复制路径中的.html
    //   envVersion: 'release',
    //   success(res) {
    //     // 打开成功
    //   },
    //   fail: function (e) {
    //     console.log(e)
    //   }
    // })
  },
})