module.exports = async (ctx) => {
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

  async function recountBestPhotos(cat_id) {
    try {
      const { result: count } = await ctx.mpserverless.db.collection('photo').count({
        cat_id: cat_id,
        verified: true,
        best: true
      });

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
        manager: ctx.args.openid
      }
    });

    await updateMphoto(photo.cat_id);

    await recountBestPhotos(photo.cat_id);
  } else if (opType == "delete") {
    const wasBest = photo.best;

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

    if (wasBest) {
      await recountBestPhotos(photo.cat_id);
    }
  } else if (opType == "setBest") {
    const best = ctx.args.best;

    const { result: currentPhoto } = await ctx.mpserverless.db.collection('photo').findOne({
      _id: photo._id
    });

    if (currentPhoto.best !== best) {
      await ctx.mpserverless.db.collection('photo').updateOne({
        _id: photo._id
      }, {
        $set: {
          best: best
        }
      });

      await recountBestPhotos(photo.cat_id);
    }
  } else if (opType == 'setPher') {
    const photographer = ctx.args.photographer;
    if (photo.photographer == photographer) {
      return "same";
    }
    if (photo.photo_compressed && photo.photo_id != 'deleted') {
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
