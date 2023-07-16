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


// 抽取badge
export default async function (ctx: FunctionContext) {
  // body, query 为请求参数, user 是授权对象
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }
  // 抽取的个数
  const count: number = ctx.body.count;
  // 抽取的原因
  const reason: number = ctx.body.reason;
  // 当前用户
  const openid: string = ctx.user.openid;

  const db = cloud.database();

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
  const levelProbs = { A: 10, B: 30, C: 60 };

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
    await db.collection('badge').add(badge);

    badges.push(badge);
  }

  return { ok: true, badges: badges };
}