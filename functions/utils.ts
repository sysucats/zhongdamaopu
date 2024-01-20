// 获取n天前的Date对象
export function getNDaysAgo(n: number): Date {
  const today = new Date();
  const ago = new Date(today.getTime());
  ago.setDate(today.getDate() - n);
  return ago;
}


export function getDictTopN(dict: { [key: string]: number }, n: number): { [key: string]: number } {
  const entries = Object.entries(dict);
  entries.sort((a, b) => b[1] - a[1]);
  const topN = entries.slice(0, n);
  return Object.fromEntries(topN);
}
