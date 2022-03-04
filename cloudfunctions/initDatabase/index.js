// 云函数模板
// 部署：在 cloud-functions/login 文件夹右击选择 “上传并部署”

const cloud = require('wx-server-sdk');
const CloudBase = require('@cloudbase/manager-node');
const manager = CloudBase.init({
  envId: cloud.DYNAMIC_CURRENT_ENV // 云环境 ID，可在腾讯云-云开发控制台获取
})

// 初始化 cloud
cloud.init({env: cloud.DYNAMIC_CURRENT_ENV})
const db = cloud.database()

exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return;
  }
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID;

  const op_type = event.type;
  const coll_name = event.collection;

  if (op_type == "init") {
    // 进行初始化
    const init_data = event.init_data;

    // 创建集合
    try {
      const create_res = await db.createCollection(coll_name);
      console.log("create_res", create_res);
    } catch (error) {
      console.log("create_res", coll_name, "existed.");
    }

    // 修改权限
    const { EnvList } = await manager.env.listEnvs();
    console.log(EnvList);
    const EnvId = EnvList[0].EnvId;
    const modify_res = await manager.commonService().call({
      Action: "ModifyDatabaseACL",
      Param: {
        CollectionName: coll_name,
        EnvId: EnvId,
        AclTag: "READONLY"
      }
    });
    console.log("ModifyDatabaseACL", modify_res);

    // 插入初始化数据
    const coll = db.collection(coll_name);

    // 只在数据库为空时进行初始化
    const count = (await coll.count()).total;
    console.log("count", count);
    if (count != 0) {
      return 0;
    }

    // 逐个插入数据
    for (var data of init_data) {
      console.log(data);
      const _id = data._id;
      delete data._id;
      if (coll_name == "user" || coll_name == "fake") {
        // 把当前用户变成管理员
        data = {
          manager: 99,
          openid: openid,
          userInfo: {}
        }
      }

      const add_res = await coll.doc(_id).set({
        data: data
      });
      console.log("add_res", add_res);
    }
    return 0;
  } else if (op_type == "clear") {
    // 清除初始化数据
    // const clear_id = event.clear_id;
    // try {
    //   await db.collection(coll_name).where({
    //     _id: clear_id
    //   }).remove()
    // } catch(e) {
    //   console.error(e)
    // }
    return 0;
  }
}
