module.exports = {
  // 科普页图片
  science_imgs: [
    "cloud://rel-eeeccf.7265-rel-eeeccf/系统/1.png",
    "cloud://rel-eeeccf.7265-rel-eeeccf/系统/2.png",
    "cloud://rel-eeeccf.7265-rel-eeeccf/系统/3.png",
    "cloud://rel-eeeccf.7265-rel-eeeccf/系统/4.png",
    "cloud://rel-eeeccf.7265-rel-eeeccf/系统/5.png"
  ],
  // 赞赏码图片
  reward_img: "cloud://rel-eeeccf.7265-rel-eeeccf-1258586139/系统/reward.jpg",
  // 新猫问卷图片
  feedback_wj_img: "cloud://rel-eeeccf.7265-rel-eeeccf-1258586139/系统/新猫问卷.png",
  // 小程序菊花码图片
  mpcode_img: "cloud://rel-eeeccf.7265-rel-eeeccf-1258586139/系统/菊花码.jpg",

  // 首页banner广告
  ad_genealogy_banner: "adunit-9a7dcb84fe2c4db1",
  // 识猫banner广告
  ad_recognize_banner: "adunit-1b69cda0d1b8c703",
  // 打赏video广告
  ad_reward_video: "adunit-eac4513e7b770f93",

  // 猫猫领养状态字符串，对应数据库cat.adopt中的数字下标
  cat_status_adopt: ["未领养", "已领养", "寻找领养中"],
  // 首页漂浮的领养Logo对应的状态
  cat_status_adopt_target: "寻找领养中",

  // 订阅消息的统一配置（只修改引号内的）
  msg: {
    //审核结果通知模板
    verify: {
      id: 'AtntuAUGnzoBumjfmGB8Yyc-67FUxRH5Cw7bnEYFCXo',
      map: {
        title: "thing2", // 标题
        content: "thing7", // 内容
        note: "thing5", // 备注
      }
    },
    // 提醒审核模版
    notifyVerify: {
      id: 'jxcvND-iLSQZLZhlHD2A91gY0tLSfzyYc3bl39bxVuk',
      map: {
        title: "thing2",
        number: "number5",
        time: "time6",
      }
    },
    // 提醒查看反馈模板
    notifyChkFeedback: {
      id: 'jxcvND-iLSQZLZhlHD2A97jP3fm_FWV4wL_GFUcLxcQ',
      map: {
        title: "thing2",
        number: "number5",
        time: "time3",
      }
    },
    // 反馈回复结果模板
    feedback: {
      id: 'IeKS7nPSsBy62REOKiDC2zuz_M7RbKwR97ZiIy_ocmw',
      map: {
        title: "thing3", // 标题
        content: "thing5", // 内容
        time: "date4", // 时间
      }
    },
  }
}