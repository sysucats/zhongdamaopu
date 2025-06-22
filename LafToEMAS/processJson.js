// js文件代码
const fs = require('fs');
const path = require('path');

// 指定要处理的文件夹路径
const folderPath = path.join(__dirname, 'json'); // 修改为你的JSON文件所在文件夹
const outFolderPath = path.join(__dirname, 'json_processed');

// 确保文件夹存在
if (!fs.existsSync(folderPath)) {
    console.error(`文件夹 ${folderPath} 不存在`);
    process.exit(1);
}

// 获取文件夹中所有的JSON文件
const jsonFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.json'));

if (jsonFiles.length === 0) {
    console.log('没有找到JSON文件');
    process.exit(0);
}

// 处理每个JSON文件
jsonFiles.forEach(jsonFile => {
    try {
        // 读取原始JSON文件
        const filePath = path.join(folderPath, jsonFile);
        const rawData = fs.readFileSync(filePath, 'utf-8');

        // 解析JSON数据
        const jsonData = JSON.parse(rawData);

        // 将每个对象转换为一行JSON字符串
        const processedData = jsonData.map(obj => JSON.stringify(obj)).join('\n');

        // 生成输出文件名
        const fileNameWithoutExt = path.basename(jsonFile, '.json');
        const outputPath = path.join(outFolderPath, `${fileNameWithoutExt}_processed.json`);
        
        // 写入处理后的文件
        fs.writeFileSync(outputPath, processedData);

        console.log(`文件 ${jsonFile} 处理完成，结果已保存到 ${outputPath}`);
    } catch (error) {
        console.error(`处理文件 ${jsonFile} 时出错:`, error.message);
    }
});

console.log('所有文件处理完成');