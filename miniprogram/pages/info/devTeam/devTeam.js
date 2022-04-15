// miniprogram/pages/info/devTeam/devTeam.js
const config = require('../../../config.js');
const text_cfg = config.text;
const share_text = text_cfg.app_name + ' - ' + text_cfg.info.share_tip;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    text_cfg: text_cfg,
    github_link: "https://github.com/sysucats/zhongdamaopu",
    update_log: [{
      version: "v1.7.9",
      content: [
        "处理照片压缩和水印图问题",
      ],
      time: "2021/04/05"
    }, {
      version: "v1.7.8",
      content: [
        "处理.HECI图像显示问题",
      ],
      time: "2021/04/01"
    }, {
      version: "v1.7.7",
      content: [
        "修复二维码跳转问题",
        "修复cat._no可能冲突问题",
      ],
      time: "2021/03/30"
    }, {
      version: "v1.7.6",
      content: [
        "修复识猫页显示错误",
      ],
      time: "2021/03/23"
    }, {
      version: "v1.7.5",
      content: [
        "修复留言板按钮",
      ],
      time: "2021/03/02"
    }, {
      version: "v1.7.4",
      content: [
        "增加部署指引页",
        "整理内部逻辑",
      ],
      time: "2021/03/02"
    }, {
        version: "v1.7.3",
        content: [
          "识猫图片中有多只猫时可以选择主体了",
          "修复并整理消息订阅配置",
          "重新设计猫猫详情的大图页面",
          "识猫结果可以筛选了",
        ],
        time: "2021/02/09"
      }, {
        version: "v1.7.2",
        content: [
          "修复输入框UI问题",
          "首页的新照片提示可以消除啦",
          "照片管理可以只显示精选",
        ],
        time: "2021/01/28"
      },
      {
        version: "v1.7.1",
        content: [
          "修复重复发送留言的问题",
          "增加评论数量外显",
        ],
        time: "2021/01/16"
      },
      {
        version: "v1.7.0",
        content: [
          "新增猫猫留言板",
        ],
        time: "2021/01/15"
      },
      {
        version: "v1.6.8",
        content: [
          "过滤器优化",
        ],
        time: "2021/12/21"
      },
      {
        version: "v1.6.7",
        content: [
          "增加过滤器提示",
          "优化过滤器逻辑",
        ],
        time: "2021/12/12"
      },
      {
        version: "v1.6.6",
        content: [
          "增加领养状态过滤",
        ],
        time: "2021/12/11"
      },
      {
        version: "v1.6.5",
        content: [
          "安卓机可以聊天中识别猫猫啦",
          "过滤器修复",
        ],
        time: "2021/11/24"
      },
      {
        version: "v1.6.4",
        content: [
          "反馈系统改进",
          "其他UI改进和接口升级",
        ],
        time: "2021/11/24"
      },
      {
        version: "v1.6.3",
        content: [
          "人气值与照片数量有关啦",
          "增加看广告打赏方式",
        ],
        time: "2021/11/21"
      },
      {
        version: "v1.6.2",
        content: [
          "识猫功能现在可以框出识别的猫猫了",
        ],
        time: "2021/10/22"
      },
      {
        version: "v1.6.1",
        content: [
          "修复识猫非正方形图片结果不准确的问题",
          "优化猫猫详情页图片预览",
          "其他BUG修复",
        ],
        time: "2021/10/17"
      },
      {
        version: "v1.6.0",
        content: [
          "现在可以拍照识猫啦！",
          "猫猫相册增加排序功能",
          "后台优化",
        ],
        time: "2021/10/16"
      },
      {
        version: "v1.5.5",
        content: [
          "BUG修复",
        ],
        time: "2021/10/11"
      },
      {
        version: "v1.5.4",
        content: [
          "页面优化",
        ],
        time: " 2021/10/7"
      },
      {
        version: "v1.5.3",
        content: [
          "优化部分UI",
          "关闭串门页入口",
        ],
        time: "2021/9/4"
      },
      {
        version: "v1.5.2",
        content: [
          "增加几个串门设置项",
        ],
        time: " 2021/5/31"
      },
      {
        version: "v1.5.1",
        content: [
          "增加串门功能介绍",
          "UI及已知问题修复",
        ],
        time: " 2021/5/28"
      },
      {
        version: "v1.5.0",
        content: [
          "串门功能上线测试！",
        ],
        time: " 2021/5/25"
      },
      {
        version: "v1.4.16",
        content: [
          "适配微信小程序登录接口修改！！！",
          "现在可以通过云函数自动处理图片了",
        ],
        time: " 2021/4/21"
      },
      {
        version: "v1.4.15",
        content: [
          "后台人员管理增加管理员筛选功能",
          "修复打赏记录月份可能重复添加的问题",
        ],
        time: "2021/3/5"
      },
      {
        version: "v1.4.14",
        content: [
          "现在可以搜索猫猫昵称啦",
        ],
        time: " 2021/2/26"
      },
      {
        version: "v1.4.13",
        content: [
          "猫猫信息页照片反序及布局调整",
          "信息反馈增加新猫问卷",
        ],
        time: "2021/1/3"
      },
      {
        version: "v1.4.12",
        content: [
          "统一CSS颜色变量",
        ],
        time: "2020/12/29"
      },
      {
        version: "v1.4.11",
        content: [
          "猫谱、关于页分享至朋友圈功能，欢迎分享宣传！（目前仅Android系统开放测试）",
          "定时反馈处理提醒",
          "修复Android端无法反馈消息的bug",
        ],
        time: "2020/12/06"
      },
      {
        version: "v1.4.10",
        content: [
          "提醒审核功能",
          "后台页面调整",
        ],
        time: "2020/11/29"
      },
      {
        version: "v1.4.9",
        content: [
          "后台人员管理增加搜索功能",
          "猫谱页、猫咪详情页、反馈页、关于页布局调整",
        ],
        time: "2020/11/23"
      },
      {
        version: "v1.4.8",
        content: [
          "修复赞赏记录后台输入限制bug",
        ],
        time: " 2020/11/5"
      },
      {
        version: "v1.4.7",
        content: [
          "增加友情链接",
        ],
        time: "2020/10/27"
      },
      {
        version: "v1.4.6",
        content: [
          "问题修复",
        ],
        time: " 2020/5/27"
      },
      {
        version: "v1.4.5",
        content: [
          "解决上一版本优化筛选器时因兼容暂缓的问题",
          "后台增加打赏记录编辑（疯狂暗示）",
        ],
        time: " 2020/5/19"
      },
      {
        version: "v1.4.4",
        content: [
          "优化筛选器（重建了数据库，头都秃了）",
        ],
        time: " 2020/5/18"
      },
      {
        version: "v1.4.3",
        content: [
          "压缩图打水印",
          "增加展示压缩图的选项（流量太贵了...）",
        ],
        time: "2020/5/3"
      },
      {
        version: "v1.4.2",
        content: [
          "关闭上传原图通道",
          "增加版本更新提示",
        ],
        time: " 2020/4/26"
      },
      {
        version: "v1.4.1",
        content: [
          "优化猫猫详情页图片预览（感谢华农LoLo同学的建议）",
          "优化后台页面",
        ],
        time: " 2020/4/20"
      },
      {
        version: "v1.4.0",
        content: [
          "修复已知问题",
          "适配微信新的小程序通知方式",
          "增加反馈回复通知功能",
        ],
        time: " 2020/4/18"
      },
      {
        version: "v1.3.3",
        content: [
          "更新打赏链接",
          "修改关于页加载方式，使返回页面时能重新加载后台待处理数字",
        ],
        time: " 2020/4/16"
      },
      {
        version: "v1.3.2",
        content: [
          "修复后台反馈日期显示错误的问题",
          "反馈内容可选中，并增加一键复制",
          "更改管理项样式，更加易于理解",
        ],
        time: " 2020/1/24"
      },
      {
        version: "v1.3.1",
        content: [
          "猫猫详情页增加信息反馈",
        ],
        time: " 2019/11/2"
      },
      {
        version: "v1.3.0",
        content: [
          "适配一下PC版",
          "管理员权限分级、管理系统",
        ],
        time: " 2019/9/14"
      },
      {
        version: "v1.2.3",
        content: [
          "首页样式小调整",
          "清理储存空间",
        ],
        time: "2019/9/7"
      },
      {
        version: "v1.2.2",
        content: [
          "首页加一点点广告（给猫猫救助）",
        ],
        time: " 2019/7/30"
      },
      {
        version: "v1.2.1",
        content: [
          "猫猫详情可生成专属小程序码",
          "上传页面的授权按钮修改",
          "一些微小的数据库修改",
        ],
        time: " 2019/7/24"
      },
      {
        version: "v1.2.0",
        content: [
          "首页支持模糊搜索啦",
          "上传照片时可选订阅审核完成通知",
          "重构用户表，整理相关逻辑",
          "修改后台设置格式",
          "优化审核流程",
        ],
        time: " 2019/7/23"
      },
      {
        version: "v1.1.11",
        content: [
          "增加后台设置项",
          "优化页面逻辑",
        ],
        time: " 2019/7/22"
      },
      {
        version: "v1.1.10",
        content: [
          "猫猫分享从首页跳转进入",
          "优化一些交互",
        ],
        time: "2019/6/9"
      },
      {
        version: "v1.1.9",
        content: [
          "优化精选图片数量计算",
          "修复拍照月榜自己的排名",
          "3月打赏公示",
        ],
        time: "2019/6/7"
      },
      {
        version: "v1.1.8",
        content: [
          "小bug修复",
          "增加返回喵星提示（心痛！）",
        ],
        time: " 2019/5/24"
      },
      {
        version: "v1.1.7",
        content: [
          "首页增加名字搜索",
          "过滤器大变样，可以多选了",
          "可以一键传多张照片（感谢芥子的建议）",
        ],
        time: "2019/5/4"
      },
      {
        version: "v1.1.6",
        content: [
          "4月打赏公示",
          "排行榜样式更新、并列排名",
          "猫猫详情里的下拉颜色问题",
          "修复相册的一些小问题",
          "未知性别不显示",
          "去掉流量提醒",
        ],
        time: "2019/5/2"
      },
      {
        version: "v1.1.5",
        content: [
          "样式小改动",
          "3月打赏公示",
        ],
        time: "2019/4/3"
      },
      {
        version: "v1.1.4",
        content: [
          "有新照片的猫会排序靠前，并带有明显标志",
          "处理重复刷人气值的问题",
          "加快首页照片加载速度",
        ],
        time: " 2019/3/23"
      },
      {
        version: "v1.1.3",
        content: [
          "增加缩略图，缩短首页、相册的加载耗时",
          "预处理水印图，绕开某些安卓闪退问题",
          "首页猫猫在一定范围内打乱顺序展示",
        ],
        time: " 2019/3/20"
      },
      {
        version: "v1.1.2",
        content: [
          "优化首页图片加载",
          "优化上传图片功能，可以同时选多张图啦",
        ],
        time: " 2019/3/12"
      },
      {
        version: "v1.1.1",
        content: [
          "科普页图片搬家、增加文字换行",
          "修复分享功能",
        ],
        time: " 2019/3/10"
      },
      {
        version: "v1.1.0",
        content: [
          "关于页改头换面，增加了四个板块",
          "科普页开始施工了",
          "首页的翻页效果改成了滑溜溜的（我投降）",
          "修复首页快速切换bug",
        ],
        time: "2019/3/9"
      },
    ]

  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {

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

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: share_text
    }
  },

  copyOpenSourceLink: function () {
    wx.setClipboardData({
      data: this.data.github_link,
    });
  }
})