import cloud from '@lafjs/cloud'


import axios from 'axios';
const db = cloud.database();
const _ = db.command;

exports.main = async function (ctx: FunctionContext) {
  // body, query 为请求参数, user 是授权对象
  const { body, query } = ctx

  if (body && body.deploy_test === true) {
    // 进行部署检查
    return "v1.0";
  }

  const access_token = await cloud.invoke('getAccessToken', {});

  // 云调用参数是 template_id 而不是 body.templateId,
  // https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/subscribe-message/subscribeMessage.send.html

  const param = {
    touser: body.touser,
    data: body.data,
    template_id: body.templateId,
    page: body.page
  };
  console.log(param);
    
  try {
    // POST https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=ACCESS_TOKEN
    const result = await axios.post('https://api.weixin.qq.com/cgi-bin/message/subscribe/send',
      param, { params: { access_token: access_token } }
    );
    // console.log("Result:", result);
    return {
      errCode: result.data.errcode,
      errMag: result.data.errmsg
    };
    
  } catch (err) {
    console.log("subscribeMessage.send Error");
    return err;
  }
}
