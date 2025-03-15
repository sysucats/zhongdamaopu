import cloud from '@lafjs/cloud'
import { isManager } from '@/isManager'

const db = cloud.database();

export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  const openid = ctx.user?.openid;

  // 检查用户权限2级
  const is_manager = await isManager(openid, 2);
  if (!is_manager) {
    return { msg: 'not a manager', result: false };
  }

  const operation = body.operation; // add, get, list, update, remove
  
  // 添加疫苗记录
  if (operation === 'add') {
    const vaccineData = body.data;
    if (!vaccineData.cat_id || !vaccineData.vaccine_type || !vaccineData.vaccine_date) {
      return { msg: '缺少必要字段', result: false };
    }
    
    vaccineData.created_by = openid;
    vaccineData.created_at = new Date();
    vaccineData.updated_at = new Date();
    
    try {
      const result = await db.collection('vaccine').add(vaccineData);
      return { msg: '添加成功', result: true, data: result };
    } catch (error) {
      return { msg: '添加失败', error, result: false };
    }
  }
  
  // 单条疫苗记录
  else if (operation === 'get') {
    const vaccine_id = body.vaccine_id;
    if (!vaccine_id) {
      return { msg: '缺少疫苗ID', result: false };
    }
    
    try {
      const vaccine = await db.collection('vaccine').doc(vaccine_id).get();
      return { msg: '获取成功', result: true, data: vaccine.data };
    } catch (error) {
      return { msg: '获取失败', error, result: false };
    }
  }
  
  // 指定猫的所有疫苗
  else if (operation === 'list') {
    const cat_id = body.cat_id;
    if (!cat_id) {
      return { msg: '缺少猫咪ID', result: false };
    }
    
    try {
      const vaccines = await db.collection('vaccine')
        .where({ cat_id })
        .orderBy('vaccine_date', 'desc')
        .get();
      return { msg: '获取成功', result: true, data: vaccines.data };
    } catch (error) {
      return { msg: '获取失败', error, result: false };
    }
  }
  
  // 更新疫苗
  else if (operation === 'update') {
    const vaccine_id = body.vaccine_id;
    const vaccineData = body.data;
    if (!vaccine_id) {
      return { msg: '缺少疫苗ID', result: false };
    }
    
    // 添加更新时间
    vaccineData.updated_at = new Date();
    
    try {
      const result = await db.collection('vaccine').doc(vaccine_id).update(vaccineData);
      return { msg: '更新成功', result: true, data: result };
    } catch (error) {
      return { msg: '更新失败', error, result: false };
    }
  }
  
  // 删除疫苗记录
  else if (operation === 'remove') {
    const vaccine_id = body.vaccine_id;
    if (!vaccine_id) {
      return { msg: '缺少疫苗ID', result: false };
    }
    
    try {
      const result = await db.collection('vaccine').doc(vaccine_id).remove();
      return { msg: '删除成功', result: true, data: result };
    } catch (error) {
      return { msg: '删除失败', error, result: false };
    }
  }
  
  // 获取所有类型
  else if (operation === 'getTypes') {
    try {
      const types = await db.collection('setting').doc('vaccine_types').get();
      return { msg: '获取类型成功', result: true, data: types.data };
    } catch (error) {
      return { msg: '获取类型失败', error, result: false };
    }
  }
  
  // 添加新的类型
  else if (operation === 'addType') {
    const newType = body.type;
    if (!newType) {
      return { msg: '缺少类型名称', result: false };
    }
    
    try {
      // 获取现有类型
      const types = await db.collection('setting').doc('vaccine_types').get();
      const typeList = types.data.types || [];
      
      // 检查是否已存在
      if (typeList.includes(newType)) {
        return { msg: '类型已存在', result: false };
      }
      
      // 添加
      typeList.push(newType);
      await db.collection('setting').doc('vaccine_types').update({
        types: typeList
      });
      
      return { msg: '添加类型成功', result: true, data: typeList };
    } catch (error) {
      return { msg: '添加类型失败', error, result: false };
    }
  }
  
  // 删除疫苗类型
  else if (operation === 'removeType') {
    const typeToRemove = body.type;
    if (!typeToRemove) {
      return { msg: '缺少类型名称', result: false };
    }
    
    try {
      // 获取现有
      const types = await db.collection('setting').doc('vaccine_types').get();
      const typeList = types.data.types || [];
      
      // 检查是否存在
      if (!typeList.includes(typeToRemove)) {
        return { msg: '类型不存在', result: false };
      }
      
      // 检查是否在使用中
      const inUseCount = (await db.collection('vaccine').where({
        vaccine_type: typeToRemove
      }).count()).total;
      
      if (inUseCount > 0) {
        return { msg: '该疫苗类型正在使用中，无法删除', result: false, inUseCount };
      }
      
      const newTypeList = typeList.filter(type => type !== typeToRemove);
      
      // 确保至少保留一种疫苗类型
      if (newTypeList.length === 0) {
        return { msg: '必须至少保留一种疫苗类型', result: false };
      }
      
      await db.collection('setting').doc('vaccine_types').update({
        types: newTypeList
      });
      
      return { msg: '删除类型成功', result: true, data: newTypeList };
    } catch (error) {
      return { msg: '删除类型失败', error, result: false };
    }
  }
  
  // 获取已接种疫苗的列表
  else if (operation === 'listVaccinatedCats') {
    const vaccine_type = body.vaccine_type; // 筛选特定疫苗类型
    
    try {
      // 构建查询条件
      const query: any = {};
      if (vaccine_type) {
        query.vaccine_type = vaccine_type;
      }
      
      // 获取所有符合条件的疫苗记录
      const vaccines = await db.collection('vaccine')
        .where(query)
        .orderBy('vaccine_date', 'desc')
        .get();
      
      // 拿到所有猫咪ID并去重
      const catIds = [...new Set(vaccines.data.map(v => v.cat_id))];
      
      if (catIds.length === 0) {
        return { msg: '没有找到已接种疫苗的猫咪', result: true, data: [] };
      }
      
      // 获取所有猫咪信息
      const cats = await db.collection('cat')
        .where({
          _id: db.command.in(catIds)
        })
        .field({
          _id: true,
          name: true,
          campus: true,
          area: true,
          avatar: true,
          photo_count_best: true
        })
        .get();
      
      // 为每只猫添加最近的疫苗接种信息
      const result = cats.data.map(cat => {
        // 找出该猫的所有疫苗记录
        const catVaccines = vaccines.data.filter(v => v.cat_id === cat._id);
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
      
      return { msg: '获取成功', result: true, data: result };
    } catch (error) {
      return { msg: '获取已接种猫咪列表失败', error, result: false };
    }
  }
  
  else {
    return { msg: '未知操作', result: false };
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