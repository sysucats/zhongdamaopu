module.exports = async (ctx) => {
  let count = ctx.args.count;
  let reason = ctx.args.reason;
  const badgeCode = ctx.args.badgeCode;
  let badgeLevel = ['S', 'A', 'B', 'C'];
  const openid = ctx.args.openid;

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

  let badgeLevelDict = {};
  for (const b of badgeDef) {
    if (badgeLevelDict[b.level] === undefined) {
      badgeLevelDict[b.level] = [];
    }
    badgeLevelDict[b.level].push(b);
  }

  const levelProbs = _getProbs(badgeLevel, badgeLevelDict);

  if (!Object.keys(levelProbs).length) {
    return {
      ok: false,
      msg: "no badge or probs"
    };
  }

  let badges = [];
  while (badges.length < count) {
    const level = randomPickWithWeight(levelProbs);
    const badgeType = randomPick(badgeLevelDict[level]);
    const badge = {
      badgeDef: badgeType._id,
      _openid: openid,
      acquireTime: new Date(),
      catId: null,
      reason: reason,
    }
    if (openid) {
      await ctx.mpserverless.db.collection('badge').insertOne(badge);
    }

    badges.push(badge);
  }

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
  const candidates = Object.keys(weightedDict);
  const weights = Object.values(weightedDict);
  const totalWeight = weights.reduce((acc, cur) => acc + cur, 0);
  const randomWeight = Math.random() * totalWeight;
  let weightSum = 0;

  for (let i = 0; i < candidates.length; i++) {
    weightSum += weights[i];
    if (randomWeight < weightSum) {
      return candidates[i];
    }
  }

  return candidates[candidates.length - 1];
}

function randomPick(arr) {
  const randomIndex = Math.floor(Math.random() * arr.length);
  return arr[randomIndex];
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
