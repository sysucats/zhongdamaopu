import cloud from '@lafjs/cloud'

type WeightedDict = { [key: string]: number };

function randomPickWithWeight(weightedDict: WeightedDict): string {
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

function randomPick(arr: any[]): any {
  const randomIndex = Math.floor(Math.random() * arr.length); // 生成一个0到数组长度之间的随机整数
  return arr[randomIndex]; // 返回随机选中的元素
}


function _getProbs(levels: Array<string> | undefined, badgeLevelDict: Object) {
  const probs = { S: 1, A: 9, B: 30, C: 60 };
  let res = {};
  for (const key of levels) {
    if (badgeLevelDict[key] === undefined) {
      continue;
    }
    res[key] = probs[key];
  }
  return res;
}


// 抽取badge
export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.2";
  }
  // 抽取的个数
  let count: number = ctx.body.count;
  // 抽取的原因
  let reason: string = ctx.body.reason;
  // 使用的兑换码
  const badgeCode: number = ctx.body.badgeCode;
  // 兑换的范围
  let badgeLevel: Array<string> = ['S', 'A', 'B', 'C'];
  // 当前用户
  const openid: string = ctx.user?.openid;

  const db = cloud.database();

  // 如果有使用兑换码，那按照它指定的数量来获取
  if (badgeCode != undefined) {
    const codeItems: any = (await db.collection('badge_code').where({ code: badgeCode }).limit(1).get()).data;
    if (codeItems.length === 0) {
      return { ok: false, msg: "兑换码无效" };
    }
    const codeItem = codeItems[0];
    if (!codeItem.isValid || codeItem.useTime != null || (new Date()).getTime() > (new Date(codeItem.validTime)).getTime()) {
      return { ok: false, msg: "兑换码无效" };
    }
    count = codeItem.badgeCount;
    badgeLevel = codeItem.badgeLevel.split("");
    reason = `code-${badgeCode}`;
  }

  // 获取徽章配置
  const badgeDefCount = (await db.collection('badge_def').count()).total;
  let badgeDef = [];
  while (badgeDef.length < badgeDefCount) {
    const tmp = (await db.collection('badge_def').skip(badgeDef.length).get()).data;
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
  console.log(levelProbs);

  if (!Object.keys(levelProbs).length) {
    console.log(badgeLevel, badgeLevelDict);
    return { ok: false, msg: "no badge or probs" };
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
      await db.collection('badge').add(badge);
    }

    badges.push(badge);
  }

  // 修改兑换码
  if (badgeCode != undefined) {
    await db.collection('badge_code').where({ code: badgeCode }).update({
      useTime: new Date(),
      useOpenid: openid,
    });
  }

  console.log(badges);

  return { ok: true, badges: badges };
}