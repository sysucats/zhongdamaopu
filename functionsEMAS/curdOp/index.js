// 操作对应collection需要的等级
const permissionNeed = {
    "add": {
        "badge_def": 2,
        "cat": 2,
        "comment": 0,
        "feedback": 0,
        "inter": 0,
        "news": 3,
        "photo": 0,
        "photo_rank": 3,
        "badge_code": 99,
        "rating": 0,
        "reward": 3,
        "science": 3,
        "setting": 3,
        "user": 0,
        "vaccine": 2,
    },
    "update": {
        "badge_def": 2,
        "cat": 2,
        "comment": 1,
        "feedback": 1,
        "inter": 1,
        "news": 1,
        "photo": 1,
        "photo_rank": 1,
        "badge_code": 3,
        "rating": 1,
        "reward": 1,
        "science": 1,
        "setting": 99,
        "user": 1,
        "vaccine": 2,
    },
    "remove": {
        "badge_def": 2,
        "cat": 99,
        "comment": 1,
        "feedback": 1,
        "inter": 1,
        "news": 1,
        "photo": 1,
        "photo_rank": 1,
        "badge_code": 99,
        "rating": 99,
        "reward": 99,
        "science": 99,
        "setting": 99,
        "user": 1,
        "vaccine": 2,
    },
    "set": {
        "badge_def": 2,
        "cat": 2,
        "comment": 1,
        "feedback": 1,
        "inter": 1,
        "news": 1,
        "photo": 1,
        "photo_rank": 1,
        "badge_code": 99,
        "rating": 99,
        "reward": 1,
        "science": 1,
        "setting": 1,
        "user": 1,
        "vaccine": 2,
    },
    "inc": {
        "badge_def": 2,
        "cat": 0,
        "comment": 1,
        "feedback": 1,
        "inter": 1,
        "news": 1,
        "photo": 0,
        "photo_rank": 1,
        "badge_code": 99,
        "rating": 99,
        "reward": 1,
        "science": 1,
        "setting": 99,
        "user": 1,
        "vaccine": 99,
    },
    "read": {
        "badge_code": 3,
        "vaccine": 0,
    }
}

// 允许创建者操作（user.openid == doc._openid）
const permissionAuthor = {
    "add": {},
    "update": {
        "feedback": true,
        "rating": true,
    },
    "remove": {
        "comment": true
    },
    "set": {},
    "inc": {},
    "read": {},
}

module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.1";
  }

    const openid = ctx.args?.openid
    if (!openid) {
        return;
    }
    const collection = ctx.args?.collection
    if (!collection) {
        return "no collection name.";
    }
    const operation = ctx.args?.operation;  // DB 操作 ["add", "update", "remove", "set", "inc", "read"]
    const permissionLevel = permissionNeed[operation][collection];  // 操作要求的最低权限
    if (permissionLevel === undefined) {
        return { errMsg: 'unk req.', ok: false };;
    }
    const item_id = ctx.args?.item_id;
    var data = ctx.args?.data;

    // 检查权限
    if (permissionLevel) {
        const allowAuthor = permissionAuthor[operation][collection];
        const permission = await check_permission(collection, item_id, openid, permissionLevel, allowAuthor);
        if (!permission) {
            return { errMsg: 'not a manager', ok: false };
        }
    }

    if (operation == "add") {  // 添加记录
        // Laf云不会主动存储 _openid ，但是微信云（在前端直接往数据库增加记录时）会
        // 前端可能需要跟据 _openid 字段进行数据库搜索，故手动保存
        if (openid) {
            data._openid = openid;
        }
        data.create_date = new Date();
        data.mdate = data.mdate || new Date();
        return await ctx.mpserverless.db.collection(collection).insertOne(data);
    }
    else if (operation == "update") {  // 更新记录
        data.mdate = new Date();
        return await ctx.mpserverless.db.collection(collection).updateOne({ _id: item_id }, { $set: data })
    }
    else if (operation == "remove") {  // 移除记录
        if (collection == "news") {  // 删除公告关联的图片和封面
            await delete_photo_for_news(item_id);
        }
        return await ctx.mpserverless.db.collection(collection).deleteOne({ _id: item_id });
    }
    else if (operation == "set") {  // 创建记录
        return await ctx.mpserverless.db.collection(collection).findOneAndUpdate({ _id: item_id }, { $set: data })
    }
    else if (operation == "inc") {  // +1 操作
        const type = ctx.args.type;  // 下策
        // const _ = db.command;
        if (type == "pop") {
            return await ctx.mpserverless.db.collection(collection).updateOne({ _id: item_id }, { $inc: { popularity: 1 } })
        }
        else if (type == "like") {
            return await ctx.mpserverless.db.collection(collection).updateOne({ _id: item_id }, { $inc: { like_count: 1 } })
        }
        else {
            return { errMsg: `unk type ${type}`, ok: false };
        }
    }
    else if (operation == "read") {
        const { skip, limit, projection } = ctx.args;
        const { result } = await ctx.mpserverless.db.collection(collection).find({}, { skip, sort: { genTime: -1 }, limit, projection })
        return result;
    }
    else {
        return { errMsg: `unk operation ${operation}`, ok: false };
    }

    // 权限检查
    async function check_permission(collection, item_id, openid, level, allowAuthor) {
        // 是否满足管理员等级
        if (await ctx.mpserverless.function.invoke('isManager', { openid: openid, req: level })) {
            return true
        }

        // 是否允许创建者修改
        var res = false;
        if (allowAuthor) {
            const { result: item } = await ctx.mpserverless.db.collection(collection).findOne({ _id: item_id });
            return item._openid === openid;
        }
        return res;
    }

    // 删除图片
    async function delete_photo_for_news(item_id) {
        let { result: item } = await ctx.mpserverless.db.collection('news').findOne({ _id: item_id });
        // 删除云储存的图片
        if (item.coverPathId) {
            var photoIDs = [item.coverPathId];
            if (item.photosPathId.length > 0) {
                photoIDs.concat(item.photosPathId);
            }
            await ctx.mpserverless.function.invoke("deleteFiles", { photoIDs: photoIDs });
        } else {
            var photoUrls = [item.coverPath];
            if (item.photosPath.length > 0) {
                photoUrls.concat(item.photosPath);
            }
            await ctx.mpserverless.function.invoke("deleteCosFiles", { photoUrls: photoUrls });
        }
    }
}

