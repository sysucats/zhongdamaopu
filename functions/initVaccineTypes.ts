import cloud from '@lafjs/cloud'
import { isManager } from '@/isManager'

export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  const openid = ctx.user?.openid;

  // 检查用户权限
  const is_manager = await isManager(openid, 2);
  if (!is_manager) {
    return { msg: 'not a manager', result: false };
  }

  const db = cloud.database();
  
  // 检查是否已存在疫苗类型
  const settingExists = (await db.collection('setting').where({_id: 'vaccine_types'}).count()).total > 0;
  
  if (!settingExists) {
    // 不存在创建默认疫苗类型
    await db.collection('setting').doc('vaccine_types').set({
      types: ["猫三联", "狂犬疫苗", "猫白血病", "猫传腹", "体内驱虫", "体外驱虫"]
    });
    return { msg: '疫苗类型初始化成功', result: true };
  } else {
    // 已存在返回当前
    const vaccineTypes = (await db.collection('setting').doc('vaccine_types').get()).data;
    return { msg: '疫苗类型已存在', types: vaccineTypes.types, result: true };
  }
} 