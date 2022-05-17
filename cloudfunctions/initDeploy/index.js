const cloud = require('wx-server-sdk');
const CloudBase = require('@cloudbase/manager-node');
const manager = CloudBase.init({
  envId: cloud.DYNAMIC_CURRENT_ENV // 云环境 ID，可在腾讯云-云开发控制台获取
})

// 初始化 cloud
cloud.init({env: cloud.DYNAMIC_CURRENT_ENV})
const db = cloud.database()

// 初始数据库
async function initDatabase(event) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID;
  const coll_name = event.collection;

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
}

// 初始化云函数
async function initFunc(event) {
  const func_name = event.func_name;
  const config = event.config;

  config.name = func_name;

  // if (func_name == "imProcess") {
  //   var layer = await imProcess_deploy();
  //   config.layers = [layer];
  // }

  console.log(func_name, config);

  await manager.functions.updateFunctionConfig(config);
  await manager.functions.createFunctionTriggers(func_name, config.triggers);
  return ;
}

// 初始化imProcess层
async function imProcess_deploy() {
  var layer_name = "imProcess_node_module_v2";
  var local_path = `${__dirname}/${layer_name}.zip`;
  const layers = (await manager.functions.listLayers({searchKey: layer_name})).Layers;

  console.log(layers);

  // 删掉旧的版本
  for (const layer of layers) {
    await functions.deleteLayerVersion({
      name: layer.LayerName,
      version: layer.LayerVersion
    })
  }

  // 新建层
  await manager.functions.createLayer({
    name: layer_name,
    contentPath: local_path,
    runtimes: ["Nodejs12.16"]
  })

  const layer = (await manager.functions.listLayers({searchKey: layer_name}))[0];
  
  return {
    name: layer.LayerName,
    version: layer.LayerVersion
  }
}

exports.main = async (event, context) => {
  if (event.deploy_test === true) {
    // 进行部署检查
    return;
  }

  const op_type = event.type;

  if (op_type == "init_db") {
    await initDatabase(event);
    return 0;
  } else if (op_type == "init_func") {
    await initFunc(event);
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
