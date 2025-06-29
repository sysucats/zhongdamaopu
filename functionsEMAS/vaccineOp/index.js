module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  const openid = ctx.args.openid
  const {
    result: is_manager
  } = await ctx.mpserverless.function.invoke('isManager', {
    openid: openid,
    req: 2
  })
  if (!is_manager) {
    return {
      msg: 'not a manager',
      result: false
    };
  }

  const operation = ctx.args.operation;

  // 添加疫苗记录
  if (operation === 'add') {
    const vaccineData = ctx.args.data;
    if (!vaccineData.cat_id || !vaccineData.vaccine_type || !vaccineData.vaccine_date) {
      return {
        msg: '缺少必要字段',
        result: false
      };
    }

    vaccineData.created_by = openid;
    vaccineData.created_at = new Date();
    vaccineData.updated_at = new Date();

    try {
      const {
        result
      } = await ctx.mpserverless.db.collection('vaccine').insertOne(vaccineData);
      return {
        msg: '添加成功',
        result: true,
        data: result
      };
    } catch (error) {
      return {
        msg: '添加失败',
        error,
        result: false
      };
    }
  } else if (operation === 'get') {
    // 单条疫苗记录
    const vaccine_id = ctx.args.vaccine_id;
    if (!vaccine_id) {
      return {
        msg: '缺少疫苗ID',
        result: false
      };
    }

    try {
      const {
        result: vaccine
      } = await ctx.mpserverless.db.collection('vaccine').findOne({
        _id: vaccine_id
      });
      return {
        msg: '获取成功',
        result: true,
        data: vaccine
      };
    } catch (error) {
      return {
        msg: '获取失败',
        error,
        result: false
      };
    }
  } else if (operation === 'list') {
    // 指定猫的所有疫苗
    const cat_id = ctx.args.cat_id;
    if (!cat_id) {
      return {
        msg: '缺少猫咪ID',
        result: false
      };
    }
    try {
      const {
        result: vaccines
      } = await ctx.mpserverless.db.collection('vaccine').find({
        cat_id: cat_id
      }, {
        sort: {
          vaccine_date: -1
        }
      });
      return {
        msg: '获取成功',
        result: true,
        data: vaccines
      };
    } catch (error) {
      return {
        msg: '获取失败',
        error,
        result: false
      };
    }
  } else if (operation === 'update') {
    // 更新疫苗
    const vaccine_id = ctx.args.vaccine_id;
    const vaccineData = ctx.args.data;
    if (!vaccine_id) {
      return {
        msg: '缺少疫苗ID',
        result: false
      };
    }

    // 添加更新时间
    vaccineData.updated_at = new Date();

    try {
      const {
        result
      } = await ctx.mpserverless.db.collection('vaccine').updateOne({
        _id: vaccine_id
      }, {
        $set: vaccineData
      });
      return {
        msg: '更新成功',
        result: true,
        data: result
      };
    } catch (error) {
      return {
        msg: '更新失败',
        error,
        result: false
      };
    }
  } else if (operation === 'remove') {
    // 删除疫苗记录
    const vaccine_id = ctx.args.vaccine_id;
    if (!vaccine_id) {
      return {
        msg: '缺少疫苗ID',
        result: false
      };
    }

    try {
      const {
        result
      } = await ctx.mpserverless.db.collection('vaccine').deleteOne({
        _id: vaccine_id
      });
      return {
        msg: '删除成功',
        result: true,
        data: result
      };
    } catch (error) {
      return {
        msg: '删除失败',
        error,
        result: false
      };
    }
  } else if (operation === 'getTypes') {
    // 获取所有类型
    try {
      const {
        result: types
      } = await ctx.mpserverless.db.collection('setting').findOne({
        _id: 'vaccine_type'
      });
      return {
        msg: '获取成功',
        result: true,
        data: types
      };
    } catch (error) {
      return {
        msg: '获取失败',
        error,
        result: false
      };
    }
  } else if (operation === 'addType') {
    // 添加新的类型
    const newType = ctx.args.type;
    if (!newType) {
      return {
        msg: '缺少类型',
        result: false
      };
    }
    try {
      const {
        result: types
      } = await ctx.mpserverless.db.collection('setting').findOne({
        _id: 'vaccine_type'
      });
      const typeList = types.types || [];
      // 检查是否已存在
      if (typeList.includes(newType)) {
        return {
          msg: '类型已存在',
          result: false
        };
      }
      // 添加
      typeList.push(newType);
      await ctx.mpserverless.db.collection('setting').updateOne({
        _id: 'vaccine_type'
      }, {
        $set: {
          types: typeList
        }
      });
      return {
        msg: '添加类型成功',
        result: true,
        data: typeList
      };
    } catch (error) {
      return {
        msg: '添加类型失败',
        error,
        result: false
      };
    }
  } else if (operation === 'removeType') {
    // 删除疫苗类型
    const typeToRemove = ctx.args.type;
    if (!typeToRemove) {
      return {
        msg: '缺少类型',
        result: false
      };
    }
    try {
      // 获取现有
      const {
        result: types
      } = await ctx.mpserverless.db.collection('setting').findOne({
        _id: 'vaccine_type'
      });
      const typeList = types.types || [];

      // 检查是否存在
      if (!typeList.includes(typeToRemove)) {
        return {
          msg: '类型不存在',
          result: false
        };
      }

      // 检查是否在使用中
      const {
        result: inUseCount
      } = await ctx.mpserverless.db.collection('vaccine').count({
        vaccine_type: typeToRemove
      });

      if (inUseCount > 0) {
        return {
          msg: '该疫苗类型正在使用中，无法删除',
          result: false,
          inUseCount
        };
      }

      const newTypeList = typeList.filter(type => type !== typeToRemove);

      // 确保至少保留一种疫苗类型
      if (newTypeList.length === 0) {
        return {
          msg: '必须至少保留一种疫苗类型',
          result: false
        };
      }

      await ctx.mpserverless.db.collection('setting').updateOne({
        _id: 'vaccine_type'
      }, {
        $set: {
          types: newTypeList
        }
      });
      return {
        msg: '删除类型成功',
        result: true,
        data: newTypeList
      };
    } catch (error) {
      return {
        msg: '删除类型失败',
        error,
        result: false
      };
    }
  } else if (operation === 'listVaccinatedCats') {
    // 获取已接种疫苗的列表
    const vaccine_type = ctx.args.vaccine_type; // 筛选特定疫苗类型

    try {
      // 获取所有符合条件的疫苗记录
      const {
        result: vaccines
      } = await ctx.mpserverless.db.collection('vaccine').find({
        vaccine_type: vaccine_type
      }, {
        sort: {
          vaccine_date: -1
        }
      });

      // 拿到所有猫咪ID并去重
      const catIds = [...new Set(vaccines.map(v => v.cat_id))];

      if (catIds.length === 0) {
        return {
          msg: '没有找到已接种疫苗的猫咪',
          result: true,
          data: []
        };
      }

      // 获取所有猫咪信息
      const {
        result: cats
      } = await ctx.mpserverless.db.collection('cat').find({
        _id: {
          $in: catIds
        }
      }, {
        projection: {
          name: 1,
          campus: 1,
          area: 1,
          avatar: 1,
          photo_count_best: 1
        }
      });

      // 为每只猫添加最近的疫苗接种信息
      const result = cats.map(cat => {
        // 找出该猫的所有疫苗记录
        const catVaccines = vaccines.filter(v => v.cat_id === cat._id);
        // 按日期排序，取最新的一条
        const lastVaccine = catVaccines.sort((a, b) =>
          new Date(b.vaccine_date).getTime() - new Date(a.vaccine_date).getTime()
        )[0];

        return {
          ...cat,
          last_vaccine: {
            vaccine_type: lastVaccine.vaccine_type,
            vaccine_date: lastVaccine.vaccine_date,
            vaccine_date_formatted: formatDate(lastVaccine.vaccine_date)
          }
        };
      });

      return {
        msg: '获取成功',
        result: true,
        data: result
      };
    } catch (error) {
      return {
        msg: '获取已接种猫咪列表失败',
        error,
        result: false
      };
    }

  } else {
    return {
      msg: '未知操作',
      result: false
    };
  }
}

// 日期格式化
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