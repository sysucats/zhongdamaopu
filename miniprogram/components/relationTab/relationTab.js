import { getCatItem, getAvatar } from "../../utils/cat";
import api from "../../utils/cloudApi";
const app = getApp();

// 添加全局缓存
const globalRelationsCache = {};

Component({
  properties: {
    selectedCat: {
      type: Object,
      value: null,
      observer: function (newVal) {
        if (newVal && newVal._id) {
          this.loadRelations();
        }
      }
    }
  },

  data: {
    cat: null,
    relation_types: [],
    showSearchCat: false,
    showSearchType: false,
    focusSearchCat: false,
    focusSearchType: false,
    relation_name: '',
    selectRelationTypeIdx: undefined,
    editingRelationIndex: undefined, // 当前正在编辑的关系索引
    selectedCatForRelation: null,
    selectedRelationType: null,
    searchKeyword: '',
    isAddingNewRelation: false,
  },

  lifetimes: {
    attached() {
      this.loadRelationTypes();
    }
  },

  methods: {
    // 加载setting里的relation types
    async loadRelationTypes() {
      const app = getApp();
      try {
        var types = [];
        var data = [];
        var { result } = await app.mpServerless.db.collection('setting').find({ _id: 'relation' });
        data = result;
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
          const { result1 } = await app.mpServerless.db.collection('setting').find({ _id: 'relation' });
          data = result1;
        }
        types = data[0].types;
        this.setData({
          relation_types: types,
        });
      } catch (error) {
        console.error("加载关系类型失败:", error);
        wx.showToast({
          title: '加载关系类型失败',
          icon: 'none'
        });
      }
    },

    // 保存新的关系类型
    async saveNewRelationType(e) {
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

    async selectRelationType(e, idx) {
      const index = idx !== undefined ? idx : e.currentTarget.dataset.index;
      const type = this.data.relation_types[index];
      // 判断是新增关系还是修改已有关系
      if (this.data.isAddingNewRelation) {
        // 新增关系模式
        this.setData({
          selectedRelationType: type
        });

        this.hideSearch();

        // 如果猫咪已选择，则自动创建关系
        if (this.data.selectedCatForRelation) {
          this.createRelation();
        }
      } else {
        // 修改已有关系模式
        const relationIdx = this.data.selectRelationTypeIdx;
        if (relationIdx !== undefined) {
          const cat = this.data.cat;
          cat.relations[relationIdx].type = type;
          this.setData({
            cat: cat,
            showSearchType: false
          });
          // 自动保存修改
          this.saveRelations();
        }
      }
    },

    hideSearch() {
      this.setData({
        showSearchCat: false,
        showSearchType: false
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
      try {
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
      } catch (error) {
        console.error("删除关系类型失败:", error);
        wx.showToast({
          title: '删除关系类型失败',
          icon: 'none'
        });
      }
    },

    // 搜索猫猫
    fSearchInput(e) {
      var value = e.detail.value;
      this.setData({
        filters_input: value
      });
    },

    async doSearchCat() {
      const app = getApp();
      const value = this.data.filters_input;
      if (!value) {
        return;
      }

      try {
        const { result: cats } = await app.mpServerless.db.collection('cat').find({ name: { $regex: value } }, { limit: 10 })

        const searchCats = await Promise.all(cats.map(async (cat) => {
          cat.avatar = await getAvatar(cat._id, cat.photo_count_best);
          return cat;
        }));

        this.setData({
          searchCats
        });
      } catch (error) {
        console.error("搜索猫咪失败:", error);
        wx.showToast({
          title: '搜索猫咪失败',
          icon: 'none'
        });
      }
    },

    // 选择猫猫
    async searchSelectCat(e) {
      const selectedCat = e.detail;
      // 判断是新增还是修改
      if (this.data.isAddingNewRelation) {
        // 新增关系模式
        this.setData({
          selectedCatForRelation: selectedCat,
          searchKeyword: '',
          showSearchCat: false,
        });
        // 关闭搜索后打开关系类型选择
        this.setData({
          showSearchType: true,
          focusSearchType: true
        });
      } else {
        // 编辑现有关系
        const relations = this.data.cat.relations;
        const index = this.data.editingRelationIndex;
        if (index !== undefined && index >= 0 && index < relations.length) {
          relations[index].cat = selectedCat;
          this.setData({
            'cat.relations': relations,
            showSearchCat: false
          });
        }
      }
    },

    // 更新关系列表
    async loadRelations() {
      const app = getApp();
      if (!this.properties.selectedCat?._id) {
        return;
      }

      try {
        const catId = this.properties.selectedCat._id;
        // 检查缓存
        if (globalRelationsCache[catId]) {
          this.setData({
            cat: globalRelationsCache[catId]
          });
          return;
        }

        // 如果没有缓存
        wx.showLoading({
          title: '加载中...',
        });

        const { result: cat } = await app.mpServerless.db.collection('cat').findOne({ _id: catId });
        cat.avatar = await getAvatar(cat._id, cat.photo_count_best);

        if (!cat.relations) {
          cat.relations = [];
        }

        // 获取最新数据
        for (var relation of cat.relations) {
          if (!relation.cat_id) {
            continue;
          }
          const { result: relatedCatData } = await app.mpServerless.db.collection('cat').findOne({ _id: relation.cat_id });
          relation.cat = relatedCatData;
          relation.cat.avatar = await getAvatar(relation.cat_id, relation.cat.photo_count_best);
        }

        // 更新缓存
        globalRelationsCache[catId] = cat;

        this.setData({
          cat: cat
        });

        // 更新全局缓存
        if (app?.globalData?.catsList) {
          app.globalData.catsList = app.globalData.catsList.map(c =>
            c._id === cat._id ? cat : c
          );
        }

        wx.hideLoading();
      } catch (error) {
        wx.hideLoading();
        console.error("加载关系列表失败:", error);
        wx.showToast({
          title: '加载关系列表失败',
          icon: 'none'
        });
      }
    },

    // 添加关系
    addRelation() {
      this.setData({
        showSearchCat: true,
        focusSearchCat: true,
        selectRelationCatIdx: null,
        selectRelationTypeIdx: null,
        // 设置为新增模式
        isAddingNewRelation: true
      });
    },

    bindRelationTap(e) {
      var type = e.currentTarget.dataset.type;
      var index = e.currentTarget.dataset.index;
      var cat = this.data.cat;

      if (type === "delete") {
        // 调用新的删除方法
        this.deleteRelation(e);
        return;
      }

      // 检查边界条件：第一个不能上移，最后一个不能下移
      if ((type === "up" && index <= 0) || (type === "down" && index >= cat.relations.length - 1)) {
        // 直接返回，不执行操作
        return;
      }

      if (type === "up" && index > 0) {
        var temp = cat.relations[index];
        cat.relations[index] = cat.relations[index - 1];
        cat.relations[index - 1] = temp;
      }

      if (type === "down" && index < cat.relations.length - 1) {
        var temp = cat.relations[index];
        cat.relations[index] = cat.relations[index + 1];
        cat.relations[index + 1] = temp;
      }

      this.setData({
        cat: cat
      });
      // 保存关系顺序变化
      this.saveRelations();
    },

    // 搜索组件
    bindSearch(e) {
      const type = e.currentTarget.dataset.type;
      const index = e.currentTarget.dataset.index;
      if (type === 'cat') {
        this.setData({
          editingRelationIndex: index,
          showSearchCat: true,
          showSearchType: false,
          isAddingNewRelation: false
        });
      } else if (type === 'relation') {
        this.setData({
          selectRelationTypeIdx: index,
          showSearchType: true,
          showSearchCat: false,
          focusSearchType: true,
          isAddingNewRelation: false
        });
      }
    },

    // 保存，成功后清缓存
    async saveRelations() {
      if (!await this.checkSaveRelations()) {
        return false;
      }
      try {
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

        // 清除缓存，强制重新加载
        delete globalRelationsCache[cat._id];
        // 重新加载最新数据
        await this.loadRelations();

        wx.showToast({
          title: '保存成功',
        });

        // 保存成功，通知父组件数据已更新
        this.triggerEvent('save', {
          cat: this.data.cat
        });
      } catch (error) {
        console.error("保存关系列表失败:", error);
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        });
      }
    },

    async checkSaveRelations() {
      var cat = this.data.cat;
      if (!cat._id) {
        return false;
      }

      for (let i = 0; i < cat.relations.length; i++) {
        const r = cat.relations[i];
        if (!r.type || !r.cat_id) {
          wx.showToast({
            title: `#${i + 1}号关系不完整~`,
            icon: "error"
          });
          return false;
        }
      }

      return true;
    },

    // 删除
    async deleteRelation(e) {
      const index = e.currentTarget.dataset.index;
      const relation = this.data.cat.relations[index];
      const relationCatName = relation.cat?.name || '这只猫';
      const relationType = relation.type || '关系';
      const res = await new Promise((resolve) => {
        wx.showModal({
          title: '确认删除',
          content: `确定要删除与${relationCatName}的${relationType}关系吗？`,
          confirmText: '删除',
          confirmColor: '#e64340',
          cancelText: '取消',
          success: (res) => {
            resolve(res);
          }
        });
      });
      if (res.confirm) {
        // 确认删除
        const cat = this.data.cat;
        cat.relations.splice(index, 1);

        this.setData({
          cat: cat
        });

        // 保存
        await this.saveRelations();
      }
    },

    // 创建关系
    createRelation() {
      if (!this.data.selectedCatForRelation || !this.data.selectedRelationType) {
        return;
      }

      const cat = this.data.cat;
      const relatedCat = this.data.selectedCatForRelation;
      const relationType = this.data.selectedRelationType;

      // 检查是否存在相同猫
      const existingCatIndex = cat.relations.findIndex(r =>
        r.cat_id === relatedCat._id
      );

      if (existingCatIndex >= 0) {
        wx.showToast({
          title: '该猫猫已在关系列表中',
          icon: 'none'
        });
        return;
      }
      // 添加新关系
      cat.relations.push({
        type: relationType,
        cat_id: relatedCat._id,
        cat: relatedCat
      });
      this.setData({
        cat: cat,
        selectedCatForRelation: null,
        selectedRelationType: null
      });
      // 保存更改
      this.saveRelations();
    },
  }
}) 