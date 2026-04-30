const { createInternalCtx } = require('./_helper.js')
const isManagerHandler = require('./isManager.js')
const deleteFilesHandler = require('./deleteFiles.js')
const deleteCosFilesHandler = require('./deleteCosFiles.js')

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
    const openid = ctx.args?.openid
    if (!openid) {
        return;
    }
    const collection = ctx.args?.collection
    if (!collection) {
        return "no collection name.";
    }
    const operation = ctx.args?.operation;
    const permissionLevel = permissionNeed[operation][collection];
    if (permissionLevel === undefined) {
        return { errMsg: 'unk req.', ok: false };
    }
    const item_id = ctx.args?.item_id;
    var data = ctx.args?.data;

    if (permissionLevel) {
        const allowAuthor = permissionAuthor[operation][collection];
        const permission = await check_permission(collection, item_id, openid, permissionLevel, allowAuthor);
        if (!permission) {
            return { errMsg: 'not a manager', ok: false };
        }
    }

    if (operation == "add") {
        if (openid) {
            data._openid = openid;
        }
        data.create_date = new Date();
        data.mdate = data.mdate || new Date();
        return await ctx.mpserverless.db.collection(collection).insertOne(data);
    }
    else if (operation == "update") {
        data.mdate = new Date();
        return await ctx.mpserverless.db.collection(collection).updateOne({ _id: item_id }, { $set: data })
    }
    else if (operation == "remove") {
        if (collection == "news") {
            await delete_photo_for_news(item_id);
        }
        return await ctx.mpserverless.db.collection(collection).deleteOne({ _id: item_id });
    }
    else if (operation == "set") {
        return await ctx.mpserverless.db.collection(collection).findOneAndUpdate({ _id: item_id }, { $set: data })
    }
    else if (operation == "inc") {
        const type = ctx.args.type;
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

    async function check_permission(collection, item_id, openid, level, allowAuthor) {
        if (await isManagerHandler(createInternalCtx(ctx, { openid: openid, req: level }))) {
            return true
        }

        var res = false;
        if (allowAuthor) {
            const { result: item } = await ctx.mpserverless.db.collection(collection).findOne({ _id: item_id });
            return item._openid === openid;
        }
        return res;
    }

    async function delete_photo_for_news(item_id) {
        let { result: item } = await ctx.mpserverless.db.collection('news').findOne({ _id: item_id });
        if (item.coverPathId) {
            var photoIDs = [item.coverPathId];
            if (item.photosPathId.length > 0) {
                photoIDs.concat(item.photosPathId);
            }
            await deleteFilesHandler(createInternalCtx(ctx, { photoIDs: photoIDs }));
        } else {
            var photoUrls = [item.coverPath];
            if (item.photosPath.length > 0) {
                photoUrls.concat(item.photosPath);
            }
            await deleteCosFilesHandler(createInternalCtx(ctx, { photoUrls: photoUrls }));
        }
    }
}
