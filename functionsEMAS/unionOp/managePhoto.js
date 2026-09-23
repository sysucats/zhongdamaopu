const { createInternalCtx } = require('./_helper.js')
const isManagerHandler = require('./isManager.js')
const deleteFilesHandler = require('./deleteFiles.js')
const deleteCosFilesHandler = require('./deleteCosFiles.js')

module.exports = async (ctx) => {
  const is_manager = await isManagerHandler(createInternalCtx(ctx, {
    openid: ctx.args.openid,
    req: 1
  }))
  if (!is_manager) {
    return {
      msg: 'not a manager',
      result: false
    };
  }
  const photo = ctx.args.photo;
  const opType = ctx.args.type;
  if (opType === undefined) {
    return "empty type";
  }

  // 写入审核记录（回溯用，所有管理员可见）
  async function writeCheckLog(photoDoc, action, extra) {
    try {
      await ctx.mpserverless.db.collection('photo_check_log').insertOne({
        photo_id: photoDoc._id,
        cat_id: photoDoc.cat_id || '',
        uploader_openid: photoDoc._openid || '',
        photographer: photoDoc.photographer || '',
        action: action, // pass | best | delete | transfer
        thumb: photoDoc.photo_compressed || photoDoc.photo_id || '',
        manager_openid: ctx.args.openid,
        check_time: new Date(),
        ...(extra || {}),
      });
    } catch (e) {
      // 写日志失败不阻断审核主流程
      console.error('[managePhoto] - writeCheckLog fail:', e);
    }
  }

  // 审核记录查询（管理员，分页）
  if (opType === "history") {
    const skip = ctx.args.skip || 0;
    const limit = Math.min(ctx.args.limit || 20, 100);
    try {
      const { result: total } = await ctx.mpserverless.db.collection('photo_check_log').count({});
      const { result: list } = await ctx.mpserverless.db.collection('photo_check_log').find({}, {
        sort: { check_time: -1 },
        skip: skip,
        limit: limit,
      });
      return { msg: '获取成功', result: true, data: { list: list || [], total: total || 0 } };
    } catch (error) {
      // photo_check_log 集合可能尚未创建（没有任何审核记录时）
      return { msg: '获取成功', result: true, data: { list: [], total: 0 } };
    }
  }

  if (photo === undefined) {
    return "empty photo";
  }

  // 重新计算精选照片数量的函数
  async function recountBestPhotos(cat_id) {
    try {
      // 计算该猫的精选照片数量
      const { result: count } = await ctx.mpserverless.db.collection('photo').count({
        cat_id: cat_id,
        verified: true,
        best: true
      });
      
      // 更新猫的数据
      await ctx.mpserverless.db.collection('cat').updateOne({
        _id: cat_id
      }, {
        $set: {
          photo_count_best: count
        }
      });
      return count;
    } catch (error) {
      console.error('重新计算精选照片数量失败:', error);
      throw error;
    }
  }
  
  // 更新猫的最新照片时间
  async function updateMphoto(cat_id) {
    const today = new Date();
    return await ctx.mpserverless.db.collection('cat').updateOne({
      _id: cat_id
    }, {
      $set: {
        mphoto: today
      }
    });
  }

  if (opType == "check") {
    const best = ctx.args.best;
    await ctx.mpserverless.db.collection('photo').updateOne({
      _id: photo._id
    }, {
      $set: {
        verified: true,
        best: best,
        manager: ctx.args.openid,
        check_time: new Date()
      }
    });
    await writeCheckLog(photo, best ? 'best' : 'pass');

    // 更新猫的最新照片时间
    await updateMphoto(photo.cat_id);

    // 重新计算精选照片数量
    await recountBestPhotos(photo.cat_id);
  } else if (opType == "delete") {
    // 记录照片是否是精选
    const wasBest = photo.best;
    
    if (photo.photo_file_id) {
      var photoIDs = [photo.photo_file_id];
      if (photo.photo_compressed_id) {
        photoIDs.push(photo.photo_compressed_id);
        photoIDs.push(photo.photo_watermark_id);
      }
      await deleteFilesHandler(createInternalCtx(ctx, {
        photoIDs: photoIDs
      }));
    } else {
      var photoUrls = [photo.photo_id];
      if (photo.photo_compressed) {
        photoUrls.push(photo.photo_compressed);
        photoUrls.push(photo.photo_watermark);
      }
      await deleteCosFilesHandler(createInternalCtx(ctx, {
        photoUrls: photoUrls
      }));
    }
    await ctx.mpserverless.db.collection('photo').deleteOne({
      _id: photo._id
    });
    await writeCheckLog(photo, 'delete');

    // 如果删除的是精选照片，重新计算精选照片数量
    if (wasBest) {
      await recountBestPhotos(photo.cat_id);
    }
  } else if (opType == "setBest") {
    const best = ctx.args.best;
    
    // 获取照片当前状态
    const { result: currentPhoto } = await ctx.mpserverless.db.collection('photo').findOne({
      _id: photo._id
    });
    
    // 只有状态发生变化时才更新
    if (currentPhoto.best !== best) {
      await ctx.mpserverless.db.collection('photo').updateOne({
        _id: photo._id
      }, {
        $set: {
          best: best
        }
      });
      
      // 重新计算精选照片数量
      await recountBestPhotos(photo.cat_id);
    }
  } else if (opType == 'setPher') {
    const photographer = ctx.args.photographer;
    if (photo.photographer == photographer) {
      return "same";
    }
    if (photo.photo_compressed && photo.photo_id != 'deleted') {
      // 如果原图没有删掉，那么就删除压缩图和水印图
      var photoIDs = [photo.photo_compressed, photo.photo_watermark];
      if (photo.photo_compressed_id) {
        photoIDs.push(photo.photo_compressed_id);
        photoIDs.push(photo.photo_watermark_id);
        await deleteFilesHandler(createInternalCtx(ctx, {
          photoIDs: photoIDs
        }));
      } else {
        await deleteCosFilesHandler(createInternalCtx(ctx, {
          photoUrls: photoIDs
        }));
      }
    }
    // 把水印和压缩图的链接去掉
    await ctx.mpserverless.db.collection('photo').updateOne({
      _id: photo._id
    }, {
      $set: {
        photographer: photographer,
        photo_compressed: '',
        photo_watermark: ''
      }
    });
  } else if (opType == 'transfer') {
    // 转移照片到另一只猫
    const target_cat_id = ctx.args.target_cat_id;
    if (!target_cat_id) {
      return "empty target_cat_id";
    }
    if (photo.cat_id === target_cat_id) {
      return "same cat";
    }

    // 校验目标猫存在
    const { result: targetCat } = await ctx.mpserverless.db.collection('cat').findOne({
      _id: target_cat_id
    });
    if (!targetCat || targetCat.deleted === 1) {
      return "target cat not found";
    }

    const source_cat_id = photo.cat_id;
    await ctx.mpserverless.db.collection('photo').updateOne({
      _id: photo._id
    }, {
      $set: {
        cat_id: target_cat_id,
        manager: ctx.args.openid
      }
    });
    await writeCheckLog(photo, 'transfer', { target_cat_id: target_cat_id, target_cat_name: targetCat.name || '' });

    // 重新计算两只猫的精选照片数量
    await recountBestPhotos(source_cat_id);
    await recountBestPhotos(target_cat_id);

    // 更新目标猫的最新照片时间
    await updateMphoto(target_cat_id);
  } else if (opType == 'setProcess') {
    // 修改数据库中记录的压缩图、水印图的URL
    const compressed = ctx.args.compressed;
    const compressedId = ctx.args.compressedId;
    const watermark = ctx.args.watermark;
    const watermarkId = ctx.args.watermarkId;
    const res = await ctx.mpserverless.db.collection('photo').updateOne({
      _id: photo._id
    }, {
      $set: {
        photo_compressed: compressed,
        photo_compressed_id: compressedId,
        photo_watermark: watermark,
        photo_watermark_id: watermarkId
      }
    });
  } else {
    return "Unknown type";
  }
}
