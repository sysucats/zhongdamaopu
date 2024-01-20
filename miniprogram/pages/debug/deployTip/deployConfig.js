import config from "../../../config";

// 用于初始化数据库的默认数据（不要修改！）
const default_init_data_id = "deploy_test";
const default_init_data = [];

// 科普页的默认数据（不要修改！部署完成后，在数据库science中修改）
const init_science = [{
    "_id": "5c83b523099e82833622b7df",
    "cate": "猫咪救助",
    "question": "TNR是什么？",
    "answer": "TNR是Trap Neuter Release的简称，TNR是一种当前国际上普遍认可的流浪动物救助方式。T：Trap指仁慈地诱捕；N：Neuter指绝育以及相关的医疗处理；R：Release指处理之后放归原地。"
  },
  {
    "_id": "5c83b523099e82833622b7e1",
    "cate": "猫咪救助",
    "question": "为什么要对流浪猫进行绝育？",
    "answer": "猫咪的繁殖能力惊人，但小流浪们生存的资源，如水和食物，是有限的。放任猫咪自由繁殖将导致其生存境遇越来越差。或许你会想。平时我们看到的猫咪都生活得挺好的呀，有人喂有人陪着玩，小奶猫一窝一窝的也十分可爱。但是在你看不到的地方，有数量远远大于这些“看似幸福生活”的猫咪经历着饥饿、病痛、甚至虐待。而正是因为流浪猫的寿命短，那些不好的、离开这个世界的，你看不到，但也不代表它们不存在。 对猫咪本身而言，绝育可以降低一些疾病的患病率，例如母猫卵巢囊肿、子宫肌瘤等；以及公猫发情导致的睾丸肿瘤、摄护腺肥大、导致泌尿系统闭塞等疾病。证据表明，绝育后的猫咪一般寿命也会更长。猫有强烈的领地意识，绝育后性格会更温和，可减少打斗造成的伤害。 此外，猫咪作为天然的“猎手”，过多的数量会对周边其他小生物造成威胁，这也是众多环保人士提倡TNR的重要原因之一。在绿草如茵的校园里，鸟类种类繁多，甚至有珍稀物种，为了能让物种多样性维持现阶段的稳定，控制流浪猫的数量也十分重要。 而对城市里具有绝对主导地位的人类来说，猫发情夜嚎扰民、在街道跑窜、受惊后抓伤人的事情也并不少见。即使是本身并没有对流浪猫抱有恶意的人，也会有或多或少的困扰。仅仅是出于善心喂养流浪猫而不绝育的话，反而会造成猫群的聚集，提高繁殖的概率，从而增加流浪猫的数量。当数量多到不可控的地步，在当前的环境下，粗暴的大范围消杀便会不可逆地发生。为了避免矛盾激化到这个地步，我们希望能通过TNR的方式来科学地控制流浪猫的数量。"
  },
  {
    "_id": "5c83b523099e82833622b7e3",
    "cate": "撸猫指南",
    "question": "怎么科学撸猫？",
    "answer": "遇到一只猫咪，不要莽撞地直接上手摸，这样做的结果往往会把猫吓走，或者给你一记猫拳。\n猫咪的嗅觉很灵敏，你可以尝试伸出手指或手，让它靠近你，熟悉你的味道。如果猫咪轻轻地喵喵叫，或者用身体摩擦你，这是一个喜欢的信号，这时候可以尝试抚摸猫咪。\n猫咪的头顶、下巴、背部都是抚摸的安全区域，注意不要从猫咪背后突然下手，或者逆着毛摸哦。\n如果猫咪发出咕噜的声音，意味着它很舒服，你可以继续抚摸；而一旦猫咪尾巴抽动、耳朵变平、甚至开始拍打你的手时，抚摸要立即停止。"
  },
  {
    "_id": "5c83b523099e82833622b7e5",
    "cate": "猫咪喂养",
    "question": "流浪猫建议喂什么？",
    "answer": "第一，猫粮，喂食猫粮方便快捷，营养较全面，选择时需要注意钙磷比、牛磺酸、蛋白质这几个参数，选择质量有保障的品牌。幼猫对营养有额外的需求，建议选购幼猫粮。\n第二，罐头及妙鲜包，市面上多数罐头为零食罐头，可以偶尔喂食，但不宜充当主食食用。\n第三，煮熟的肉，猫咪是肉食动物，但不建议一直食用单一肉类，食物的多样性很重要。\n综上，猫粮是喂流浪猫的首选，请大家根据自己的经济情况进行选择~"
  },
  {
    "_id": "5c83b523099e82833622b7e7",
    "cate": "猫咪喂养",
    "question": "流浪猫不建议喂什么？",
    "answer": "第一类：谷物，猫猫是肉食动物，大米、小麦、玉米等这类谷物对猫猫来说没有任何意义，此外容易引起过敏、肠胃敏感，同理，馒头、饼干也不适用哦。\n第二类：火腿肠，火腿肠的盐分过高，会对猫咪的肾脏造成负担。\n第三类：牛奶，牛奶还有乳糖，大部分猫咪特别是幼猫乳糖不耐受，牛奶可能会导致猫咪腹泻，最好还是选用专用的宠物奶粉，应急时可以使用舒化奶。\n第四类：零食水果类，巧克力等含有可可和咖啡因成分的食品、葡萄干等会引起猫咪中毒甚至肾衰竭。\n第五类，香料类，葱姜蒜、韭菜、香菜等都会破坏猫的红细胞，引起贫血、血尿、呕吐等。第六类，油盐重的剩饭菜，会给猫咪的肠胃和肾脏带来巨大的负担，不利于猫的健康。"
  },
  {
    "_id": "5c83b523099e82833622b7e9",
    "cate": "猫咪领养",
    "question": "领养一只猫有什么要求？",
    "answer": "若要领养猫咪，我们希望你有稳定的住所和工作，养猫前获得家人、房东、同居舍友的同意。为猫咪的健康着想，科学喂养，定期驱虫和免疫，适龄绝育，猫咪生病及时就医，不因任何原因遗弃猫咪。\n此外为了避免坠楼的悲剧，窗台阳台需要封网。定期向救助人反馈猫咪状况，不得私自转赠猫咪。最最重要的是，有一颗爱猫的心。"
  },
  {
    "_id": "5c83b523099e82833622b7eb",
    "cate": "猫咪领养",
    "question": "第一次养猫要准备什么？",
    "answer": "第一，要做好充足的心理准备，一旦养猫，就要对这个小生命负责，猫咪有自己的性格和习性，建议先了解它们，再决定是否养猫；\n第二，需要评估自己的经济实力，养猫是一个长期的支出，日常生活和医疗费用都不是小数目；\n第三，需要确保自己的家人或合租者能够接受猫咪，不要让猫咪成为压力的来源；\n最后，如果做好了以上准备，就可以购置猫咪的用品了，其中必须的包括：猫粮、猫碗、猫窝、猫抓板、猫砂、猫砂盆、猫玩具等，根据需要进行选择吧。"
  },
  {
    "_id": "5c83b523099e82833622b7ed",
    "cate": "猫咪健康",
    "question": "猫咪疫苗是必须的吗？",
    "answer": "一个合格的铲屎肯定希望猫主子能够健健康康的成长，猫咪刚出生时，和人一样，能从母乳中摄取到抗体，然而随着猫咪长大后，这些抗体就会慢慢消失。\n为了阻止这些病毒的袭击，在猫咪2-3个月龄时，便需要给猫咪接种疫苗了。\n目前市面上较常见的疫苗项目为“猫三联”，能够预防三种比较严重的病毒导致的疾病：猫瘟（泛白细胞减少症）、猫鼻气管炎（疱疹病毒）及杯状病毒。"
  },
  {
    "_id": "5c83b523099e82833622b7ef",
    "cate": "猫咪健康",
    "question": "寄生虫知多少？",
    "answer": "猫咪寄生虫分为体内和体外，体外寄生虫是在猫咪皮肤上的，跳蚤、虱子、蜱虫、螨虫, 外出的猫咪会比较容易感染，或者由人类带回家感染猫咪。体外寄生虫会通过猫咪感染人，造成过敏性皮炎，或引发感染其他寄生虫。\n常见的体外驱虫有：大宠爱、福来恩等，滴在猫咪皮肤上驱除寄生虫。猫咪体内寄生虫，很多是接触到被虫卵污染的食物、水或粪便造成的，如蛔虫、球虫、鞭毛虫等。\n绦虫则是由猫咪舔食了感染虫卵的跳蚤造成的。心丝虫是通过蚊子叮咬传播。可以通过服用体内驱虫药如拜耳、海乐妙等进行治疗和预防。寄生虫没有那么可怕，通过定期驱虫、保持环境卫生就能得到很好的效果。"
  },
  {
    "_id": "6af880a55eb278490027e8b16e1554d3",
    "cate": "猫咪救助",
    "question": "遇到小奶猫怎么办？",
    "answer": "见到可爱的小奶猫，总会忍不住想去摸一摸，但是实际上对于流浪猫来说，警惕的猫妈妈在闻到奶猫身上有异味时为了保险起见很有可能会选择抛弃它使它成为小孤儿。除此之外，奶猫的抵抗力差，人手上的细菌病毒也可能会给小奶猫带来危险。 因此，在见到有小奶猫时，第一时间应该看它的状态，如果比较干净，眼睛很少分泌物，体型也并不瘦弱，很有可能猫妈妈只是暂时离开，只需要等待一下是否有猫妈的出现即可。新手要喂养好一只小奶猫的难度非常大，如果不是有经验，建议不要随意触摸或带走小奶猫。 但是，猫妈出现意外的情况也不少见，这时如果你选择要救助孤儿小奶猫，有几点建议可供参考。 1、保暖 新生的小奶猫并不能很好地自己调节体温，可以选择暖宝宝、热水瓶或电热毯等来帮助奶猫保温。但一定要注意温度不能过高，用手感觉不冷不热即可，否则会有脱水的风险。（脱水可以通过轻轻揪起奶猫肚皮看褶皱是否很久才回缩判定） 2、喂食 初生的小奶猫要选择宠物用羊奶粉进行喂养，长大一点后（犬齿比较明显时）用奶泡软猫奶糕进行喂养，再大一点就可以直接喂食猫粮了。在这个过程中，一定要注意多喂温水避免脱水、便秘。在喂奶的时候不能像人类婴儿一样仰头躺着，呛奶发生的感染对于奶猫来说是致命的，应轻轻揪起后脖颈，抬起下巴喂养。 3、帮助排泄 小奶猫并不会自己排泄，在有猫妈的时候，猫妈是通过舔舐幼猫肛门和肚子帮助排泄的。因此人工喂养时也应模仿，用温水浸湿了的纸巾轻轻擦拭奶猫屁屁，一般有效刺激3到5秒就会有成效。"
  },
  {
    "_id": "6af880a55eb278880027ee4a66bfa05b",
    "cate": "猫咪救助",
    "question": "遇到病猫，我能做些什么？",
    "answer": "在遇到病猫时，如果是没有经验的人，最好的方式是联系当地的动保社会组织，告知地点和基本情况之后留下联系方式原地等待救助。但现实是并不是所有猫咪都能得到及时的救助，很多组织的压力很大，能力也有限，因此切忌道德绑架。 如果自身有能力，可以选择在安抚猫咪情绪后用猫包等工具将猫咪带往医院，申请流浪猫救助的优惠，等待医生的救治。"
  },
]

// 系统设置的默认数据（不要修改！部署完成后，在关于页-页面设置中修改）
const init_setting = [{
    "_id": "pages",
    "detailCat": {
      "albumStep": 5,
      "photoStep": 3,
      "galleryPreload": 1,
      "galleryCompressed": 0
    },
    "genealogy": {
      "catsStep": 3,
      "main_lower_threshold": 55,
      "adStep": 6,
      "photoPopWeight": 10
    },
    "recognize": {
      "interfaceURL": "https://your.domain.com/recognizeCatPhoto",
      "secretKey": "changeToYourKey"
    },
    "recognize_test": {
      "interfaceURL": "https://your.domain.com/recognizeCatPhoto_test",
      "secretKey": "changeToYourKey"
    },
    "accessCtrl": {
      "ctrlUser": "guest",
      "ctrlVersion": "*",
      "disabledFunc": "",
      "limitedFunc": "reward,feedback,fullTab,uploadPhoto,comment"
    },
    "tabBarCtrl": {
      "ctrlTab": "news",
      "fullTab": "genealogy,recognize,news,leaderboard,info"
    },
    "subscribe": {
      "feedback#ID": "IeKS7nPSsBy62REOKiDC2zuz_M7RbKwR97ZiIy_ocmw",
      "feedback#content": "thing5",
      "feedback#time": "date4",
      "feedback#title": "thing3",
      "notifyChkFeedback#ID": "jxcvND-iLSQZLZhlHD2A97jP3fm_FWV4wL_GFUcLxcQ",
      "notifyChkFeedback#number": "number5",
      "notifyChkFeedback#time": "time3",
      "notifyChkFeedback#title": "thing2",
      "notifyVerify#ID": "jxcvND-iLSQZLZhlHD2A91gY0tLSfzyYc3bl39bxVuk",
      "notifyVerify#number": "number5",
      "notifyVerify#time": "time6",
      "notifyVerify#title": "thing2",
      "verify#ID": "AtntuAUGnzoBumjfmGB8Yyc-67FUxRH5Cw7bnEYFCXo",
      "verify#content": "thing7",
      "verify#note": "thing5",
      "verify#title": "thing2"
    },
    "ads": {
      "genealogy_banner": "your_ad_id",
      "recognize_banner": "your_ad_id",
      "reward_video": "your_ad_id",
      "badge_video": "your_ad_id",
      "badge_interstitial": "your_ad_id",
    }
  },
  {
    "_id": "filter",
    "colour": ["橘", "白", "黑", "橘白", "三花", "狸花", "奶牛", "玳瑁"],
    "campuses": ["新校区"],
    "area": []
  },
  {
    "_id": "friendLink",
    "apps": [{
      "appid": "wx5bd705b2bc91c73b",
      "logo": "/pages/public/images/system/zdmp.png",
      "name": "中大猫谱"
    }]
  },
  {
    "_id": "subscribeMsg",
    "verifyPhoto": {
      "receiverNum": 2,
      "triggerNum": 6
    },
    "chkFeedback": {
      "receiverNum": 2
    }
  },
  {
    "_id": "relation",
    "types": ["好友", "情侣", "兄弟", "姐妹", "爸爸", "妈妈", "儿子", "女儿"]
  },
];

// 部署流程（不要修改！）
module.exports = {
  // 云函数的名称
  functions: {
    commentCheck: "v1.1",
    countPhoto: "v1.1",
    curdOp: "v1.4",
    deleteFiles: "v1.1",
    deployTest: "v1.2",
    genBadgeCode: "v1.0",
    getAccessToken: "v1.1",
    getAllSci: "v1.0",
    getAppSecret: "v1.2",
    getBadge: "v1.2",
    getBadgeRank: "v1.2",
    getMpCode: "v1.1",
    getPhotoRank: "v1.0",
    getTempCOS: "v1.1",
    getURL: "v1.1",
    giveBadge: "v1.0",
    globalLock: "v1.0",
    isManager: "v1.1",
    login: "v1.1",
    managePhoto: "v1.1",
    sendMsgV2: "v1.1",
    timeTriggers: "v1.1",
    updateCat: "v1.1",
    userOp: "v1.1",
    utils: "v1.0",
  },
  default_init_data_id: default_init_data_id,
  collections: {
    "badge": default_init_data,
    "badge_def": default_init_data,
    "badge_rank": default_init_data,
    "badge_code": default_init_data,
    "cat": default_init_data,
    "comment": default_init_data,
    "feedback": default_init_data,
    "inter": default_init_data,
    "news": default_init_data,
    "photo": default_init_data,
    "photo_rank": default_init_data,
    "reward": default_init_data,
    "science": init_science,
    "setting": init_setting,
    "user": default_init_data,
  },
  images: {
    "science_imgs[0]": config.science_imgs[0],
    "science_imgs[1]": config.science_imgs[1],
    "science_imgs[2]": config.science_imgs[2],
    "science_imgs[3]": config.science_imgs[3],
    "science_imgs[4]": config.science_imgs[4],
    "reward_img": config.reward_img,
    "feedback_wj_img": config.feedback_wj_img,
    "mpcode_img": config.mpcode_img,
    "badge_rank_count_img": config.badge_rank_count_img,
    "badge_rank_score_img": config.badge_rank_score_img,
  },
  func_configs: {
    initDeploy: {
      timeout: 59, // s
    },
    imProcess: {
      memorySize: 1024, // MB
      timeout: 59, // s
      // 环境变量
      envVariables: {
        app_name: config.text.app_name
      },
      triggers: [{
        name: "Trigger",
        type: "timer",
        config: "0 */10 * * * * *",
      }],
    },
    managePhoto: {
      memorySize: 256, // MB
      timeout: 59, // s
    },
    countPhoto: {
      triggers: [{
        name: "Trigger",
        type: "timer",
        config: "0 0 * * * * *",
      }]
    },
    getPhotoRank: {
      triggers: [{
        name: "Trigger",
        type: "timer",
        config: "0 */30 * * * * *",
      }]
    },
  }
}