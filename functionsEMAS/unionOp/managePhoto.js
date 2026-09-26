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

  // 审核记录查询：直接读 photo 表，不再维护额外的日志集合
  //   verified=true    → 该照片已审核（通过/精选）
  //   manager          → 审核人 openid
  //   check_time       → 审核时间
  // 不区分校区；按 check_time 倒序分页（近期在前）
  if (opType === "history") {
    const skip = ctx.args.skip || 0;
    const limit = Math.min(ctx.args.limit || 20, 100);
    const filter = { verified: true };

    try {
      const { result: total } = await ctx.mpserverless.db.collection('photo').count(filter);
      const { result: rawList } = await ctx.mpserverless.db.collection('photo').find(filter, {
        sort: { check_time: -1 },
        skip: skip,
        limit: limit,
        projection: {
          cat_id: 1, photo_id: 1, photo_compressed: 1,
          _openid: 1, manager: 1, photographer: 1, best: 1, check_time: 1,
        },
      });

      // 统一成前端使用的字段名
      const list = (rawList || []).map(p => ({
        _id: p._id,
        cat_id: p.cat_id,
        thumb: p.photo_compressed || p.photo_id || '',
        uploader_openid: p._openid || '',
        manager_openid: p.manager || '',
        photographer: p.photographer || '',
        action: p.best ? 'best' : 'pass',
        check_time: p.check_time,
      }));

      return { msg: '获取成功', result: true, data: { list: list, total: total || 0 } };
    } catch (error) {
      console.error('[managePhoto] - history fail:', error);
      return { msg: '获取失败', result: false };
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
