// utils/dbHelper.js
const app = getApp();

// 获取所有照片
async function getAllPhotos() {
  try {
    const { result } = await app.mpServerless.db.collection('photo')
      .find({}, {
        fields: ['_id', 'cat_id', 'user_id', 'best', 'create_date', 'photo_compressed', 'photo_watermark', 'verified', 'shooting_date'],
        sort: { create_date: -1 }
      });
    
    return result || [];
  } catch (error) {
    console.error("获取所有照片失败:", error);
    return [];
  }
}

// 获取指定猫猫的所有照片
async function getPhotosByCatId(catId) {
  try {
    const { result } = await app.mpServerless.db.collection('photo')
      .find({ 
        cat_id: catId 
      }, {
        fields: ['_id', 'cat_id', 'user_id', 'best', 'create_date', 'photo_compressed', 'photo_watermark', 'verified', 'shooting_date'],
        sort: { create_date: -1 }
      });
    
    return result || [];
  } catch (error) {
    console.error(`获取猫猫${catId}的照片失败:`, error);
    return [];
  }
}

module.exports = {
  getAllPhotos,
  getPhotosByCatId
};