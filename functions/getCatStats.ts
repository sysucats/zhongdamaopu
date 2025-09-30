import cloud from '@lafjs/cloud'

export default async function (ctx: FunctionContext) {
  const { body } = ctx;

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }
  
  const db = cloud.database();
  const _ = db.command;

  // 获取setting中的配置信息
  let campuses = [], colours = [], areas = [];
  try {
    const setting = await db.collection('setting').doc('filter').get();
    if (setting?.data) {
      campuses = setting.data.campuses || [];
      colours = setting.data.colour || [];
      areas = setting.data.area || [];
    }
  } catch (error) {
    console.error('获取 Setting 配置时出错:', error);
  }

  // 当前时间和本月开始时间
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // 主要查询条件
  const currentCatsQf = {
    adopt: _.neq(1),
    to_star: _.neq(true),
    missing: _.neq(true)
  };

  // 一次性查询所有基础数据
  const [
    numAllCats,
    numSterilized,
    numAdopted,
    numCurrentCats,
    numMissing,
    numDeceased,
    numCurrentSterilized,
    genderStats,
    monthData
  ] = await Promise.all([
    db.collection('cat').count(),
    db.collection('cat').where({ sterilized: true }).count(),
    db.collection('cat').where({ adopt: 1 }).count(),
    db.collection('cat').where(currentCatsQf).count(),
    db.collection('cat').where({ missing: true }).count(),
    db.collection('cat').where({ to_star: true }).count(),
    db.collection('cat').where({ ...currentCatsQf, sterilized: true }).count(),
    getGenderStats(db),
    getMonthData(db, monthStart, _)
  ]);

  // 同时查询校区和花色数据
  const [campusStats, colourStats] = await Promise.all([
    getCampusStats(db, campuses, areas, _, monthStart),
    getColourStats(db, colours)
  ]);

  // 预计算的比率
  const totalCats = numAllCats.total;
  const sterilizationRate = calculateRate(numSterilized.total, totalCats);
  const currentSterilizationRate = calculateRate(numCurrentSterilized.total, numCurrentCats.total);
  const adoptionRate = calculateRate(numAdopted.total, totalCats);

  // 构建统计数据
  const stats = {
    basic: {
      total: totalCats,
      sterilized: numSterilized.total,
      missing: numMissing.total,
      adopted: numAdopted.total,
      deceased: numDeceased.total,
      current: numCurrentCats.total,
      currentSterilized: numCurrentSterilized.total
    },
    rates: {
      sterilization: sterilizationRate,
      currentSterilization: currentSterilizationRate,
      adoption: adoptionRate
    },
    gender: genderStats,
    month: monthData.stats,
    campus: campusStats,
    colour: colourStats,
    events: monthData.events
  };

  // 调试
  const debugInfo = buildDebugInfo(stats);

  return {
    success: true,
    data: stats,
    debug: debugInfo
  };
}

// 获取性别分布数据
async function getGenderStats(db) {
  const [numMale, numFemale, unknownCats] = await Promise.all([
    db.collection('cat').where({ gender: '公' }).count(),
    db.collection('cat').where({ gender: '母' }).count(),
    db.collection('cat').where({ gender: '未知' }).field({ name: 1 }).get()
  ]);

  const totalCats = numMale.total + numFemale.total + unknownCats.data.length;

  return {
    male: {
      count: numMale.total,
      rate: calculateRate(numMale.total, totalCats)
    },
    female: {
      count: numFemale.total,
      rate: calculateRate(numFemale.total, totalCats)
    },
    unknown: {
      count: unknownCats.data.length,
      rate: calculateRate(unknownCats.data.length, totalCats),
      cats: unknownCats.data.map(cat => cat.name || '未命名')
    }
  };
}

// 获取校区分布
async function getCampusStats(db, campuses, areas, _, monthStart) {
  return Promise.all(
    campuses.map(async campus => {
      // 获取该校区下的所有区域
      const campusAreas = areas.filter(area => area.campus === campus);

      // 获取该校区统计
      const [total, sterilized] = await Promise.all([
        db.collection('cat').where({ campus }).count(),
        db.collection('cat').where({ campus, sterilized: true }).count()
      ]);

      // 获取区域统计（并行处理）
      const areaStats = await Promise.all(
        campusAreas.map(area => getAreaStats(db, area, _, monthStart))
      );

      return {
        campus,
        count: total.total,
        sterilized: sterilized.total,
        sterilizationRate: calculateRate(sterilized.total, total.total),
        areas: areaStats
      };
    })
  );
}

// 获取单个区域统计
async function getAreaStats(db, area, _, monthStart) {
  const areaName = area.name;
  const campus = area.campus;

  // 获取区域内所有猫的详细信息
  const allCats = await db.collection('cat')
    .where({ campus, area: areaName })
    .field({
      sterilized: true,
      adopt: true,
      missing: true,
      to_star: true,
      sterilized_time: true,
      missing_time: true,
      deceased_time: true,
      gender: true,
      create_time: true
    })
    .get();

  const cats = allCats.data;
  const total = cats.length;
  const sterilizedCats = cats.filter(cat => cat.sterilized);

  // 统计公猫和母猫数量
  const maleCount = cats.filter(cat => cat.gender === '公').length;
  const femaleCount = cats.filter(cat => cat.gender === '母').length;
  const unknownCount = cats.filter(cat => cat.gender === '未知').length;

  // 计算TNR指数，传入monthStart
  const tnrData = calculateTNRIndex(cats, sterilizedCats, monthStart);

  return {
    area: areaName,
    count: total,
    gender: {
      male: maleCount,
      female: femaleCount,
      unknown: unknownCount
    },
    sterilized: sterilizedCats.length,
    tnrIndex: tnrData.index,
    tnrDetail: tnrData.detail
  };
}

// 获取花色分布
async function getColourStats(db, colours) {
  return Promise.all(
    colours.map(async colour => {
      const total = await db.collection('cat').where({ colour }).count();
      return {
        colour,
        count: total.total
      };
    })
  );
}

// TNR指数算法
function calculateTNRIndex(allCats, sterilizedCats, monthStart) {
  // const now = new Date();

  // 权重配置
  const WEIGHTS = {
    // 基础分权重
    BASE_SCORE: 0.4,

    // 质量分权重
    GROWTH_RATE: 0.4, // 增长率权重
    ADOPTION_RATE: 0.3, // 领养率权重
    SURVIVAL_RATE: 0.2, // 存活率权重
    REGISTRATION_RATE: 0.1 // 在册率权重
  };

  let N = 0, D = 0, M = 0; // N新猫数，D死亡数，M失踪数
  let totalD = 0, totalM = 0; // 总死亡数，总失踪数

  // 筛选出当前存活的已绝育未领养猫
  const currentAliveSterilizedCats = sterilizedCats.filter(cat =>
    cat.adopt !== 1 &&
    !cat.missing &&
    !cat.to_star
  );

  // 筛选出现存猫（总数除去失踪、死亡、领养）
  const currentAliveNonAdoptedCats = allCats.filter(cat =>
    cat.adopt !== 1 &&
    !cat.missing &&
    !cat.to_star
  );

  // 获取本月新增的猫
  N = allCats.filter(cat =>
    cat.create_time &&
    new Date(cat.create_time) >= new Date(monthStart)
  ).length;

  // 统计本月死亡和失踪的猫，以及所有死亡和失踪的猫
  const nonAdoptedCats = allCats.filter(cat => cat.adopt !== 1);
  nonAdoptedCats.forEach(cat => {
    if (cat.to_star === true) {
      totalD++; // 总去世猫数
      if (cat.deceased_time && new Date(cat.deceased_time) >= new Date(monthStart)) {
        D++; // 本月去世猫数
      }
    } else if (cat.missing === true) {
      totalM++; // 总失踪猫数
      if (cat.missing_time && new Date(cat.missing_time) >= new Date(monthStart)) {
        M++; // 本月失踪猫数
      }
    }
  });

  const totalCats = Math.max(allCats.length, 1);
  const totalNonAdoptedCount = Math.max(nonAdoptedCats.length, 1);

  // ------ 计算各项指标 ------
  // 总绝育率
  const sterilizationRate = calculateRate(sterilizedCats.length, totalCats);
  // 计算净绝育率
  const netSterilizationRate = currentAliveNonAdoptedCats.length > 0
    ? calculateRate(currentAliveSterilizedCats.length, currentAliveNonAdoptedCats.length)
    : 100; // 如果没有未领养的猫（100%领养率），则令净绝育率为100%
  // 种群增长率
  const initialCats = nonAdoptedCats.length - N; // 本月初始猫数量
  const growthRate = initialCats > 0 ? calculateRate(N - (D + M), initialCats) : 0;
  // 存活率
  const survivalRate = 100 - calculateRate(totalD, totalNonAdoptedCount);
  // 在册率
  const registrationRate = totalNonAdoptedCount - totalD > 0 ? 100 - calculateRate(totalM, totalNonAdoptedCount - totalD) : 0;
  // 领养率
  const adoptionRate = 100 - calculateRate(nonAdoptedCats.length, totalCats);

  // 分段计算得分
  // 如果领养率为100%，则直接给予最高基础分，不考虑净绝育率
  const baseScore = adoptionRate === 100
    ? 100 * WEIGHTS.BASE_SCORE
    : netSterilizationRate * WEIGHTS.BASE_SCORE;

  const qualityScore = (
    Math.max(0, 100 - growthRate) * WEIGHTS.GROWTH_RATE +
    adoptionRate * WEIGHTS.ADOPTION_RATE +
    survivalRate * WEIGHTS.SURVIVAL_RATE +
    registrationRate * WEIGHTS.REGISTRATION_RATE
  ) * (1 - WEIGHTS.BASE_SCORE);

  const finalScore = Math.min(Math.round(baseScore + qualityScore), 100);

  return {
    index: finalScore,
    detail: {
      sterilization_rate: sterilizationRate.toFixed(1),
      net_sterilization_rate: netSterilizationRate.toFixed(1),
      growth_rate: growthRate.toFixed(1),
      adoption_rate: adoptionRate.toFixed(1),
      survival_rate: survivalRate.toFixed(1),
      registration_rate: registrationRate.toFixed(1),
      base_score: baseScore.toFixed(1),
      quality_score: qualityScore.toFixed(1)
    }
  };
}

// 获取本月数据和最新事件
async function getMonthData(db, monthStart, _) {
  // 定义事件类型和对应字段
  const eventTypes = [
    { type: '新猫', time_field: 'create_time', condition: { create_time: _.gte(monthStart) } },
    { type: '绝育', time_field: 'sterilized_time', condition: { sterilized: true, sterilized_time: _.gte(monthStart) } },
    { type: '领养', time_field: 'adopt_time', condition: { adopt: 1, adopt_time: _.gte(monthStart) } },
    { type: '失踪', time_field: 'missing_time', condition: { missing: true, missing_time: _.gte(monthStart) } },
    { type: '喵星', time_field: 'deceased_time', condition: { to_star: true, deceased_time: _.gte(monthStart) } }
  ];

  // 获取每种事件类型的统计和详细数据
  const eventResults = await Promise.all(
    eventTypes.map(async query => {
      // 获取事件数量
      const count = await db.collection('cat').where(query.condition).count();

      // 获取事件详情
      const details = await db.collection('cat')
        .where(query.condition)
        .field({ name: 1, _id: 1, [query.time_field]: 1 })
        .orderBy(query.time_field, 'desc')
        .get();

      // 格式化事件详情
      const events = details.data.map(cat => ({
        type: query.type,
        date: formatDate(cat[query.time_field]),
        timestamp: cat[query.time_field],
        name: cat.name,
        id: cat._id
      }));

      return {
        type: query.type,
        count: count.total,
        events: events
      };
    })
  );

  // 提取计数统计
  const stats = {
    newCats: eventResults.find(r => r.type === '新猫').count,
    sterilized: eventResults.find(r => r.type === '绝育').count,
    adopted: eventResults.find(r => r.type === '领养').count,
    missing: eventResults.find(r => r.type === '失踪').count,
    deceased: eventResults.find(r => r.type === '喵星').count
  };

  // 合并并排序所有事件
  const allEvents = [].concat(...eventResults.map(r => r.events))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return {
    stats: stats,
    events: allEvents
  };
}

// 计算比率
function calculateRate(numerator, denominator) {
  return denominator > 0 ? parseFloat((numerator / denominator * 100).toFixed(1)) : 0;
}

// 格式化日期
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  return `${(date.getMonth() + 1)}月${date.getDate()}日`;
}

// 调试
function buildDebugInfo(stats) {
  return {
    "总猫数": `${stats.basic.total}只`,
    "已绝育": `${stats.basic.sterilized}只 (${stats.rates.sterilization}%)`,
    "已领养": `${stats.basic.adopted}只 (${stats.rates.adoption}%)`,
    "已失踪": `${stats.basic.missing}只`,
    "去喵星": `${stats.basic.deceased}只`,
    "现存猫数": `${stats.basic.current}只`,
    "现存已绝育": `${stats.basic.currentSterilized}只 (${stats.rates.currentSterilization}%)`,

    "公猫数量": `${stats.gender.male.count}只 (${stats.gender.male.rate}%)`,
    "母猫数量": `${stats.gender.female.count}只 (${stats.gender.female.rate}%)`,
    "未知性别": `${stats.gender.unknown.count}只 (${stats.gender.unknown.rate}%)\n具体猫猫：${stats.gender.unknown.cats.join('、')}`,

    "本月新增": `${stats.month.newCats}只`,
    "本月领养": `${stats.month.adopted}只`,
    "本月绝育": `${stats.month.sterilized}只`,
    "本月失踪": `${stats.month.missing}只`,
    "本月去喵星": `${stats.month.deceased}只`,

    "校区分布": stats.campus.map(campus =>
      `${campus.campus}: ${campus.count}只 (绝育率${campus.sterilizationRate}%)\n` +
      campus.areas.map(area =>
        `  - ${area.area}: ${area.count}只 (绝育率${area.sterilizationRate}%)\n` +
        `    TNR指数: ${area.tnrIndex} [NS:${area.tnrDetail.net_sterilization_rate}, G:${area.tnrDetail.growth_rate}, A:${area.tnrDetail.adoption_rate}, D:${area.tnrDetail.survival_rate}, M:${area.tnrDetail.registration_rate}]`
      ).join('\n')
    ).join('\n\n'),

    "花色分布": stats.colour.map(item =>
      `${item.colour}: ${item.count}只`
    ).join('\n'),

    "最新事件": stats.events.map(event =>
      `${event.date} - ${event.type}: ${event.name}`
    ).join('\n')
  };
} 