module.exports = async (ctx) => {
  if (ctx.args?.deploy_test === true) {
    // 进行部署检查
    return "v2.0";
  }

  const {
    result: is_manager
  } = await ctx.mpserverless.function.invoke('isManager', {
    openid: ctx.args.openid,
    req: 1
  })
  if (!is_manager) {
    return {
      msg: 'not a manager',
      result: false
    };
  }
  const photo = ctx.args.photo;
  const opType = ctx.args.type;
  if (photo === undefined || opType === undefined) {
    return "empty photo or type";
  }
  if (opType == "check") {
    const best = ctx.args.best;
    await ctx.mpserverless.db.collection('photo').updateOne({
      _id: photo._id
    }, {
      $set: {
        verified: true,
        best: best,
        manager: ctx.args.openid
      }
    });
    updateMphoto(photo.cat_id);
  } else if (opType == "delete") {
    if (photo.photo_file_id) {
      var photoIDs = [photo.photo_file_id];
      if (photo.photo_compressed_id) {
        photoIDs.push(photo.photo_compressed_id);
        photoIDs.push(photo.photo_watermark_id);
      }
      await ctx.mpserverless.function.invoke("deleteFiles", {
        photoIDs: photoIDs
      });
    } else {
      var photoUrls = [photo.photo_id];
      if (photo.photo_compressed) {
        photoUrls.push(photo.photo_compressed);
        photoUrls.push(photo.photo_watermark);
      }
      await ctx.mpserverless.function.invoke("deleteCosFiles", {
        photoUrls: photoUrls
      });
    }
    await ctx.mpserverless.db.collection('photo').deleteOne({
      _id: photo._id
    });
  } else if (opType == "setBest") {
    const best = ctx.args.best;
    // updateMphoto(photo.cat_id);
    await ctx.mpserverless.db.collection('photo').updateOne({
      _id: photo._id
    }, {
      $set: {
        best: best
      }
    });
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
        await ctx.mpserverless.function.invoke("deleteFiles", {
          photoIDs: photoIDs
        });
      } else {
        await ctx.mpserverless.function.invoke("deleteCosFiles", {
          photoUrls: photoIDs
        });
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

  // 所有照片改动之后，重新数一下猫图
  // return (await ctx.mpserverless.function.invoke("countPhoto")).result;

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
}