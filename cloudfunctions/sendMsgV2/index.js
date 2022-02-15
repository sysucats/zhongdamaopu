// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init();
const db = cloud.database();
const _ = db.command;

// 云函数入口函数
exports.main = async (event, context) => {
    try {
        const result = await cloud.openapi.subscribeMessage.send({
            touser: event.touser,
            data: event.data,
            templateId: event.templateId,
            page: event.page
        });
        return result;
    } catch (err) {
        return err;
    }
}