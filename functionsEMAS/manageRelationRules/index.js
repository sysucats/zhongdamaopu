module.exports = async (ctx) => {
  // 部署检查
  if (ctx.args?.deploy_test === true) {
    return "v1.0";
  }

  const db = ctx.mpserverless.db;
  const { openid, op, rule, oldName } = ctx.args; // op: 'create' | 'update' | 'delete'

  if (!openid) {
    return { result: false, msg: 'Missing openid' };
  }

  // 鉴权
  try {
    const { result: user } = await db.collection('user').findOne({ openid });
    const mgrLevel = (user && user.manager) || 0;
    // 校验管理员等级
    if (mgrLevel < 2) {
      return { result: false, msg: '需要管理员等级 ≥ 2' };
    }
  } catch (err) {
    console.error('鉴权失败:', err);
    return { result: false, msg: '鉴权失败', error: String(err) };
  }

  // 处理关系规则
  try {
    const { result: setting } = await db.collection('setting').findOne({ _id: 'relation' });
    const rules = (setting && Array.isArray(setting.rules)) ? setting.rules : [];

    if (op === 'create') {
      if (!rule || !rule.name) {
        return { result: false, msg: '关系规则数据无效' };
      }
      const exists = rules.some(r => r.name === rule.name);
      if (exists) {
        return { result: false, msg: `关系 [${rule.name}] 已存在` };
      }
      rules.push(rule);
    } else if (op === 'update') {
      if (!rule || !rule.name || !oldName) {
        return { result: false, msg: '关系数据或旧名称缺失' };
      }
      const idx = rules.findIndex(r => r.name === oldName);
      if (idx === -1) {
        return { result: false, msg: `关系 [${oldName}] 不存在` };
      }
      // 如果名称被改变，检查是否存在冲突
      if (oldName !== rule.name) {
        const exists = rules.some(r => r.name === rule.name);
        if (exists) {
          return { result: false, msg: `关系 [${rule.name}] 已存在` };
        }
      }
      rules[idx] = rule;
    } else if (op === 'delete') {
      if (!rule || !rule.name) {
        return { result: false, msg: '关系名称缺失' };
      }
      const { name: ruleNameToDelete } = rule;
      
      // 校验关系规则是否在使用
      const { result: usedCats } = await db.collection('cat').find({ "relations.type": ruleNameToDelete }, { limit: 1 });
      if (Array.isArray(usedCats) && usedCats.length > 0) {
        return { result: false, msg: `关系 [${ruleNameToDelete}] 正在被使用，无法删除` };
      }

      const idx = rules.findIndex(r => r.name === ruleNameToDelete);
      if (idx === -1) {
        return { result: false, msg: `关系 [${ruleNameToDelete}] 不存在` };
      }
      rules.splice(idx, 1);
    } else {
      return { result: false, msg: `未知操作: ${op}` };
    }

    // 自动反向补全：当创建/更新的是 mapped 规则时，根据 inverse_* 关联子规则
    if ((op === 'create' || op === 'update') && rule && rule.strategy === 'mapped') {
      const parentName = rule.name;
      const parentGender = rule.target_gender; // '公' | '母' | 'any'
      const maleChild = (rule.inverse_male || '').trim();
      const femaleChild = (rule.inverse_female || '').trim();

      function upsertChild(childName, expectedGender) {
        if (!childName) return;
        const idx = rules.findIndex(r => r.name === childName);
        const exist = idx !== -1 ? rules[idx] : null;
        // 不自动传播 inverse_any：仅保留子规则原有的 inverse_any
        const childInverseAny = exist ? exist.inverse_any : undefined;
        const updated = {
          name: childName,
          strategy: 'mapped',
          target_gender: expectedGender,
          inverse_male: exist ? exist.inverse_male : undefined,
          inverse_female: exist ? exist.inverse_female : undefined,
          inverse_any: childInverseAny
        };
        if (parentGender === '公') {
          updated.inverse_male = parentName;
        } else if (parentGender === '母') {
          updated.inverse_female = parentName;
        }
        if (idx === -1) {
          rules.push(updated);
        } else {
          rules[idx] = updated;
        }
      }

      if (parentGender === '公' || parentGender === '母') {
        if (maleChild) upsertChild(maleChild, '公');
        if (femaleChild) upsertChild(femaleChild, '母');
      }

      // 若当前规则填写了 inverse_any，则确保存在对应的 "any" 类型规则（采用 mapped，并补回父规则名到对应性别方向）
      const anyName = (rule.inverse_any || '').trim();
      if (anyName) {
        const anyIdx = rules.findIndex(r => r.name === anyName);
        const existAny = anyIdx !== -1 ? rules[anyIdx] : null;
        const updatedAny = {
          name: anyName,
          strategy: 'mapped',
          target_gender: 'any',
          inverse_male: existAny ? existAny.inverse_male : undefined,
          inverse_female: existAny ? existAny.inverse_female : undefined,
          inverse_any: existAny ? existAny.inverse_any : undefined
        };
        if (parentGender === '公') {
          updatedAny.inverse_male = parentName;
        } else if (parentGender === '母') {
          updatedAny.inverse_female = parentName;
        }
        if (anyIdx === -1) {
          rules.push(updatedAny);
        } else {
          rules[anyIdx] = updatedAny;
        }
      }
    }

    // 写入数据库
    await db.collection('setting').updateOne({ _id: 'relation' }, { $set: { rules: rules } }, { upsert: true });

    return { result: true, msg: `${op} 操作成功`, data: { rules } };

  } catch (error) {
    console.error('编辑关系失败：', error);
    return { result: false, msg: '操作失败', error: error.message || String(error) };
  }
};
