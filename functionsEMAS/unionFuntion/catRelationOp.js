module.exports = async (ctx) => {
  const db = ctx.mpserverless.db;
  const openid = ctx.args?.openid;
  const op = ctx.args?.op;
  const sourceIdArg = ctx.args?.source_id;
  const targetIdArg = ctx.args?.target_id;
  const relationName = ctx.args?.relation_name;

  console.log('Function Start:', { op, sourceIdArg, targetIdArg, relationName });

  if (!openid) return { result: false, msg: '缺少 openid' };

  try {
    const { result: user } = await db.collection('user').findOne({ openid });
    const mgrLevel = (user && user.manager) || 0;
    if (mgrLevel < 2) {
      return { result: false, msg: '权限不足：需要管理员等级≥2' };
    }
  } catch (err) {
    console.error('权限检查异常:', err);
    return { result: false, msg: '权限检查失败', error: String(err) };
  }

  if (op !== 'get' && (!sourceIdArg || !targetIdArg)) {
    return { result: false, msg: '缺少必要参数' };
  }
  if (op !== 'get' && String(sourceIdArg) === String(targetIdArg)) {
    return { result: false, msg: '不能添加与自己的关系' };
  }

  async function loadRules() {
    try {
      const { result: setting } = await db.collection('setting').findOne({ _id: 'relation' });
      if (setting && Array.isArray(setting.rules)) return setting.rules;
      return [];
    } catch (e) {
      console.warn('加载配置失败，使用默认:', e);
      return [];
    }
  }

  function computeInverse(rules, forwardName, sourceGender) {
    const rule = (rules || []).find(r => r.name === forwardName);
    if (!rule) return null;
    const strategy = rule.strategy;
    if (strategy === 'mirror') {
      return rule.inverse || forwardName;
    }
    const gender = sourceGender || '未知';
    if (strategy === 'mapped') {
      if (gender === '公') return rule.inverse_male || null;
      if (gender === '母') return rule.inverse_female || null;
      return rule.inverse_any || null;
    }
    return null;
  }

  function upsert(relations, otherId, type) {
    const list = Array.isArray(relations) ? relations.slice() : [];
    const idx = list.findIndex(r => r && String(r.cat_id) === String(otherId));
    if (idx >= 0) {
      list[idx].type = type;
    } else {
      list.push({ type, cat_id: otherId, create_time: new Date() });
    }
    return list;
  }

  function removeRel(relations, otherId) {
    const list = Array.isArray(relations) ? relations.slice() : [];
    return list.filter(r => r && String(r.cat_id) !== String(otherId));
  }

  try {
    const { result: sourceCat } = await db.collection('cat').findOne({ _id: sourceIdArg, deleted: { $ne: 1 } });
    const { result: targetCat } = await db.collection('cat').findOne({ _id: targetIdArg, deleted: { $ne: 1 } });

    if (!sourceCat || !targetCat) {
      return { result: false, msg: '猫咪ID无效，未找到对应记录' };
    }

    const sourceRelOrig = Array.isArray(sourceCat.relations) ? sourceCat.relations : [];
    const targetRelOrig = Array.isArray(targetCat.relations) ? targetCat.relations : [];

    let sourceRelNew, targetRelNew;

    if (op === 'add') {
      if (!relationName) return { result: false, msg: '缺少 relation_name' };

      const rules = await loadRules();
      const exists = rules.some(r => r.name === relationName);
      if (!exists) {
        console.error(`关系名[${relationName}]不在规则中。当前规则:`, rules.map(r=>r.name));
        return { result: false, msg: `关系类型[${relationName}]未定义，请先在后台添加` };
      }

      const inverseName = computeInverse(rules, relationName, sourceCat.gender);

      sourceRelNew = upsert(sourceRelOrig, targetIdArg, relationName);
      if (inverseName) {
        targetRelNew = upsert(targetRelOrig, sourceIdArg, inverseName);
      } else {
        targetRelNew = targetRelOrig;
      }

    } else if (op === 'remove') {
      sourceRelNew = removeRel(sourceRelOrig, targetIdArg);
      targetRelNew = removeRel(targetRelOrig, sourceIdArg);
    } else if (op === 'update') {
      if (!relationName) return { result: false, msg: '缺少 relation_name' };
      const rules = await loadRules();
      const exists = rules.some(r => r.name === relationName);
      if (!exists) {
        console.error(`关系名[${relationName}]不在规则中。当前规则:`, rules.map(r=>r.name));
        return { result: false, msg: `关系类型[${relationName}]未定义，请先在后台添加` };
      }
      const inverseName = computeInverse(rules, relationName, sourceCat.gender);
      sourceRelNew = upsert(sourceRelOrig, targetIdArg, relationName);
      if (inverseName) {
        targetRelNew = upsert(targetRelOrig, sourceIdArg, inverseName);
      } else {
        targetRelNew = targetRelOrig;
      }
    } else {
      return { result: false, msg: `未知操作: ${op}` };
    }

    console.log('正在更新本猫：', sourceCat._id, 'Relations:', sourceRelNew.length);
    await db.collection('cat').updateOne({ _id: sourceCat._id }, { $set: { relations: sourceRelNew } });

    try {
      console.log('更新目标对象:', targetCat._id, 'Relations:', targetRelNew.length);
      await db.collection('cat').updateOne({ _id: targetCat._id }, { $set: { relations: targetRelNew } });
    } catch (err2) {
      console.error('目标对象更新失败，回滚到：', err2);
      await db.collection('cat').updateOne({ _id: sourceCat._id }, { $set: { relations: sourceRelOrig } });
      return { result: false, msg: '写入目标猫失败，已回滚', error: String(err2) };
    }

    return {
      result: true,
      msg: op === 'add' ? '添加成功' : (op === 'update' ? '编辑成功' : '删除成功'),
      data: { source_id: sourceIdArg, target_id: targetIdArg }
    };

  } catch (error) {
    console.error('关系编辑失败', error);
    return { result: false, msg: '关系操作失败', error: error.message || String(error) };
  }
};
