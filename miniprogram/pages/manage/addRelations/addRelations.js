// 审核照片
import { regReplace, sleep } from "../../../utils/utils";
import { getAvatar, getCatItem } from "../../../utils/cat";
import { checkAuth } from "../../../utils/user";
import { cloud } from "../../../utils/cloudAccess";
import api from "../../../utils/cloudApi";


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

  jsData: {
    // 运行状态
    selectRelationTypeIdx: null,
    selectRelationCatIdx: null,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  async onLoad(options) {
    const db = await cloud.databaseAsync();
    if (await checkAuth(this, 2)) {
      this.loadRelationTypes();
    }
    if (options.cat_id) {
      // 输入了cat_id
      var cat = (await db.collection('cat').doc(options.cat_id).get()).data;
      cat.avatar = await getAvatar(cat._id, cat.photo_count_best);
      this.setData({
        cat: cat
      });
      await this.loadRelations();
    } else {
      await sleep(700);
      this.bindSearch(null, "cat");
    }
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
    const db = await cloud.databaseAsync();
    var types = [];
    var data = (await db.collection('setting').where({_id: 'relation'}).get()).data;

    if (data.length == 0) {
      // 当数据库setting中不存在时，进行初始化
      await api.curdOp({
        operation: "set",
        collection: "setting",
        item_id: "relation",
        data: {
          types: ["爸爸", "妈妈"]
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
    // console.log(e);
    const t = e.detail.value;
    var types = this.data.relation_types;

    // 判断一下是否已存在
    var idx = types.indexOf(t);
    if (idx == -1) {
      // 不存在
      types.push(t);
      // console.log(types);
      await api.curdOp({
        operation: "update",
        collection: "setting",
        item_id: "relation",
        data: {
          types: types
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
    // console.log(type);
    this.setData({
      [`cat.relations[${this.jsData.selectRelationTypeIdx}].type`]: type,
      showSearchCat: false,
      showSearchType: false,
    });
  },

  async deleteRelationType(e) {
    var idx = e.currentTarget.dataset.index;
    var types = this.data.relation_types;
    var res = await wx.showModal({
      title: '提示',
      content: `确定删除\"${types[idx]}\"关系？`
    });

    if (res.confirm) {
      this.doDeleteRelationType(idx);
    }
  },

  async doDeleteRelationType(idx) {
    var types = this.data.relation_types;
    types.splice(idx, 1);
    await api.curdOp({
      operation: "update",
      document: "setting",
      item_id: "relation",
      data: {
        types: types
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
      this.jsData.selectRelationCatIdx = e ? e.currentTarget.dataset.index: undefined;
      fCat = true;
      fType = false;
    } else if (type == "relation") {
      this.jsData.selectRelationTypeIdx = e ? e.currentTarget.dataset.index: undefined;
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
    const db = await cloud.databaseAsync();
    const _ = db.command;
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
      let regexp = db.RegExp({
        regexp: search_str.join("|"),
        options: 'is',
      });
      filters.push(_.or([{
        name: regexp
      }, {
        nickname: regexp
      }]));
    }
    
    // 准备搜索
    var query = filters.length ? _.and(filters) : {};
    var cats = (await db.collection('cat').where(query).get()).data;
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
  async searchSelectCat(e) {
    var idx = e.currentTarget.dataset.index;
    var cat = this.data.searchCats[idx];
    if (this.jsData.selectRelationCatIdx === undefined) {
      this.data.cat = cat;
      this.setData({
        cat: cat,
        showSearchCat: false,
      });
      await this.loadRelations();
      return;
    }

    this.setData({
      [`cat.relations[${this.jsData.selectRelationCatIdx}].cat_id`]: cat._id,
      [`cat.relations[${this.jsData.selectRelationCatIdx}].cat`]: cat,
      showSearchCat: false,
      showSearchType: false,
    });
  },
  // 更新关系列表
  async loadRelations() {
    var cat = this.data.cat;
    var relations = this.data.cat.relations;
    // console.log(cat);
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

    console.log("[loadRelations] -", relations);

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
    await api.curdOp({
      operation: "update",
      collection: "cat",
      item_id: cat._id,
      data: {
        relations: relations  
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
      // console.log(r);
      if (!r.type || !r.cat_id) {
        wx.showToast({
          title: `#${i+1}号关系不完整~`,
          icon: "error"
        });
        return false;
      }
    }

    return true;
  },

  // 没有权限，返回上一页
  goBack() {
    wx.navigateBack();
  }
})