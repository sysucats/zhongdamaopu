// 暂时不需要用到了

const cloud = require('wx-server-sdk')
const rq = require('request-promise')
const APPID = 'wx5bd705b2bc91c73b';
const COLLNAME = 'setting';
const FIELDNAME = 'accessToken'

cloud.init();
const db = cloud.database()

exports.main = async (event, context) => {
  // 这个东西存在数据库上
  const APPSECRET = (await db.collection(COLLNAME).doc('appSecret').get()).data.key;
  try {
    let res = await rq({
      method: 'GET',
      uri: "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=" + APPID + "&secret=" + APPSECRET,
    });
    res = JSON.parse(res)

    let resUpdate = await db.collection(COLLNAME).doc(FIELDNAME).update({
      data: {
        key: res.access_token
      }
    })
  } catch (e) {
    console.error(e)
  }
}