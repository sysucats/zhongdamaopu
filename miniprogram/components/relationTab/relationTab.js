import { getAvatar, getCatItemMulti } from "../../utils/cat";
import api from "../../utils/cloudApi";
const app = getApp();

// 添加全局缓存
const globalRelationsCache = {};
const globalRelationRulesCache = {
  rules: null,
  ts: 0
};

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
    relation_types: [], // UI 展示用的候选名字
    relation_rules: [], // 规则原始结构
    relation_cards: [], // 关系卡片（对向关系预览）
    existingRelationIds: [],
    showSearchCat: false,
    showSearchType: false,
    focusSearchCat: false,
    focusSearchType: false,
    relation_name: '',
    selectRelationTypeIdx: undefined,
    editingRelationIndex: undefined, // 当前正在编辑的关系索引
    editingRuleName: null,
    editingOldTargetId: null,
    selectedCatForRelation: null,
    selectedRelationType: null,
    searchKeyword: '',
    isAddingNewRelation: false,
    relationTitle: '', // 弹窗标题文案
    // 编辑关系别名
    showEditAlias: false,
    editingAliasIndex: -1,
    editingAliasValue: '',
    // 新建关系类型
    showCreateType: false,
    createTypeForm: {
      name: '',
      strategy: 'mirror',
      inverse: '',
      target_gender: 'any',
      inverse_male: '',
      inverse_female: '',
      inverse_any: ''
    },
    activeGenderIndex: 2,
  },

  lifetimes: {
    attached() {
      this.loadRelationRules();
    }
  },

  pageLifetimes: {
    show() {
      // 从新建页返回，刷新配置与筛选
      this.loadRelationRules();
      if (this.data.selectedCatForRelation) {
        const available = this.getAvailableRelations(this.data.selectedCatForRelation);
        this.setData({ relation_types: (available || []).map(r => r.name) });
      }
    }
  },

  methods: {
    // 统一展示关系类型弹窗
    showRelationTypeModal(targetCat, context) {
      const rules = this.data.relation_rules || [];
      let available = [];
      if (targetCat) {
        available = this.getAvailableRelations(targetCat) || [];
      } else {
        available = rules;
      }
      const names = (available || []).map(r => r.name);
      const cards = (available || []).map(r => ({
        name: r.name,
        inverseLabel: r.strategy === 'mapped' ? this.computeInverseRelationName(r.name, this.data.cat) : ''
      }));
      let title = '选择关系类型';
      const sourceName = this.data.cat?.name || '';
      const targetName = targetCat?.name || '';
      // A是B的XX
      if (sourceName && targetName) {
        title = `${targetName}是${sourceName}的`;
      }
      // 当前高亮编辑时用当前项类型；新增时用已选择的类型
      let activeTypeName = '';
      if (context === 'edit') {
        const idx = this.data.selectRelationTypeIdx !== undefined ? this.data.selectRelationTypeIdx : this.data.editingRelationIndex;
        activeTypeName = (idx !== undefined) ? (this.data.cat?.relations?.[idx]?.type || '') : '';
      } else if (context === 'add') {
        activeTypeName = this.data.selectedRelationType || '';
      }
      this.setData({
        relation_types: names,
        relation_cards: cards,
        relationTitle: title,
        activeTypeName,
        showSearchType: true,
        showSearchCat: false,
        focusSearchType: true,
        // 进入时清空输入与高亮
        typeInputValue: '',
        scrollIntoView: '',
        highlightTypeName: ''
      });
    },

    // 编辑别名
    editAlias(e) {
      const index = e.currentTarget.dataset.index;
      const relation = this.data.cat.relations[index];
      this.setData({
        showEditAlias: true,
        editingAliasIndex: index,
        editingAliasValue: relation.alias || ''
      });
    },

    closeEditAlias() {
      this.setData({
        showEditAlias: false,
        editingAliasIndex: -1,
        editingAliasValue: ''
      });
    },

    onEditingAliasInput(e) {
      this.setData({
        editingAliasValue: e.detail.value
      });
    },

    saveAlias() {
      const index = this.data.editingAliasIndex;
      const alias = this.data.editingAliasValue;
      this.setData({
        [`cat.relations[${index}].alias`]: alias
      });
      this.closeEditAlias();
      this.saveRelations();
    },

    // 输入即检索（高亮/滚动），确认即选择或新建
    onTypeInput(e) {
      const val = (e.detail.value || '').trim();
      this.setData({ typeInputValue: val });
      if (!val) {
        this.setData({ scrollIntoView: '', highlightTypeName: '' });
        return;
      }
      const idx = (this.data.relation_types || []).findIndex(name => name === val);
      if (idx >= 0) {
        this.setData({ scrollIntoView: `type-${idx}`, highlightTypeName: val });
        setTimeout(() => {
          this.setData({ highlightTypeName: '' });
        }, 800);
      } else {
        this.setData({ scrollIntoView: '', highlightTypeName: '' });
      }
    },

    onTypeConfirm(e) {
      const val = (e.detail.value || '').trim();
      if (!val) return;
      const idx = (this.data.relation_types || []).findIndex(name => name === val);
      if (idx >= 0) {
        // 直接选择
        this.selectRelationType(null, idx);
        return;
      }
      // 检查是否为配置库中的规则
      const rule = (this.data.relation_rules || []).find(r => r.name === val);
      if (rule) {
        // 存在于规则库但不在当前可选：提示不适用于当前目标
        wx.showToast({ title: '该关系不适用于当前目标', icon: 'none' });
        return;
      }
      // 完全不存在：引导新建
      wx.showToast({ title: '没有该关系，去新建', icon: 'none' });
      this.openCreateType();
      // 预填名称
      const form = { ...this.data.createTypeForm, name: val };
      this.setData({ createTypeForm: form });
    },

    // 右侧省略号菜单：编辑/删除
    openCardMenu(e) {
      const index = e.currentTarget.dataset.index;
      const that = this;
      wx.showActionSheet({
        itemList: ['编辑', '删除'],
        success(res) {
          if (res.tapIndex === 0) {
            // 编辑
            that.openEditType({ currentTarget: { dataset: { index } } });
          } else if (res.tapIndex === 1) {
            // 删除
            that.deleteRelationType({ currentTarget: { dataset: { index } } });
          }
        },
        fail() {
          // 点击空白处取消，无需处理
        }
      });
    },
    // 加载 setting.relation 的 rules，并缓存
    async loadRelationRules() {
      try {
        // 先读本地缓存
        const cache = wx.getStorageSync('RELATION_RULES');
        if (cache && Array.isArray(cache.rules)) {
          globalRelationRulesCache.rules = cache.rules;
          globalRelationRulesCache.ts = Date.now();
          this.setData({ relation_rules: cache.rules });
          return;
        }

        // 仅读取新模式下的 rules，不做旧数据兼容与默认初始化
        const { result } = await app.mpServerless.db.collection('setting').find({ _id: 'relation' });
        let rules = [];
        if (result && result.length > 0) {
          const doc = result[0];
          if (Array.isArray(doc.rules)) {
            rules = doc.rules;
          }
        }

        // 写入缓存与状态（允许为空，用户可从零新建）
        wx.setStorageSync('RELATION_RULES', { rules });
        globalRelationRulesCache.rules = rules;
        globalRelationRulesCache.ts = Date.now();
        this.setData({ relation_rules: rules });
      } catch (error) {
        console.error('加载关系规则失败:', error);
        wx.showToast({ title: '加载关系规则失败', icon: 'none' });
      }
    },

    // 基于目标猫性别过滤可选关系
    getAvailableRelations(targetCat) {
      const allRules = this.data.relation_rules || [];
      const gender = (targetCat && targetCat.gender) ? targetCat.gender : '未知';
      return allRules.filter(rule => {
        // 不限制关系（any）
        if (!rule.target_gender || rule.target_gender === 'any') return true;
        return rule.target_gender === gender;
      });
    },

    // 根据当前cat的性别与规则计算反向关系名称
    computeInverseRelationName(forwardName, sourceCat) {
      const rule = (this.data.relation_rules || []).find(r => r.name === forwardName);
      // 如果找不到规则，或规则是 mapped 但没有定义相应的反向关系，则不应显示反向标签
      if (!rule) return '';

      const strategy = rule.strategy;
      if (strategy === 'mirror') {
        return rule.inverse || forwardName;
      }

      // 处理 mapped（性别映射）
      const gender = sourceCat?.gender || '未知';
      if (gender === '公') {
        return rule.inverse_male || '';
      }
      if (gender === '母') {
        return rule.inverse_female || '';
      }
      // 未知/保密性别使用 inverse_any
      return rule.inverse_any || '';
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
        // 修改已有关系模式（统一后端处理）
        const relationIdx = this.data.selectRelationTypeIdx;
        if (relationIdx !== undefined) {
          const cat = this.data.cat;
          const newTargetId = cat.relations[relationIdx].cat_id;
          const oldTargetId = this.data.editingRelationIndex !== undefined ? this.data.editingOldTargetId : undefined;

          const doUpdate = async () => {
            return await api.catRelationOp({
              op: 'update',
              source_id: cat._id,
              target_id: newTargetId,
              relation_name: type
            });
          };
          const doRemoveAdd = async () => {
            if (oldTargetId && String(oldTargetId) !== String(newTargetId)) {
              await api.catRelationOp({ op: 'remove', source_id: cat._id, target_id: oldTargetId });
            }
            return await api.catRelationOp({
              op: 'add',
              source_id: cat._id,
              target_id: newTargetId,
              relation_name: type
            });
          };

          (async () => {
            try {
              const result = (oldTargetId && String(oldTargetId) !== String(newTargetId)) ?
                await doRemoveAdd() : await doUpdate();
              if (result && result.result) {
                if (globalRelationsCache && cat && cat._id) {
                  delete globalRelationsCache[cat._id];
                }
                await this.loadRelations('编辑中...');
                wx.showToast({ title: '编辑成功' });
              } else {
                wx.showToast({ title: result?.msg || '编辑失败', icon: 'none' });
              }
          } catch (err) {
            console.error('编辑关系失败:', err);
            wx.showToast({ title: '编辑失败', icon: 'none' });
          } finally {
            this.setData({ showSearchType: false, editingOldTargetId: null });
          }
          })();
        }
      }
    },

    hideSearch() {
      this.setData({
        showSearchCat: false,
        showSearchType: false
      });
    },

    // 选择猫猫
    async searchSelectCat(e) {
      const selectedCat = e.detail;
      // 禁止选择自己
      if (selectedCat && selectedCat._id && this.data.cat && selectedCat._id === this.data.cat._id) {
        wx.showToast({ title: '不能选择自己', icon: 'none' });
        return;
      }
      // 判断是新增还是修改
      if (this.data.isAddingNewRelation) {
        // 新增关系模式：选择猫后生成可选关系
        this.setData({ selectedCatForRelation: selectedCat, searchKeyword: '' });
        this.showRelationTypeModal(selectedCat, 'add');
      } else {
        // 编辑现有，替换关系里的猫，同时更新候选关系
        const relations = this.data.cat.relations;
        const index = this.data.editingRelationIndex;
        if (index !== undefined && index >= 0 && index < relations.length) {
          relations[index].cat = selectedCat;
          relations[index].cat_id = selectedCat._id;
          this.setData({ 'cat.relations': relations });
          this.showRelationTypeModal(selectedCat, 'edit');
        }
      }
    },

    // 更新关系列表
    async loadRelations(loadingTitle) {
      const app = getApp();
      if (!this.properties.selectedCat?._id) {
        return;
      }

      try {
        const catId = this.properties.selectedCat._id;
        // 检查缓存
        if (globalRelationsCache[catId]) {
          const cached = globalRelationsCache[catId];
          const relIds = (cached.relations || []).filter(r => !!r.cat_id).map(r => r.cat_id);
          this.setData({
            cat: cached,
            existingRelationIds: relIds
          });
          return;
        }
        wx.showLoading({
          title: loadingTitle || '加载中...',
        });
        const { result: cat } = await app.mpServerless.db.collection('cat').findOne({ _id: catId });
        if (!cat) {
          throw new Error('未找到猫咪');
        }
        const relations = cat.relations || [];
        const ids = relations.map(r => r.cat_id);

        const [relatedCats, allAvatars] = await Promise.all([
            getCatItemMulti(ids),
            getAvatar(ids)
        ]);

        for (let i = 0; i < relations.length; i++) {
            relations[i].cat = relatedCats[i];
            if (relations[i].cat) {
                relations[i].cat.avatar = allAvatars[i];
            }
        }

        // 更新缓存
        globalRelationsCache[catId] = cat;

        const existingRelationIds = (cat.relations || []).filter(r => !!r.cat_id).map(r => r.cat_id);
        this.setData({
          cat: cat,
          existingRelationIds: existingRelationIds
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
        isAddingNewRelation: true,
        relation_types: [],
        relationTitle: '选择目标猫'
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

    // 入口事件，点击关系类型或目标猫，打开对应选择弹窗
    openRelationAction(e) {
      const type = e.currentTarget.dataset.type;
      const index = e.currentTarget.dataset.index;
      if (type === 'cat') {
        this.setData({
          editingRelationIndex: index,
          editingOldTargetId: this.data.cat?.relations?.[index]?.cat_id || null,
          showSearchCat: true,
          showSearchType: false,
          isAddingNewRelation: false
        });
      } else if (type === 'relation') {
        // 计算当前这一项对应目标猫的可选关系
        const relations = this.data.cat?.relations || [];
        const rel = relations[index];
        this.setData({ selectRelationTypeIdx: index, isAddingNewRelation: false });
        this.showRelationTypeModal(rel?.cat || null, 'edit');
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
            alias: r.alias
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

        // 统一后端：此处仅保存顺序变更，不再尝试同步目标猫反向关系

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
        // 调用catRelationOp进行双向删除
        const cat = this.data.cat;
        try {
          const result = await api.catRelationOp({
            op: 'remove',
            source_id: cat._id,
            target_id: relation.cat_id
          });
          if (result && result.result) {
            // 刷新数据
            // 清除缓存避免读取旧数据
            if (globalRelationsCache && cat && cat._id) {
              delete globalRelationsCache[cat._id];
            }
            await this.loadRelations();
            wx.showToast({ title: '删除成功' });
          } else {
            wx.showToast({ title: result?.msg || '删除失败', icon: 'none' });
          }
        } catch (err) {
          console.error('删除关系失败:', err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
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
      // 后端事务新增关系
      (async () => {
        try {
          const result = await api.catRelationOp({
            op: 'add',
            source_id: cat._id,
            target_id: relatedCat._id,
            relation_name: relationType
          });
          if (result && result.result) {
            // 刷新最新数据
            // 清除缓存避免读取旧数据
            if (globalRelationsCache && cat && cat._id) {
              delete globalRelationsCache[cat._id];
            }
            await this.loadRelations();
            wx.showToast({ title: '添加成功' });
          } else {
            wx.showToast({ title: result?.msg || '添加失败', icon: 'none' });
          }
        } catch (err) {
          console.error('添加关系失败:', err);
          wx.showToast({ title: '添加失败', icon: 'none' });
        }
      })();

      // 重置选择状态
      this.setData({
        selectedCatForRelation: null,
        selectedRelationType: null,
        showSearchType: false
      });
    },

    // 打开新建关系类型弹窗
    openCreateType() {
      this.setData({
        showCreateType: true,
        editingRuleName: null,
        createTypeForm: {
          name: '',
          strategy: 'mirror',
          inverse: '',
          target_gender: 'any',
          inverse_male: '',
          inverse_female: '',
          inverse_any: ''
        },
        activeGenderIndex: 2
      });
    },
    closeCreateType() {
      this.setData({ showCreateType: false, editingRuleName: null });
    },
    setCreateTypeField(e) {
      const field = e.currentTarget.dataset.field;
      const value = e.detail.value;
      this.setData({
        [`createTypeForm.${field}`]: value
      });
      // 对称（mirror）自动同步反向称呼
      if (field === 'name' && this.data.createTypeForm.strategy === 'mirror') {
        this.setData({
          'createTypeForm.inverse': value
        });
      }
    },

    setCreateTypeType() {
      const current = this.data.createTypeForm.strategy;
      const next = current === 'mirror' ? 'mapped' : 'mirror';
      this.setData({
        'createTypeForm.strategy': next,
        // 切换为对称时自动填充反向称呼
        'createTypeForm.inverse': next === 'mirror' ? this.data.createTypeForm.name : ''
      });
    },

    setCreateTypeTargetGender(e) {
      const gender = e.currentTarget.dataset.val;
      const index = e.currentTarget.dataset.index;
      this.setData({
        'createTypeForm.target_gender': gender,
        activeGenderIndex: index
      });
    },
    async saveCreateType() {
      try {
        const form = this.data.createTypeForm;
        const name = (form.name || '').trim();
        if (!name) {
          wx.showToast({ title: '请填写名称', icon: 'none' });
          return;
        }

        let newRule = null;
        if (form.strategy === 'mirror') {
          const inverse = (form.inverse || '').trim() || name;
          newRule = {
            name,
            strategy: 'mirror',
            inverse,
            // 写入选定性别，'any' 表示不限制
            target_gender: form.target_gender || undefined
          };
        } else {
          newRule = {
            name,
            strategy: 'mapped',
            // 写入选定性别，'any' 表示不限制
            target_gender: form.target_gender || undefined,
            inverse_male: form.inverse_male || undefined,
            inverse_female: form.inverse_female || undefined,
            inverse_any: form.inverse_any || undefined
          };
        }

        const op = this.data.editingRuleName ? 'update' : 'create';
        const oldName = this.data.editingRuleName || undefined;

        const res = await api.manageRelationRules({
          op,
          rule: newRule,
          oldName
        });

        if (!res.result) {
          throw new Error(res.msg || '操作失败');
        }

        const rules = res.data.rules;

        // 更新本地缓存与状态
        wx.setStorageSync('RELATION_RULES', { rules });
        this.setData({ relation_rules: rules, showCreateType: false, editingRuleName: null });

        // 刷新可选关系
        this.refreshAvailableRelations(rules);

        wx.showToast({ title: op === 'create' ? '新建成功' : '更新成功' });
      } catch (error) {
        console.error('保存关系类型失败:', error);
        wx.showToast({ title: error.message || '操作失败', icon: 'none' });
      }
    },

    // 打开编辑关系类型弹窗
    openEditType(e) {
      const index = e.currentTarget.dataset.index;
      const name = this.data.relation_types[index];
      const rules = this.data.relation_rules || [];
      const rule = rules.find(r => r.name === name);
      if (!rule) {
        wx.showToast({ title: '未找到规则', icon: 'none' });
        return;
      }
      const strategy = rule.strategy;
      const form = {
        name: rule.name || '',
        strategy,
        inverse: rule.inverse || '',
        
        target_gender: (rule.target_gender || ''),
        inverse_male: rule.inverse_male || '',
        inverse_female: rule.inverse_female || '',
        inverse_any: rule.inverse_any || ''
      };
      const idx = form.target_gender === '公' ? 0 : (form.target_gender === '母' ? 1 : 2);
      this.setData({ showCreateType: true, editingRuleName: rule.name, createTypeForm: form, activeGenderIndex: idx });
    },

    // 删除关系类型
    async deleteRelationType(e) {
      const index = e.currentTarget.dataset.index;
      const name = this.data.relation_types[index];

      const res = await new Promise(resolve => {
        wx.showModal({
          title: '确认删除',
          content: `确定删除关系类型“${name}”吗？`,
          confirmText: '删除',
          confirmColor: '#e64340',
          cancelText: '取消',
          success: (res) => resolve(res)
        });
      });
      if (!res.confirm) return;

      try {
        const res = await api.manageRelationRules({
          op: 'delete',
          rule: { name }
        });

        if (!res.result) {
          throw new Error(res.msg || '删除失败');
        }

        const rules = res.data.rules;
        wx.setStorageSync('RELATION_RULES', { rules });
        this.setData({ relation_rules: rules });

        this.refreshAvailableRelations(rules);

        wx.showToast({ title: '删除成功' });
      } catch (error) {
        console.error('删除关系类型失败:', error);
        wx.showToast({ title: error.message || '删除失败', icon: 'none' });
      }
    },

    // 刷新当前上下文中的可选关系列表
    refreshAvailableRelations(rules) {
      const cat = this.data.cat;
      // 优先使用新增时选择的目标猫；其次使用正在编辑的关系项的目标猫；
      // 当从“关系类型”入口打开时，使用 selectRelationTypeIdx 作为上下文索引。
      const ctxIndex = (this.data.editingRelationIndex !== undefined)
        ? this.data.editingRelationIndex
        : (this.data.selectRelationTypeIdx !== undefined ? this.data.selectRelationTypeIdx : undefined);
      const targetCatForFilter = this.data.selectedCatForRelation
        || (cat && ctxIndex !== undefined ? cat.relations?.[ctxIndex]?.cat : null)
        || null;

      let available, allRules;
      if (targetCatForFilter) {
        available = this.getAvailableRelations(targetCatForFilter) || [];
      } else {
        allRules = rules || this.data.relation_rules || [];
        available = allRules;
      }

      const names = available.map(r => r.name);
      const cards = available.map(r => ({
        name: r.name,
        inverseLabel: r.strategy === 'mapped' ? this.computeInverseRelationName(r.name, this.data.cat) : ''
      }));

      this.setData({ relation_types: names, relation_cards: cards });
    }
  }
})
