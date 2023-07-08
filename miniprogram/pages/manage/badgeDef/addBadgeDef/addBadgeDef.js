import { checkAuth, fillUserInfo } from "../../../../user";
import { cloud } from "../../../../cloudAccess";
import api from "../../../../cloudApi";
import { generateUUID } from "../../../../utils";

Page({

  /**
   * 页面的初始数据
   */
  data: {
    levelDefs: ['A', 'B', 'C'],
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
    const db = await cloud.databaseAsync();
    const badgeDef = (await db.collection('badge_def').doc(id).get()).data;
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
    const {field} = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({
      [`badgeDef.${field}`]: value 
    });
    return value;
  },
  onLevelChange: function(e) {
    this.setData({
      "badgeDef.level": e.detail.value
    })
  },
  // 提交试试
  async clickUpload() {
    let {badgeDef} = this.data;
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
      img: cloudUrl,
      name: badgeDef.name,
      desc: badgeDef.desc,
      level: badgeDef.level,
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
      await api.curdOp({
        operation: "add",
        collection: "badge_def",
        data: uploadItem
      });
    }

    wx.showToast({
      title: '上传成功',
    })
  },

  async uploadAvatar(tempFilePath) {
    if (! tempFilePath.includes("://tmp")) {
      return tempFilePath;
    }
    
    //获取后缀
    const index = tempFilePath.lastIndexOf(".");
    const ext = tempFilePath.substr(index + 1);
    // 上传图片
    let upRes = await cloud.uploadFile({
      cloudPath: `badgeDef/${generateUUID()}.${ext}`, // 上传至云端的路径
      filePath: tempFilePath, // 小程序临时文件路径
    });
    return upRes.fileID;
  },
})