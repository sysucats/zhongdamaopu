import cloud from '@lafjs/cloud'

function generateCode(segmentLength: number, segmentCount: number, validTime: Date): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 不包含 I 和 O 的字符集
  const codeLength = segmentLength * segmentCount;
  let code = '';
  const segments = [];
  for (let i = 0; i < codeLength; i++) {
    const char = chars.charAt(Math.floor(Math.random() * chars.length));
    code += char;
    if ((i + 1) % segmentLength === 0) {
      segments.push(code);
      code = '';
    }
  }
  const date = formatDate(validTime);
  return `${date}-${segments.join('-')}`;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

function getNthDayLastSecond(currentDate: Date, n: number): Date {
  let targetDate = new Date(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate() + n + 1);
  // UTC转+8区
  targetDate = new Date(targetDate.getTime() - 1 - 8 * 60 * 60 * 1000);

  return targetDate;
}

// 判断只包含SABC四个字符，且只出现一次
function isStringValid(str: string): boolean {
  if (!str) {
    return false;
  }

  const validChars = new Set(['S', 'A', 'B', 'C']);
  const charCount = new Map<string, number>();
  for (const char of str) {
    if (!validChars.has(char)) {
      return false;
    }
    charCount.set(char, (charCount.get(char) || 0) + 1);
    if (charCount.get(char) > 1) {
      return false;
    }
  }
  return true;
}

function isNumGE0(value: any): boolean {
  if (typeof value !== 'number') {
    return false;
  }
  return value >= 0
}


export default async function (ctx: FunctionContext) {
  const { body } = ctx
  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  const { badgeLevel, badgeCount, validDays, genReason, genCount } = body;
  if (!isStringValid(badgeLevel)) {
    return { ok: false, msg: "无效的徽章等级" + badgeLevel };
  }
  if (!isNumGE0(badgeCount)) {
    return { ok: false, msg: "无效的徽章个数" + badgeCount };
  }
  if (!isNumGE0(validDays)) {
    return { ok: false, msg: "无效的有效天数" + validDays };
  }
  if (!isNumGE0(genCount)) {
    return { ok: false, msg: "无效的生成个数" + genCount };
  }

  const genOpenid = ctx.user?.openid;


  let genTime = new Date();
  const genTaskId = generateCode(6, 1, genTime);
  let validTime = getNthDayLastSecond(genTime, validDays > 0 ? validDays : 99999);

  let genCodes = [];
  const db = cloud.database();
  for (let i = 0; i < genCount; i++) {
    genCodes.push({
      code: generateCode(4, 2, validTime),
      genTaskId,
      genCount,
      genTime,
      genReason,
      genOpenid,
      badgeLevel,
      badgeCount,
      validTime,
      isValid: true,
      useTime: null,
      useOpenid: null,
    });
  }
  if (genOpenid) {
    await db.collection('badge_code').add(genCodes, { multi: true });
  }
  console.log(genCodes);
  return { ok: true, genCodes: genCodes }
}