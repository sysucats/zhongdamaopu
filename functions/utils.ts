// 获取n天前的Date对象
export function getNDaysAgo(n: number): Date {
  const today = new Date();
  const ago = new Date(today.getTime());
  ago.setDate(today.getDate() - n);
  return ago;
}

// 获取字典里value排名top n的内容
export function getDictTopN(dict: { [key: string]: number }, n: number): { [key: string]: number } {
  const entries = Object.entries(dict);
  entries.sort((a, b) => b[1] - a[1]);
  const topN = entries.slice(0, n);
  return Object.fromEntries(topN);
}

export default async function (ctx: FunctionContext) {
  const { body } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  return null;
}