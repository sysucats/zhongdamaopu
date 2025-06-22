import { checkAuth } from "../../../../utils/user";
import { levelOrderMap } from "../../../../utils/badge";
import api from "../../../../utils/cloudApi";
import { generateUUID } from "../../../../utils/utils";
import { uploadFile, signCosUrl } from "../../../../utils/common"

const app = getApp();

Page({

  /**
   * 页面的初始数据
   */
  data: {
    levelDefs: Object.keys(levelOrderMap),
    badgeDef: {},
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(event) {
    console.log(event);
    if (await checkAuth(this, 2)) {
      if (event.id) {
        await this.loadBadgeDef(event.id);
      }
    }
  },

  // 加载已有的徽章
  async loadBadgeDef(id) {
    const { result: badgeDef } = await app.mpServerless.db.collection('badge_def').findOne({
      _id: id,
    });
    if (badgeDef.img) {
      badgeDef.img = await signCosUrl(badgeDef.img);
    }
    this.setData({
      badgeDef: badgeDef,
    });
  },

  // 更新信息
  async chooseImage(e) {
    const res = await wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      maxDuration: 30,
    });
    this.setData({
      "badgeDef.img": res.tempFiles[0].tempFilePath,
    })
  },
  onChangeText(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({
      [`badgeDef.${field}`]: value
    });
    return value;
  },
  onLevelChange: function (e) {
    this.setData({
      "badgeDef.level": this.data.levelDefs[e.detail.value],
    })
  },
  // 提交
  async clickUpload() {
    let { badgeDef } = this.data;
    // 检查
    const checkList = {
      'img': '图像',
      'name': '名称',
      'desc': '描述',
      'level': '等级',
    }
    for (const key in checkList) {
      if (!badgeDef[key]) {
        wx.showToast({
          title: `缺少${checkList[key]}`,
          icon: 'error'
        })
        return false;
      }
    }

    // 上传图片到云
    const cloudUrl = await this.uploadAvatar(badgeDef.img);

    // 准备上传的结构
    const uploadItem = {
      img: this.removeURLParams(cloudUrl),
      name: badgeDef.name,
      desc: badgeDef.desc,
      level: badgeDef.level,
      rankDesc: badgeDef.rankDesc,
    }
    // 写入数据库
    if (badgeDef._id) {
      // 是更新
      await api.curdOp({
        operation: "update",
        collection: "badge_def",
        item_id: badgeDef._id,
        data: uploadItem,
      });
    } else {
      const res = await api.curdOp({
        operation: "add",
        collection: "badge_def",
        data: uploadItem
      });
      this.setData({
        "badgeDef._id": res.insertedId,
        "badgeDef.img": await signCosUrl(cloudUrl),
      })
    }

    wx.showToast({
      title: '上传成功',
    })
  },

  async uploadAvatar(tempFilePath) {
    if (!tempFilePath.includes("://tmp")) {
      return tempFilePath;
    }

    //获取后缀
    const index = tempFilePath.lastIndexOf(".");
    const ext = tempFilePath.substr(index + 1);
    // 上传图片
    let upRes = await uploadFile({
      cloudPath: `/badgeDef/${generateUUID()}.${ext}`, // 上传至云端的路径
      filePath: tempFilePath, // 小程序临时文件路径
    });
    return upRes.fileUrl;
  },

  removeURLParams(url) {
    // 检查 URL 是否包含参数
    if (url.indexOf('?') === -1) {
      return url; // 如果没有参数，直接返回原始 URL
    }

    // 获取 URL 中的基础部分
    const baseUrl = url.split('?')[0];

    // 返回基础 URL
    return baseUrl;
  },
})