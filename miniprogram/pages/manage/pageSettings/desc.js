module.exports = {
  detailCat: {
    tip: "猫猫详情页设置",
    albumStep: {
      type: "int",
      tip: "每次相册加载的照片数"
    },
    cantComment: {
      type: "string",
      tip: "无法留言的版本号（*表示全部版本）"
    },
    cantUpload: {
      type: "string",
      tip: "无法上传照片的版本号（*表示全部版本）"
    },
    galleryCompressed: {
      type: "bool",
      tip: "展开相册时展示的是压缩图，而非水印图"
    },
    galleryPreload: {
      type: "int",
      tip: "相册预加载的照片数"
    },
    manageUpload: {
      type: "bool",
      tip: "管理员是否可以上传"
    },
    photoStep: {
      type: "int",
      tip: "每次精选照片加载的照片数"
    },
  },
  genealogy: {
    tip: "首页设置",
    adStep: {
      type: "int",
      tip: "每几个猫猫展示一个广告"
    },
    catsStep: {
      type: "int",
      tip: "每次加载几只猫猫"
    },
    main_lower_threshold: {
      type: "int",
      tip: "触底加载的像素值"
    },
    photoPopWeight: {
      type: "int",
      tip: "每张猫猫照片增加的人气值"
    },
  },
  recognize: {
    tip: "识猫页设置",
    interfaceURL: {
      type: "string",
      tip: "识猫接口地址链接"
    },
    secretKey: {
      type: "string",
      tip: "识猫接口秘钥"
    },
  },
  recognize_test: {
    tip: "识猫页（开发接口）设置",
    interfaceURL: {
      type: "string",
      tip: "识猫开发接口地址链接"
    },
    secretKey: {
      type: "string",
      tip: "识猫开发接口秘钥"
    },
  }
}