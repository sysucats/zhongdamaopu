import {
  UserTypes,
  FuncTypes
} from "../../../utils/user";
import tabsDef from "../../../custom-tab-bar/tab";

const userTypes = [{
  val: UserTypes.guest,
  name: "游客"
}, {
  val: UserTypes.invited,
  name: "特邀用户"
}, {
  val: UserTypes.manager,
  name: "管理员"
}];

const funcTypes = [{
  val: FuncTypes.uploadPhoto,
  name: "上传照片"
}, {
  val: FuncTypes.comment,
  name: "便利贴墙"
}, {
  val: FuncTypes.reward,
  name: "打赏投喂"
}, {
  val: FuncTypes.feedback,
  name: "反馈"
}, {
  val: FuncTypes.fullTab,
  name: "完整TabBar"
}];

function getTabBarTypes() {
  let res = [];
  for (const key in tabsDef) {
    res.push({
      val: key,
      name: tabsDef[key].text
    })
  }
  return res;
}
const tabBarTypes = getTabBarTypes();

module.exports = {
  accessCtrl: {
    tip: "对不同人群进行访问控制",
    ctrlVersion: {
      type: "text",
      tip: "受限版本（“*”表示全部版本，或输入具体版本号）",
      default: "*"
    },
    ctrlUser: {
      type: "multi-select",
      tip: "受限人群",
      default: "guest",
      choices: userTypes
    },
    limitedFunc: {
      type: "multi-select",
      tip: "受限功能（受限人群+版本时，无法使用）",
      default: "uploadPhoto,comment,reward,feedback,fullTab",
      choices: funcTypes
    },
    disabledFunc: {
      type: "multi-select",
      tip: "完全禁用功能（任何版本、任何人都无法使用）",
      default: "",
      choices: funcTypes
    },
  },
  tabBarCtrl: {
    tip: "底部TabBar控制",
    ctrlTab: {
      type: "multi-select",
      tip: "受限TabBar（对受限人群隐藏哪些tab）",
      default: "news",
      choices: tabBarTypes
    },
    fullTab: {
      type: "multi-select",
      tip: "完整的底部TabBar，勾选顺序将影响展示顺序。",
      default: "genealogy,recognize,news,leaderboard,info",
      choices: tabBarTypes,
      order: true,
    },
  },
  detailCat: {
    tip: "猫猫详情页设置",
    albumStep: {
      type: "number",
      tip: "每次相册加载的照片数"
    },
    galleryCompressed: {
      type: "number",
      tip: "1表示展开相册时展示的是压缩图；0表示展示水印图"
    },
    galleryPreload: {
      type: "number",
      tip: "相册预加载的照片数"
    },
    photoStep: {
      type: "number",
      tip: "每次精选照片加载的照片数"
    },
  },
  genealogy: {
    tip: "首页设置",
    adStep: {
      type: "number",
      tip: "每几个猫猫展示一个广告"
    },
    catsStep: {
      type: "number",
      tip: "每次加载几只猫猫"
    },
    main_lower_threshold: {
      type: "number",
      tip: "触底加载的像素值"
    },
    photoPopWeight: {
      type: "number",
      tip: "每张猫猫照片增加的人气值"
    },
  },
  subscribe: {
    tip: "订阅消息模板",
    "verify#ID": {
      type: "text",
      tip: "审核结果通知-模板ID",
      default: "your_template_id"
    },
    "verify#title": {
      type: "text",
      tip: "审核结果通知-标题字段",
      default: "thing2"
    },
    "verify#content": {
      type: "text",
      tip: "审核结果通知-内容字段",
      default: "thing7"
    },
    "verify#note": {
      type: "text",
      tip: "审核结果通知-备注字段",
      default: "thing5"
    },
    "notifyVerify#ID": {
      type: "text",
      tip: "提醒管理审核-模版ID",
      default: "your_template_id"
    },
    "notifyVerify#title": {
      type: "text",
      tip: "提醒管理审核-标题字段",
      default: "thing2"
    },
    "notifyVerify#number": {
      type: "text",
      tip: "提醒管理审核-数量字段",
      default: "number5"
    },
    "notifyVerify#time": {
      type: "text",
      tip: "提醒管理审核-时间字段",
      default: "time6"
    },
    "notifyChkFeedback#ID": {
      type: "text",
      tip: "提醒管理查看反馈-模板ID",
      default: "your_template_id"
    },
    "notifyChkFeedback#title": {
      type: "text",
      tip: "提醒管理查看反馈-标题字段",
      default: "thing2"
    },
    "notifyChkFeedback#number": {
      type: "text",
      tip: "提醒管理查看反馈-数量字段",
      default: "number5"
    },
    "notifyChkFeedback#time": {
      type: "text",
      tip: "提醒管理查看反馈-时间字段",
      default: "time3"
    },
    "feedback#ID": {
      type: "text",
      tip: "反馈结果通知-模板ID",
      default: "your_template_id"
    },
    "feedback#title": {
      type: "text",
      tip: "反馈结果通知-标题字段",
      default: "thing3"
    },
    "feedback#content": {
      type: "text",
      tip: "反馈结果通知-内容字段",
      default: "thing5"
    },
    "feedback#time": {
      type: "text",
      tip: "反馈结果通知-时间字段",
      default: "date4"
    }
  },
  ads: {
    tip: "广告设置",
    "genealogy_banner": {
      type: "text",
      tip: "首页banner广告ID",
      default: "your_ad_id"
    },
    "recognize_banner": {
      type: "text",
      tip: "识猫页banner广告ID",
      default: "your_ad_id"
    },
    "reward_video": {
      type: "text",
      tip: "打赏投喂页激励广告ID",
      default: "your_ad_id"
    },
    "badge_video": {
      type: "text",
      tip: "获取代币页激励广告ID",
      default: "your_ad_id"
    },
    "badge_interstitial": {
      type: "text",
      tip: "获取代币页插屏广告ID",
      default: "your_ad_id"
    },
  },
  recognize: {
    tip: "识猫页设置",
    interfaceURL: {
      type: "text",
      tip: "识猫接口地址链接",
      default: "https://your.domain.com/recognizeCatPhoto_test"
    },
    secretKey: {
      type: "text",
      tip: "识猫接口秘钥",
      default: "key"
    },
  },
  recognize_test: {
    tip: "识猫页（开发接口）设置",
    interfaceURL: {
      type: "text",
      tip: "识猫开发接口地址链接",
      default: "https://your.domain.com/recognizeCatPhoto"
    },
    secretKey: {
      type: "text",
      tip: "识猫开发接口秘钥",
      default: "key"
    },
  }
}