import cloud from '@lafjs/cloud'

const funcs = [
  "getPhotoRank",
  "countPhoto",
]

export async function main(ctx: FunctionContext) {
  // body, query 为请求参数, user 是授权对象
  const { body, query } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  for (const fn of funcs) {
    await cloud.invoke(fn);
  }
}