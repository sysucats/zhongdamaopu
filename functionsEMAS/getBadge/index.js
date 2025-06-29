module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  // 抽取的个数
  let count = ctx.args.count;
  // 抽取的原因
  let reason = ctx.args.reason;
  // 使用的兑换码
  const badgeCode = ctx.args.badgeCode;
  // 兑换的范围
  let badgeLevel = ['S', 'A', 'B', 'C'];
  // 当前用户
  const openid = ctx.args.openid;

  // 如果有使用兑换码，那按照它指定的数量来获取
  if (badgeCode != undefined) {
    const {
      result: codeItem
    } = await ctx.mpserverless.db.collection('badge_code').findOne({
      code: badgeCode
    });
    if (!codeItem) {
      return {
        ok: false,
        msg: "兑换码无效"
      };
    }
    if (!codeItem.isValid || codeItem.useTime != null || (new Date()).getTime() > (new Date(codeItem.validTime)).getTime()) {
      return {
        ok: false,
        msg: "兑换码无效"
      };
    }
    count = codeItem.badgeCount;
    badgeLevel = codeItem.badgeLevel.split("");
    reason = `code-${badgeCode}`;
  }
  // 获取徽章配置
  const {
    result: badgeDefCount
  } = await ctx.mpserverless.db.collection('badge_def').count({});
  let badgeDef = [];
  while (badgeDef.length < badgeDefCount) {
    const {
      result: tmp
    } = await ctx.mpserverless.db.collection('badge_def').find({}, {
      skip: badgeDef.length
    });
    badgeDef = badgeDef.concat(tmp);
  }

  // 按照等级来映射一下
  let badgeLevelDict = {};
  for (const b of badgeDef) {
    if (badgeLevelDict[b.level] === undefined) {
      badgeLevelDict[b.level] = [];
    }
    badgeLevelDict[b.level].push(b);
  }

  // 等级随机选取的概率
  const levelProbs = _getProbs(badgeLevel, badgeLevelDict);

  if (!Object.keys(levelProbs).length) {
    return {
      ok: false,
      msg: "no badge or probs"
    };
  }

  // 开始随机
  let badges = [];
  while (badges.length < count) {
    const level = randomPickWithWeight(levelProbs);
    const badgeType = randomPick(badgeLevelDict[level]); // 强行写 2 测试一下
    const badge = {
      badgeDef: badgeType._id,
      _openid: openid,
      acquireTime: new Date(),
      catId: null,
      reason: reason,
    }
    // 写入数据库
    if (openid) {
      await ctx.mpserverless.db.collection('badge').insertOne(badge);
    }

    badges.push(badge);
  }

  // 修改兑换码
  if (badgeCode != undefined) {
    await ctx.mpserverless.db.collection('badge_code').updateOne({
      code: badgeCode
    }, {
      $set: {
        useTime: new Date(),
        useOpenid: openid
      }
    });
  }
  return {
    ok: true,
    badges
  };
}

function randomPickWithWeight(weightedDict) {
  const candidates = Object.keys(weightedDict); // 获取所有候选元素
  const weights = Object.values(weightedDict); // 获取所有权重
  const totalWeight = weights.reduce((acc, cur) => acc + cur, 0); // 计算所有权重的总和
  const randomWeight = Math.random() * totalWeight; // 生成一个0到总权重之间的随机数
  let weightSum = 0;

  for (let i = 0; i < candidates.length; i++) {
    weightSum += weights[i];
    if (randomWeight < weightSum) {
      return candidates[i]; // 返回随机选中的元素
    }
  }

  // 如果没有选中任何元素，则返回最后一个元素
  return candidates[candidates.length - 1];
}

function randomPick(arr) {
  const randomIndex = Math.floor(Math.random() * arr.length); // 生成一个0到数组长度之间的随机整数
  return arr[randomIndex]; // 返回随机选中的元素
}


function _getProbs(levels, badgeLevelDict) {
  const probs = {
    S: 1,
    A: 9,
    B: 30,
    C: 60
  };
  let res = {};
  for (const key of levels) {
    if (badgeLevelDict[key] === undefined) {
      continue;
    }
    res[key] = probs[key];
  }
  return res;
}