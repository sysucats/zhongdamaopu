module.exports = async function (ctx) {
  const db = ctx.mpserverless.db;

  let campuses = [], colours = [], areas = [];
  try {
    const setting = await db.collection('setting').find({ _id: 'filter' });
    if (setting?.result && setting.result.length > 0) {
      const filterSetting = setting.result[0];
      campuses = filterSetting.campuses || [];
      colours = filterSetting.colour || [];
      areas = filterSetting.area || [];
    }
  } catch (error) {
    console.error('获取 Setting 配置时出错:', error);
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const currentCatsQf = {
    adopt: { $ne: 1 },
    to_star: { $ne: true },
    missing: { $ne: true },
    deleted: { $ne: 1 }
  };

  const [
    numAllCatsRes,
    numSterilizedRes,
    numAdoptedRes,
    numCurrentCatsRes,
    numMissingRes,
    numDeceasedRes,
    numCurrentSterilizedRes,
    genderStats,
    monthData
  ] = await Promise.all([
    db.collection('cat').count({ deleted: { $ne: 1 } }),
    db.collection('cat').count({ sterilized: true, deleted: { $ne: 1 } }),
    db.collection('cat').count({ adopt: 1, deleted: { $ne: 1 } }),
    db.collection('cat').count(currentCatsQf),
    db.collection('cat').count({ missing: true, deleted: { $ne: 1 } }),
    db.collection('cat').count({ to_star: true, deleted: { $ne: 1 } }),
    db.collection('cat').count({ ...currentCatsQf, sterilized: true }),
    getGenderStats(db),
    getMonthData(db, monthStart)
  ]);

  const [campusStats, colourStats] = await Promise.all([
    getCampusStats(db, campuses, areas, monthStart),
    getColourStats(db, colours)
  ]);

  const totalCats = numAllCatsRes.result || 0;
  const sterilizationRate = calculateRate(numSterilizedRes.result || 0, totalCats);
  const currentSterilizationRate = calculateRate(numCurrentSterilizedRes.result || 0, numCurrentCatsRes.result || 0);
  const adoptionRate = calculateRate(numAdoptedRes.result || 0, totalCats);

  const stats = {
    basic: {
      total: totalCats,
      sterilized: numSterilizedRes.result || 0,
      missing: numMissingRes.result || 0,
      adopted: numAdoptedRes.result || 0,
      deceased: numDeceasedRes.result || 0,
      current: numCurrentCatsRes.result || 0,
      currentSterilized: numCurrentSterilizedRes.result || 0
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

  const debugInfo = buildDebugInfo(stats);

  return {
    success: true,
    data: stats,
    debug: debugInfo
  };
}

async function getGenderStats(db) {
  const [numMaleRes, numFemaleRes, unknownCatsRes] = await Promise.all([
    db.collection('cat').count({ gender: '公', deleted: { $ne: 1 } }),
    db.collection('cat').count({ gender: '母', deleted: { $ne: 1 } }),
    db.collection('cat').find({ $or: [
      { gender: { $exists: false } },
      { gender: '未知' }
    ], deleted: { $ne: 1 } }, { field: { name: 1 } })
  ]);

  const numMale = numMaleRes.result || 0;
  const numFemale = numFemaleRes.result || 0;
  const unknownCats = unknownCatsRes.result || [];
  const totalCats = numMale + numFemale + unknownCats.length;

  return {
    male: {
      count: numMale,
      rate: calculateRate(numMale, totalCats)
    },
    female: {
      count: numFemale,
      rate: calculateRate(numFemale, totalCats)
    },
    unknown: {
      count: unknownCats.length,
      rate: calculateRate(unknownCats.length, totalCats),
      cats: unknownCats.map(cat => cat.name || '未命名')
    }
  };
}

async function getCampusStats(db, campuses, areas, monthStart) {
  return Promise.all(
    campuses.map(async campus => {
      const campusAreas = areas.filter(area => area.campus === campus);

      const [totalRes, sterilizedRes] = await Promise.all([
        db.collection('cat').count({ campus, deleted: { $ne: 1 } }),
        db.collection('cat').count({ campus, sterilized: true, deleted: { $ne: 1 } })
      ]);

      const total = totalRes.result || 0;
      const sterilized = sterilizedRes.result || 0;

      const areaStats = await Promise.all(
        campusAreas.map(area => getAreaStats(db, area, monthStart))
      );

      return {
        campus,
        count: total,
        sterilized: sterilized,
        sterilizationRate: calculateRate(sterilized, total),
        areas: areaStats
      };
    })
  );
}

async function getAreaStats(db, area, monthStart) {
  const areaName = area.name;
  const campus = area.campus;

  const allCatsRes = await db.collection('cat').find({ campus, area: areaName, deleted: { $ne: 1 } }, {
    field: {
      sterilized: true,
      adopt: true,
      missing: true,
      to_star: true,
      sterilized_time: true,
      missing_time: true,
      deceased_time: true,
      gender: true,
      create_time: true
    }
  });

  const cats = allCatsRes.result || [];
  const total = cats.length;
  const sterilizedCats = cats.filter(cat => cat.sterilized);

  const maleCount = cats.filter(cat => cat.gender === '公').length;
  const femaleCount = cats.filter(cat => cat.gender === '母').length;
  const unknownCount = cats.filter(cat => cat.gender === '未知').length;

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

async function getColourStats(db, colours) {
  return Promise.all(
    colours.map(async colour => {
      const totalRes = await db.collection('cat').count({ colour, deleted: { $ne: 1 } });
      return {
        colour,
        count: totalRes.result || 0
      };
    })
  );
}

function calculateTNRIndex(allCats, sterilizedCats, monthStart) {
  const WEIGHTS = {
    BASE_SCORE: 0.4,
    GROWTH_RATE: 0.4,
    ADOPTION_RATE: 0.3,
    SURVIVAL_RATE: 0.2,
    REGISTRATION_RATE: 0.1
  };

  let N = 0, D = 0, M = 0;
  let totalD = 0, totalM = 0;

  const currentAliveSterilizedCats = sterilizedCats.filter(cat =>
    cat.adopt !== 1 &&
    !cat.missing &&
    !cat.to_star
  );

  const currentAliveNonAdoptedCats = allCats.filter(cat =>
    cat.adopt !== 1 &&
    !cat.missing &&
    !cat.to_star
  );

  N = allCats.filter(cat =>
    cat.create_time &&
    new Date(cat.create_time) >= new Date(monthStart)
  ).length;

  const nonAdoptedCats = allCats.filter(cat => cat.adopt !== 1);
  nonAdoptedCats.forEach(cat => {
    if (cat.to_star === true) {
      totalD++;
      if (cat.deceased_time && new Date(cat.deceased_time) >= new Date(monthStart)) {
        D++;
      }
    } else if (cat.missing === true) {
      totalM++;
      if (cat.missing_time && new Date(cat.missing_time) >= new Date(monthStart)) {
        M++;
      }
    }
  });

  const totalCats = Math.max(allCats.length, 1);
  const totalNonAdoptedCount = Math.max(nonAdoptedCats.length, 1);

  const sterilizationRate = calculateRate(sterilizedCats.length, totalCats);
  const netSterilizationRate = currentAliveNonAdoptedCats.length > 0
    ? calculateRate(currentAliveSterilizedCats.length, currentAliveNonAdoptedCats.length)
    : 100;
  const initialCats = nonAdoptedCats.length - N;
  const growthRate = initialCats > 0 ? calculateRate(N - (D + M), initialCats) : 0;
  const survivalRate = 100 - calculateRate(totalD, totalNonAdoptedCount);
  const registrationRate = totalNonAdoptedCount - totalD > 0 ? 100 - calculateRate(totalM, totalNonAdoptedCount - totalD) : 0;
  const adoptionRate = 100 - calculateRate(nonAdoptedCats.length, totalCats);

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

async function getMonthData(db, monthStart) {
  const eventTypes = [
    { type: '新猫', time_field: 'create_time', condition: { create_time: { $gte: monthStart }, deleted: { $ne: 1 } } },
    { type: '绝育', time_field: 'sterilized_time', condition: { sterilized: true, sterilized_time: { $gte: monthStart }, deleted: { $ne: 1 } } },
    { type: '领养', time_field: 'adopt_time', condition: { adopt: 1, adopt_time: { $gte: monthStart }, deleted: { $ne: 1 } } },
    { type: '失踪', time_field: 'missing_time', condition: { missing: true, missing_time: { $gte: monthStart }, deleted: { $ne: 1 } } },
    { type: '喵星', time_field: 'deceased_time', condition: { to_star: true, deceased_time: { $gte: monthStart }, deleted: { $ne: 1 } } }
  ];

  const eventResults = await Promise.all(
    eventTypes.map(async query => {
      const countRes = await db.collection('cat').count(query.condition);

      const detailsRes = await db.collection('cat').find(query.condition, {
        field: { name: 1, _id: 1, [query.time_field]: 1 },
        sort: { [query.time_field]: -1 }
      });

      const details = detailsRes.result || [];
      const events = details.map(cat => ({
        type: query.type,
        date: formatDate(cat[query.time_field]),
        timestamp: cat[query.time_field],
        name: cat.name,
        id: cat._id
      }));

      return {
        type: query.type,
        count: countRes.result || 0,
        events: events
      };
    })
  );

  const stats = {
    newCats: eventResults.find(r => r.type === '新猫').count,
    sterilized: eventResults.find(r => r.type === '绝育').count,
    adopted: eventResults.find(r => r.type === '领养').count,
    missing: eventResults.find(r => r.type === '失踪').count,
    deceased: eventResults.find(r => r.type === '喵星').count
  };

  const allEvents = [].concat(...eventResults.map(r => r.events))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return {
    stats: stats,
    events: allEvents
  };
}

function calculateRate(numerator, denominator) {
  return denominator > 0 ? parseFloat((numerator / denominator * 100).toFixed(1)) : 0;
}

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
