module.exports = {
  detailCat: {
    tip: "猫猫详情页设置",
    albumStep: {
      type: "number",
      tip: "每次相册加载的照片数"
    },
    cantUpload: {
      type: "text",
      tip: "无法上传照片的版本号（ALL表示所有版本所有用户都无法上传；*表示所有版本，除特邀用户外无法上传；具体版本号表示仅该版本，除特邀用户外无法上传；管理员无视此项设置，都可以上传）"
    },
    cantComment: {
      type: "text",
      tip: "无法留言的版本号（参考cantUpload配置）",
      default: "#copy-detailCat-cantUpload"
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
  recognize: {
    tip: "识猫页设置",
    interfaceURL: {
      type: "text",
      tip: "识猫接口地址链接"
    },
    secretKey: {
      type: "text",
      tip: "识猫接口秘钥"
    },
  },
  recognize_test: {
    tip: "识猫页（开发接口）设置",
    interfaceURL: {
      type: "text",
      tip: "识猫开发接口地址链接"
    },
    secretKey: {
      type: "text",
      tip: "识猫开发接口秘钥"
    },
  },
  tabBar: {
    tip: "底部TabBar设置",
    fullTab: {
      type: "text",
      tip: "完整的底部TabBar。形如“xxx,yyy,zzz”，用英文逗号将页面的key进行连接，可以隐藏部分tab。具体的key值需要与app.json中的tabBar.list对应。",
      default: "genealogy,recognize,news,leaderboard,info"
    },
    minTab: {
      type: "text",
      tip: "普通用户看到的底部TabBar。配置方式参考fullTab。",
      default: "genealogy,leaderboard,info"
    },
    minVersion: {
      type: "text",
      tip: "展示最小化底部Tab的版本。配置方式参考cantUpload。",
      default: "#copy-detailCat-cantUpload"
    }
  }
}