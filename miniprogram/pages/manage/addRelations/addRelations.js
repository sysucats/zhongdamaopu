// 审核照片
const utils = require('../../../utils.js');
const isManager = utils.isManager;
const regReplace = utils.regReplace;

const cat_utils = require('../../../cat.js');
const getAvatar = cat_utils.getAvatar;
const getCatItem = cat_utils.getCatItem;


const config = require('../../../config.js');
const use_wx_cloud = config.use_wx_cloud; // 是否使用微信云，不然使用Laf云
const cloud = require('../../../cloudAccess.js').cloud;

const db = cloud.database();
const _ = db.command;

// 运行状态
var selectRelationTypeIdx = undefined;
var selectRelationCatIdx = undefined;

Page({

  /**
   * 页面的初始数据
   */
  data: {
    cat: {},
    relation_types: [],
    filters_input: "",

    // 控制底部栏是否弹出
    showSearchCat: false,
    showSearchType: false,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.checkAuth();
    var that = this;
    if (options.cat_id) {
      // 输入了cat_id
      db.collection('cat').doc(options.cat_id).get().then(res => {
        var cat = res.data;
        getAvatar(cat._id, cat.photo_count_best).then(avatar => {
          cat.avatar = avatar;
          that.setData({
            cat: cat
          }, () => {
            that.loadRelations();
          });
        });
      })
    } else {
      setTimeout(function() {
        that.bindSearch(null, "cat");
      }, 700);
    }
  },

  // 检查权限
  checkAuth() {
    const that = this;
    isManager(function (res) {
      if (res) {
        that.setData({
          auth: true
        });
        that.loadRelationTypes();
      } else {
        that.setData({
          tipText: '只有管理员Level-2能进入嗷',
          tipBtn: true,
        });
        console.log("Not a manager.");
      }
    }, 2)
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  // 加载setting里的relation types
  async loadRelationTypes() {
    var types = [];
    var data = (await db.collection('setting').where({_id: 'relation'}).get()).data;

    if (data.length == 0) {
      // 当数据库setting中不存在时，进行初始化
      await cloud.callFunction({
        name: "curdOp",
        data: {
          premissionLevel: 1,
          operation: "set",
          collection: "setting",
          item_id: "relation",
          data: {
            types: ["爸爸", "妈妈"]
          }
        }
      });
      data = (await db.collection('setting').where({_id: 'relation'}).get()).data;
    }
    types = data[0].types;
    this.setData({
      relation_types: types,
    });
  },

  // 保存新的关系类型
  async saveNewRelationType(e) {
    console.log(e);
    const t = e.detail.value;
    var types = this.data.relation_types;

    // 判断一下是否已存在
    var idx = types.indexOf(t);
    if (idx == -1) {
      // 不存在
      types.push(t);
      console.log(types);
      await cloud.callFunction({
        name: "curdOp",
        data: {
          premissionLevel: 1,
          operation: "update",
          collection: "setting",
          item_id: "relation",
          data: {
              types: types
          }
        }
      });
      idx = types.length - 1;
    }

    this.selectRelationType(null, idx);

    this.setData({
      relation_name: "",
      relation_types: types,
    });
  },

  selectRelationType(e, idx) {
    if (idx === undefined) {
      idx = e.currentTarget.dataset.index;
    }
    var type =  this.data.relation_types[idx];
    console.log(type);
    this.setData({
      [`cat.relations[${selectRelationTypeIdx}].type`]: type,
      showSearchCat: false,
      showSearchType: false,
    });
  },

  async deleteRelationType(e) {
    var idx = e.currentTarget.dataset.index;
    var types = this.data.relation_types;
    const that = this;
    wx.showModal({
      title: '提示',
      content: `确定删除\"${types[idx]}\"关系？`,
      success(res) {
        if (res.confirm) {
          that.doDeleteRelationType(idx);
        }
      }
    })
  },

  async doDeleteRelationType(idx) {
    var types = this.data.relation_types;
    types.splice(idx, 1);
    await cloud.callFunction({
      name: "curdOp",
      data: {
        premissionLevel: 1,
        operation: "update",
        document: "setting",
        item_id: "relation",
        data: {
            types: types
        }
      }
    });
    this.setData({
      relation_name: "",
      relation_types: types,
    });
  },

  bindSearch(e, type) {
    if (!type) {
      type = e.currentTarget.dataset.type;
    }

    var that = this;
    var fCat, fType;
    if (type == "cat") {
      selectRelationCatIdx = e ? e.currentTarget.dataset.index: undefined;
      fCat = true;
      fType = false;
    } else if (type == "relation") {
      selectRelationTypeIdx = e ? e.currentTarget.dataset.index: undefined;
      fCat = false;
      fType = true;
    } else if (type == "hide") {
      fCat = false;
      fType = false;
    }
    this.setData({
      showSearchCat: fCat,
      showSearchType: fType,
    });
    setTimeout(()=>{
      that.setData({
        focusSearchCat: fCat,
      });
    }, 400);
  },

  // 搜索猫猫
  fSearchInput(e) {
    var value = e.detail.value;
    this.setData({
      filters_input: value
    })
  },

  async doSearchCat() {
    if (!this.data.filters_input) {
      return false;
    }
    wx.showLoading({
      title: '搜索中...',
    })
    var filters = [];
    const filters_input = regReplace(this.data.filters_input);
    if (filters_input.length) {
      var search_str = [];
      for (const n of filters_input.trim().split(' ')) {
        search_str.push(`(.*${n}.*)`);
      }

      let regexp;
      if(use_wx_cloud){
        regexp = db.RegExp({
          regexp: search_str.join("|"),
          options: 'igs',
        });
        console.log("RegExp:", regexp);
      }
      else { // Laf 的 db 不支持 option: p
        regexp = db.RegExp({
          regexp: search_str.join("|"),
          options: 'is',
        });
        console.log("RegExp:", regexp);
      }
      

      filters.push(_.or([{
        name: regexp
      }, {
        nickname: regexp
      }]));
      console.log("Filter:", filters);
    }
    
    // 准备搜索
    var query = filters.length ? _.and(filters) : {};
    console.log("Query:", query);
    var cats = (await db.collection('cat').where(query).get()).data;
    console.log("Cats:", cats);
    // 获取头像
    for (var cat of cats) {
      cat.avatar = await getAvatar(cat._id, cat.photo_count_best);
    }
    this.setData({
      searchCats: cats,
    });
    wx.hideLoading();
  },
  // 选择猫猫
  searchSelectCat(e) {
    var idx = e.currentTarget.dataset.index;
    var cat = this.data.searchCats[idx];
    if (selectRelationCatIdx === undefined) {
      this.data.cat = cat;
      this.setData({
        cat: cat,
        showSearchCat: false,
      });
      this.loadRelations();
      return;
    }

    this.setData({
      [`cat.relations[${selectRelationCatIdx}].cat_id`]: cat._id,
      [`cat.relations[${selectRelationCatIdx}].cat`]: cat,
      showSearchCat: false,
      showSearchType: false,
    });
  },
  // 更新关系列表
  async loadRelations() {
    var cat = this.data.cat;
    var relations = this.data.cat.relations;
    console.log(cat);
    if (!cat._id || !relations) {
      return false;
    }

    for (var relation of relations) {
      if (!relation.cat_id) {
        continue;
      }
      relation.cat = await getCatItem(relation.cat_id)
      relation.cat.avatar = await getAvatar(relation.cat_id, relation.cat.photo_count_best);
    }

    console.log(relations);

    this.setData({
      "cat.relations": relations,
    });
  },
  // 新增一个关系
  addRelation(e) {
    var relations = this.data.cat.relations;
    if (relations === undefined) {
      relations = [];
    }
    relations.push({});
    this.setData({
      "cat.relations": relations
    });
  },
  // 关系列表操作
  bindRelationTap(e) {
    var type = e.currentTarget.dataset.type;
    var idx = e.currentTarget.dataset.index;
    var relations = this.data.cat.relations;

    if (type == "delete") {
      relations.splice(idx, 1);
    } else if (type == "up" && idx != 0) {
      var tmp = relations[idx-1];
      relations[idx-1] = relations[idx];
      relations[idx] = tmp;
    } else if (type == "down" && idx != relations.length-1) {
      var tmp = relations[idx+1];
      relations[idx+1] = relations[idx];
      relations[idx] = tmp;
    }
    this.setData({
      "cat.relations": relations
    });
  },
  // 保存关系列表
  async saveRelations() {
    if (!await this.checkSaveRelations()) {
      return false;
    }

    wx.showLoading({
      title: '保存中...',
    });
    
    var cat = this.data.cat;
    var relations = [];
    for (const r of cat.relations) {
      relations.push({
        type: r.type,
        cat_id: r.cat_id,
      });
    }
    await cloud.callFunction({
      name: "curdOp",
      data: {
        premissionLevel: 1,
        operation: "update",
        collection: "cat",
        item_id: cat._id,
        data: {
          relations: relations  
        }
      }
    });

    wx.showToast({
      title: '保存成功',
    });
  },

  async checkSaveRelations() {
    var cat = this.data.cat;
    if (!cat._id) {
      return false;
    }

    for (let i = 0; i < cat.relations.length; i++) {
      const r = cat.relations[i];
      console.log(r);
      if (!r.type || !r.cat_id) {
        wx.showToast({
          title: `#${i+1}号关系不完整~`,
          icon: "error"
        });
        return false;
      }
    }

    return true;
  }
})