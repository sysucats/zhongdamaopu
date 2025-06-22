import { getAvatar } from "../../utils/cat";
import { getUser } from "../../utils/user";
import api from "../../utils/cloudApi";
const app = getApp();
// 日期格式化函数
function formatDate(date) {
  if (!date) return '';

  let dateObj;
  if (typeof date === 'string') {
    dateObj = new Date(date);
  } else {
    dateObj = date;
  }

  if (isNaN(dateObj.getTime())) {
    return '';
  }

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

// 默认疫苗类型列表
const DEFAULT_VACCINE_TYPES = ["猫三联", "狂犬疫苗", "猫白血病", "猫传腹", "体内驱虫", "体外驱虫"];

// 全局疫苗类型缓存
let globalVaccineTypes = null;

// 全局疫苗列表缓存
let globalVaccineLists = {};

Component({
  properties: {
    selectedCat: {
      type: Object,
      value: null,
      observer: function (newVal) {
        if (newVal && newVal._id) {
          // 只在首次加载或猫咪ID变化时加载疫苗列表
          if (!this.data.vaccineLoaded || this.data.currentCatId !== newVal._id) {
            this.loadVaccineList();
          } else {
            // 如果已经加载过，直接使用缓存的数据
            const cachedList = globalVaccineLists[newVal._id];
            if (cachedList) {
              this.setData({
                vaccineList: cachedList,
                vaccineLoaded: true,
                currentCatId: newVal._id
              });
            }
          }
        }
      }
    }
  },

  data: {
    cat: null,
    vaccineList: [], // 疫苗记录列表
    vaccineTypes: [], // 疫苗类型列表
    showVaccineModal: false, // 是否显示疫苗表单弹窗
    isEditingVaccine: false, // 是否是编辑模式
    selectedTypeIndex: 0, // 选中的疫苗类型索引
    vaccineForm: {
      // 疫苗表单数据
      vaccine_type: '',
      vaccine_date: '',
      vaccine_date_formatted: '',
      expire_date: '',
      expire_date_formatted: '',
      next_vaccine_date: '',
      next_vaccine_date_formatted: '',
      location: '',
      remarks: '',
      custom_vaccine_type: '' // 自定义疫苗类型
    },
    useCustomType: false, // 是否使用自定义疫苗类型
    showTypeManageModal: false, // 是否显示疫苗类型管理弹窗
    newVaccineType: '', // 新增疫苗类型的名称
    isLoading: false, // 是否正在加载
    startX: 0, // 触摸开始X坐标
    startY: 0, // 触摸开始Y坐标
    itemIndex: null, // 当前触摸的疫苗索引
    touchEndTime: null, // 触摸结束时间
    vaccineLoaded: false, // 是否已加载过疫苗数据
    currentCatId: null, // 当前加载的猫咪ID
    showVaccinatedCatsModal: false, // 是否显示已接种列表
    vaccinatedCats: [], // 已接种疫苗
    selectedVaccineType: '', // 选择疫苗类型
  },

  lifetimes: {
    attached() {
      // 加载时初始化疫苗类型
      if (!globalVaccineTypes) {
        this.loadVaccineTypes();
      } else {
        this.setData({ vaccineTypes: globalVaccineTypes });
      }
      // 如果有选中的猫咪，尝试使用缓存的数据
      if (this.properties.selectedCat && this.properties.selectedCat._id) {
        const cachedList = globalVaccineLists[this.properties.selectedCat._id];
        if (cachedList) {
          this.setData({
            vaccineList: cachedList,
            vaccineLoaded: true,
            currentCatId: this.properties.selectedCat._id
          });
        } else {
          this.loadVaccineList();
        }
      }
    }
  },

  methods: {
    // 确保疫苗类型列表不为空
    ensureVaccineTypes() {
      if (!globalVaccineTypes) {
        this.loadVaccineTypes();
      }
      if (!this.data.vaccineTypes || this.data.vaccineTypes.length === 0) {
        this.setData({
          vaccineTypes: DEFAULT_VACCINE_TYPES
        });
      }
      return this.data.vaccineTypes;
    },

    // 更新表单日期字段
    updateDateField(fieldName, date) {
      const updateData = {};
      updateData[`vaccineForm.${fieldName}`] = date;
      updateData[`vaccineForm.${fieldName}_formatted`] = date;
      this.setData(updateData);
    },

    // 加载疫苗类型
    async loadVaccineTypes() {
      if (globalVaccineTypes) {
        this.setData({ vaccineTypes: globalVaccineTypes });
        return;
      }

      try {
        const { result: settingDoc } = await app.mpServerless.db.collection('setting').findOne({ _id: 'vaccine_types' })

        if (settingDoc && settingDoc && settingDoc.types && settingDoc.types.length > 0) {
          console.log("成功获取疫苗类型:", settingDoc.types);
          globalVaccineTypes = settingDoc.types;
          this.setData({ vaccineTypes: globalVaccineTypes });
          return;
        }

        console.log("未找到疫苗类型，初始化并使用默认值");
        const user = await getUser();
        app.mpServerless.function.invoke('initVaccineTypes', { openid: user.openid }).catch(err => console.error("初始化疫苗类型失败:", err));
        console.log("使用默认值");
        globalVaccineTypes = DEFAULT_VACCINE_TYPES;
        this.setData({ vaccineTypes: globalVaccineTypes });

      } catch (error) {
        console.error("加载疫苗类型失败:", error);
        globalVaccineTypes = DEFAULT_VACCINE_TYPES;
        this.setData({ vaccineTypes: globalVaccineTypes });
        wx.showToast({
          title: '加载疫苗类型失败，使用默认值',
          icon: 'none'
        });
      }
    },

    // 加载疫苗列表
    async loadVaccineList() {
      if (!this.properties.selectedCat?._id) return;

      try {
        this.setData({ isLoading: true });

        const result = await api.vaccineOp({
          operation: 'list',
          cat_id: this.properties.selectedCat._id
        });

        let vaccineList = [];

        if (result?.result === true && Array.isArray(result.data)) {
          vaccineList = result.data.map(item => ({
            ...item,
            vaccine_date_formatted: formatDate(item.vaccine_date),
            expire_date_formatted: item.expire_date ? formatDate(item.expire_date) : '',
            next_vaccine_date_formatted: item.next_vaccine_date ? formatDate(item.next_vaccine_date) : '',
            offsetX: 0
          }));
        } else {
          console.error('获取疫苗记录失败', result);
          wx.showToast({
            title: '获取疫苗记录失败',
            icon: 'none'
          });
        }

        // 更新全局缓存
        globalVaccineLists[this.properties.selectedCat._id] = vaccineList;

        this.setData({
          vaccineList,
          vaccineLoaded: true,
          currentCatId: this.properties.selectedCat._id
        });
      } catch (error) {
        console.error('获取疫苗记录失败:', error);
        wx.showToast({
          title: '获取疫苗记录失败',
          icon: 'none'
        });
        this.setData({
          vaccineList: [],
          vaccineLoaded: true,
          currentCatId: this.properties.selectedCat._id
        });
      } finally {
        this.setData({ isLoading: false });
      }
    },

    // 获取空的疫苗表单对象
    getEmptyVaccineForm() {
      return {
        vaccine_type: '',
        vaccine_date: '',
        vaccine_date_formatted: '',
        expire_date: '',
        expire_date_formatted: '',
        next_vaccine_date: '',
        next_vaccine_date_formatted: '',
        location: '',
        remarks: '',
        custom_vaccine_type: ''
      };
    },

    // 疫苗表单
    async showVaccineForm(isEditing = false, vaccineId = null) {
      this.ensureVaccineTypes();

      const emptyForm = this.getEmptyVaccineForm();

      if (!isEditing) {
        this.setData({
          isEditingVaccine: false,
          showVaccineModal: true,
          useCustomType: false,
          vaccineForm: emptyForm,
          selectedTypeIndex: 0
        });
        return;
      }
      if (!vaccineId) {
        console.error("编辑模式下需要提供疫苗ID");
        return;
      }

      try {
        const result = await api.vaccineOp({
          operation: "get",
          vaccine_id: vaccineId
        });

        let vaccine = null;
        if (result && result.result && result.data) {
          vaccine = result.data;
        } else {
          throw new Error("获取疫苗详情失败");
        }

        const typeIndex = this.data.vaccineTypes.findIndex(type => type === vaccine.vaccine_type);

        this.setData({
          isEditingVaccine: true,
          showVaccineModal: true,
          vaccineForm: {
            _id: vaccine._id,
            vaccine_type: vaccine.vaccine_type || this.data.vaccineTypes[0],
            vaccine_date: vaccine.vaccine_date,
            vaccine_date_formatted: formatDate(vaccine.vaccine_date),
            expire_date: vaccine.expire_date || '',
            expire_date_formatted: vaccine.expire_date ? formatDate(vaccine.expire_date) : '',
            next_vaccine_date: vaccine.next_vaccine_date || '',
            next_vaccine_date_formatted: vaccine.next_vaccine_date ? formatDate(vaccine.next_vaccine_date) : '',
            location: vaccine.location || '',
            remarks: vaccine.remarks || '',
            custom_vaccine_type: vaccine.custom_vaccine_type || ''
          },
          selectedTypeIndex: typeIndex >= 0 ? typeIndex : 0
        });
      } catch (error) {
        console.error("加载疫苗记录失败:", error);
        wx.showToast({
          title: '加载疫苗记录失败: ' + (error.message || '未知错误'),
          icon: 'none'
        });
      }
    },

    // 添加记录
    addVaccine() {
      this.showVaccineForm(false);
    },

    // 编辑记录
    editVaccine(e) {
      if (this.touchEndTime && Date.now() - this.touchEndTime < 300) {
        return;
      }
      const vaccineId = e.currentTarget.dataset.id;
      if (!vaccineId) {
        console.error("未找到疫苗ID");
        return;
      }
      this.showVaccineForm(true, vaccineId);
    },

    // 取消
    cancelVaccine() {
      this.setData({
        showVaccineModal: false,
        vaccineForm: this.getEmptyVaccineForm(),
        useCustomType: false
      });
    },

    // 疫苗类型
    vaccineTypeChange(e) {
      const index = e.detail.value;
      const types = this.ensureVaccineTypes();
      const type = types[index];
      this.setData({
        selectedTypeIndex: index,
        'vaccineForm.vaccine_type': type
      });
    },

    // 接种日期
    vaccineDateChange(e) {
      this.updateDateField('vaccine_date', e.detail.value);
    },

    // 有效期
    expireDateChange(e) {
      this.updateDateField('expire_date', e.detail.value);
    },

    // 下次接种日期
    nextDateChange(e) {
      this.updateDateField('next_vaccine_date', e.detail.value);
    },

    // 切换是否使用自定义疫苗类型
    toggleCustomType() {
      const useCustomType = !this.data.useCustomType;
      this.setData({ useCustomType });
      if (!useCustomType && this.data.vaccineTypes.length > 0) {
        const index = this.data.selectedTypeIndex;
        const type = this.data.vaccineTypes[index] || this.data.vaccineTypes[0];
        this.setData({
          'vaccineForm.vaccine_type': type
        });
      } else if (useCustomType) {
        this.setData({
          'vaccineForm.vaccine_type': this.data.vaccineForm.custom_vaccine_type || ''
        });
      }
    },

    // 自定义疫苗类型输入
    customTypeInput(e) {
      const value = e.detail.value.trim();
      this.setData({
        'vaccineForm.custom_vaccine_type': value,
        'vaccineForm.vaccine_type': value
      });
    },

    // 保存疫苗记录
    async saveVaccine(e) {
      const formValues = e.detail.value;
      const vaccineForm = this.data.vaccineForm;
      const vaccineData = {
        vaccine_type: vaccineForm.vaccine_type,
        vaccine_date: vaccineForm.vaccine_date,
        expire_date: vaccineForm.expire_date,
        next_vaccine_date: vaccineForm.next_vaccine_date,
        location: formValues.location,
        remarks: formValues.remarks
      };

      if (!vaccineData.vaccine_type || !vaccineData.vaccine_date) {
        wx.showToast({
          title: '请填写疫苗类型和接种日期',
          icon: 'none'
        });
        return;
      }
      try {
        wx.showLoading({
          title: '保存中...',
        });

        if (this.data.useCustomType &&
          vaccineData.vaccine_type &&
          !this.data.vaccineTypes.includes(vaccineData.vaccine_type)) {

          try {
            const addTypeResult = await api.vaccineOp({
              operation: "addType",
              type: vaccineData.vaccine_type
            });

            if (addTypeResult?.result === true) {
              if (addTypeResult.data) {
                this.setData({
                  vaccineTypes: addTypeResult.data
                });
              }
            }
          } catch (error) {
            console.error("自动添加疫苗类型出错:", error);
          }
        }

        let result;
        if (this.data.isEditingVaccine) {
          result = await api.vaccineOp({
            operation: "update",
            vaccine_id: vaccineForm._id,
            data: vaccineData
          });
        } else {
          vaccineData.cat_id = this.properties.selectedCat._id;
          result = await api.vaccineOp({
            operation: "add",
            data: vaccineData
          });
        }

        if (result?.result === true) {
          wx.hideLoading();

          wx.showToast({
            title: this.data.isEditingVaccine ? '编辑成功' : '添加成功',
            icon: 'success'
          });
          this.setData({
            showVaccineModal: false,
            vaccineForm: this.getEmptyVaccineForm(),
            isEditingVaccine: false,
            currentVaccineId: '',
            vaccineLoaded: false
          });
          // 清除缓存
          if (this.properties.selectedCat?._id) {
            delete globalVaccineLists[this.properties.selectedCat._id];
          }
          setTimeout(() => {
            this.loadVaccineList();
          }, 1500);
        } else {
          throw new Error(result?.msg || '操作失败');
        }
      } catch (error) {
        console.error("保存疫苗记录失败:", error);
        wx.hideLoading();
        wx.showToast({
          title: '保存失败：' + (error.message || '未知错误'),
          icon: 'none'
        });
      }
    },

    // 删除疫苗记录
    async deleteVaccine(e) {
      if (this.touchEndTime && Date.now() - this.touchEndTime < 300) {
        return;
      }
      const vaccineId = e.currentTarget.dataset.id;
      if (!vaccineId) {
        console.error("未找到疫苗ID");
        return;
      }
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这条疫苗记录吗？此操作不可撤销。',
        confirmText: '删除',
        confirmColor: '#e64340',
        success: async (res) => {
          if (res.confirm) {
            try {
              const result = await api.vaccineOp({
                operation: "remove",
                vaccine_id: vaccineId
              });

              if (result?.result === true) {
                wx.showToast({
                  title: '删除成功',
                  icon: 'success'
                });
                // 清除缓存
                if (this.properties.selectedCat?._id) {
                  delete globalVaccineLists[this.properties.selectedCat._id];
                }

                this.setData({
                  vaccineLoaded: false
                });

                this.loadVaccineList();
              } else {
                throw new Error(result?.msg || '删除失败');
              }

            } catch (error) {
              console.error("删除疫苗记录失败:", error);
              wx.hideLoading();
              wx.showToast({
                title: '删除失败：' + (error.message || '未知错误'),
                icon: 'none'
              });
            }
          }
        }
      });
    },

    // 显示疫苗类型管理
    showVaccineTypeManager() {
      this.setData({
        showTypeManageModal: true,
        newVaccineType: ''
      });
    },

    cancelTypeManage() {
      this.setData({
        showTypeManageModal: false,
        newVaccineType: ''
      });
    },

    // 新增疫苗类型
    onNewTypeInput(e) {
      this.setData({
        newVaccineType: e.detail.value.trim()
      });
    },

    // 添加新的疫苗类型
    async addVaccineType() {
      const { newVaccineType } = this.data;
      if (!newVaccineType) {
        wx.showToast({
          title: '请输入疫苗类型名称',
          icon: 'none'
        });
        return;
      }

      try {
        const result = await api.vaccineOp({
          operation: "addType",
          type: newVaccineType
        });

        if (result?.result === true) {
          wx.showToast({
            title: '添加成功',
            icon: 'success'
          });

          if (result.data) {
            globalVaccineTypes = result.data;
            this.setData({
              vaccineTypes: globalVaccineTypes,
              newVaccineType: ''
            });
          } else {
            this.loadVaccineTypes();
          }
        } else {
          throw new Error(result?.msg || '添加失败');
        }

      } catch (error) {
        console.error("添加疫苗类型失败:", error);
        wx.showToast({
          title: '添加失败：' + (error.message || '未知错误'),
          icon: 'none'
        });
      }
    },

    // 删除疫苗类型
    async deleteVaccineType(e) {
      const typeToDelete = e.currentTarget.dataset.type;
      if (!typeToDelete) {
        wx.showToast({
          title: '未找到疫苗类型名称',
          icon: 'none'
        });
        return;
      }
      wx.showModal({
        title: '确认删除',
        content: `确定要删除"${typeToDelete}"疫苗类型吗？如果该类型已被使用，将无法删除。`,
        confirmText: '删除',
        confirmColor: '#e64340',
        success: async (res) => {
          if (res.confirm) {
            try {
              const result = await api.vaccineOp({
                operation: "removeType",
                type: typeToDelete
              });

              if (result?.result === true) {
                wx.showToast({
                  title: '删除成功',
                  icon: 'success'
                });

                if (result.data) {
                  globalVaccineTypes = result.data;
                  this.setData({
                    vaccineTypes: globalVaccineTypes
                  });
                } else {
                  this.loadVaccineTypes();
                }
              } else {
                let errorMsg = result?.msg || '删除失败';

                if (result?.inUseCount > 0) {
                  errorMsg = `该疫苗类型已被使用 ${result.inUseCount} 次，无法删除`;
                }

                throw new Error(errorMsg);
              }
            } catch (error) {
              console.error("删除疫苗类型失败:", error);
              wx.showToast({
                title: '删除失败：' + (error.message || '未知错误'),
                icon: 'none'
              });
            }
          }
        }
      });
    },

    // 触摸开始
    touchStart(e) {
      if (this.data.isLoading) return;
      const touch = e.touches[0];
      this.startX = touch.clientX;
      this.startY = touch.clientY;
      this.itemIndex = e.currentTarget.dataset.index;
      const vaccineList = this.data.vaccineList.map((item, index) => {
        if (index !== this.itemIndex && item.offsetX !== 0) {
          return { ...item, offsetX: 0 };
        }
        return item;
      });
      this.setData({ vaccineList });
    },

    // 触摸移动
    touchMove(e) {
      if (this.data.isLoading) return;
      if (!this.startX || !this.startY) return;
      const touch = e.touches[0];
      const moveX = touch.clientX - this.startX;
      const moveY = touch.clientY - this.startY;

      if (Math.abs(moveY) > Math.abs(moveX)) return;

      let offsetX = moveX;
      if (offsetX > 0) offsetX = 0;
      if (offsetX < -320) offsetX = -320;

      const vaccineList = [...this.data.vaccineList];
      vaccineList[this.itemIndex].offsetX = offsetX;

      this.setData({ vaccineList });
    },

    // 触摸结束
    touchEnd(e) {
      if (this.data.isLoading) return;
      if (!this.startX || !this.startY) return;
      const vaccineList = [...this.data.vaccineList];
      const offsetX = vaccineList[this.itemIndex].offsetX || 0;

      if (offsetX < -80) {
        vaccineList[this.itemIndex].offsetX = -320;
      } else {
        vaccineList[this.itemIndex].offsetX = 0;
      }

      this.setData({ vaccineList });
      this.startX = 0;
      this.startY = 0;
      this.touchEndTime = Date.now();
    },

    // 显示已接种疫苗的猫咪列表
    async showVaccinatedCats() {
      try {
        this.setData({ isLoading: true });

        // 确保已加载疫苗类型
        await this.ensureVaccineTypes();

        // 调用云函数获取已接种疫苗的猫咪列表
        const result = await api.vaccineOp({
          operation: 'listVaccinatedCats',
          vaccine_type: this.data.selectedVaccineType // 可以为空，表示获取所有类型
        });

        if (result?.result === true && Array.isArray(result.data)) {
          // 处理猫咪头像
          const catsWithAvatars = await Promise.all(result.data.map(async (cat) => {
            // 直接使用猫咪自带的照片数量
            cat.avatar = await getAvatar(cat._id, cat.photo_count_best);
            return cat;
          }));
          this.setData({
            vaccinatedCats: catsWithAvatars,
            showVaccinatedCatsModal: true
          });
        } else {
          console.error('获取已接种猫咪列表失败', result);
          wx.showToast({
            title: '获取已接种猫咪列表失败',
            icon: 'none'
          });
        }
      } catch (error) {
        console.error('获取已接种猫咪列表失败:', error);
        wx.showToast({
          title: '获取已接种猫咪列表失败',
          icon: 'none'
        });
      } finally {
        this.setData({ isLoading: false });
      }
    },
    // 关闭已接种猫咪列表弹窗
    closeVaccinatedCatsModal() {
      this.setData({
        showVaccinatedCatsModal: false
      });
    },

    // 选择疫苗类型筛选已接种猫咪
    selectVaccineTypeFilter(e) {
      const { type } = e.currentTarget.dataset;

      // 设置加载状态
      this.setData({
        isLoading: true
      });
      // 先设置类型，但不立即重新加载，给动画留出时间
      this.setData({
        selectedVaccineType: type
      });
      // 延迟一点时间再重新加载，让动画有时间展示
      setTimeout(() => {
        this.showVaccinatedCats();
      }, 100);
    },

    // 查看猫咪详情
    viewCatDetail(e) {
      const { catId } = e.currentTarget.dataset;

      // 通知父页面切换到选中的猫咪
      this.triggerEvent('selectCat', { catId });

      // 关闭弹窗
      this.closeVaccinatedCatsModal();
    },
  }
}) 