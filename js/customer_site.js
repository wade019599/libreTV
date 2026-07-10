const CUSTOMER_SITES = {
    tyyszy: {
        api: 'https://tyyszy.com/api.php/provide/vod',
        name: '天涯资源',
    },
    dyttzy: {
        api: 'https://caiji.dyttzyapi.com/api.php/provide/vod',
        name: '电影天堂资源',
    },
    bfzy: {
        api: 'https://bfzyapi.com/api.php/provide/vod',
        name: '暴风资源',
    },
    ruyi: {
        api: 'https://cj.rycjapi.com/api.php/provide/vod',
        name: '如意资源',
    },
    qiqi: {
        api: 'https://www.qiqidys.com/api.php/provide/vod',
        name: '七七资源',
    },
    hongniu_hnm3u8: {
        api: 'http://hongniuzy2.com/api.php/provide/vod/from/hnm3u8',
        name: '紅牛資源',
    },
    lzi_lzm3u8: {
        api: 'http://cj.lziapi.com/api.php/provide/vod/from/lzm3u8',
        name: '量子資源',
    },
    pubdo: {
        api: 'http://vod-demo.onrender.com/pubdovod.php',
        name: '開放電影',
    },
    zyku1080: {
        api: 'http://api.1080zyku.com/inc/api.php/provide/vod',
        name: '优质资源库',
    },
    kan39: {
        api: 'http://39kan.com/api.php/provide/vod',
        name: '39影視',
    },
    tiantang: {
        api: 'http://vipmv.cc/api.php/provide/vod',
        name: '天堂资源',
    },
    lehoo: {
        api: 'http://lehootv.com/api.php/provide/vod',
        name: '乐活影视',
    },
    tangrenjie: {
        api: 'http://tangrenjie.tv/api.php/provide/vod',
        name: '唐人街',
    },
    kuapi: {
        api: 'http://api.kuapi.cc/api.php/provide/vod',
        name: '酷点资源',
    },
    wolong_http: {
        api: 'http://collect.wolongzyw.com/api.php/provide/vod',
        name: '卧龙资源',
    },
    kudian10: {
        api: 'http://kudian10.com/api.php/provide/vod',
        name: '酷点资源',
    },
    tangrenjie_xm: {
        api: 'http://tangrenjie.tv/api.php/provide/vod/at/xm',
        name: '唐人街',
    },
    senlin: {
        api: 'http://slapibf.com/api.php/provide/vod',
        name: '森林资源',
    },
    ykapi: {
        api: 'http://api.ykapi.net/api.php/provide/vod',
        name: '影库资源网',
    },
    kuaiche_kcm3u8: {
        api: 'http://caiji.kczyapi.com/api.php/provide/vod/from/kcm3u8',
        name: '快车资源',
    },
    tantan: {
        api: 'http://apittzy.com/api.php/provide/vod',
        name: '探探资源',
    },
    sdzy_sdm3u8: {
        api: 'http://sdzyapi.com/api.php/provide/vod/from/sdm3u8',
        name: '閃電資源',
    },
    jinying: {
        api: 'http://jyzyapi.com/provide/vod/from/jinyingm3u8',
        name: '金鹰资源',
    },
    guangsu_gsm3u8: {
        api: 'http://api.guangsuapi.com/api.php/provide/vod/from/gsm3u8',
        name: '光速资源',
    },
    aosika: {
        api: 'http://aosikazy.com/api.php/provide/vod',
        name: '奥斯卡资源网',
    },
    laoya: {
        api: 'http://api.apilyzy.com/api.php/provide/vod',
        name: '老鸭资源采集',
    },
    uku_http: {
        api: 'http://api.ukuapi.com/api.php/provide/vod',
        name: 'U酷资源',
    },
    beidouxing: {
        api: 'http://m3u8.bdxzyapi.com/api.php/provide/vod',
        name: '北斗星资源',
    },
    yinghua_http: {
        api: 'http://m3u8.apiyhzy.com/api.php/provide/vod',
        name: '樱花资源网',
    },
    sdzy_http: {
        api: 'http://sdzyapi.com/api.php/provide/vod',
        name: '闪电资源',
    },
    feisu_http: {
        api: 'http://feisuzy.com/api.php/provide/vod',
        name: '飞速资源',
    },
    kuaibo: {
        api: 'http://www.kuaibozy.com/api.php/provide/vod',
        name: '快播资源',
    },
    baidu_http: {
        api: 'http://api.apibdzy.com/api.php/provide/vod',
        name: '百度资源',
    },
    aidan: {
        api: 'http://lovedan.net/api.php/provide/vod',
        name: '艾旦影视',
    },
    piaohua_movie: {
        api: 'http://www.zzrhgg.com/api.php/provide/vod',
        name: '飘花电影',
    },
    wangmin: {
        api: 'http://prinevillesda.org/api.php/provide/vod',
        name: '网民电影',
    },
    siwa: {
        api: 'http://siwazyw.cc/api.php/provide/vod',
        name: '丝袜资源',
    },
    tiankong_tkm3u8: {
        api: 'http://m3u8.tiankongapi.com/api.php/provide/vod/from/tkm3u8',
        name: '天空資源',
    },
    haiwaikan_http: {
        api: 'http://haiwaikan.com/api.php/provide/vod',
        name: '海外看資源',
    },
    haiwaikan: {
        api: 'https://haiwaikan.com/api.php/provide/vod/',
        name: '海外看',
    },
    zy360: {
        api: 'https://360zy.com/api.php/provide/vod/',
        name: '360',
    },
    heimuer: {
        api: 'https://www.heimuer.tv/api.php/provide/vod',
        name: '黑木耳',
    },
    citong: {
        api: 'http://ys9.cttv.vip/api.php/provide/vod/',
        name: '刺桐',
    },
    guanwang: {
        api: 'http://gwcms.cttv.vip/api.php/provide/vod/',
        name: '官网',
    },
    yeyu: {
        api: 'https://yyff.540734621.xyz/api.php/provide/vod/',
        name: '业余',
    },
    huaweiba: {
        api: 'https://hw8.live/api.php/provide/vod/',
        name: '华为吧',
    },
    xiaohuangren: {
        api: 'https://iqyi.xiaohuangrentv.com/api.php/provide/vod/',
        name: '小黄人',
    },
    niuniu: {
        api: 'https://api.niuniuzy.me/api.php/provide/vod/',
        name: '牛牛',
    },
    yaya: {
        api: 'https://cj.yayazy.net/api.php/provide/vod/',
        name: '丫丫',
    },
    uku: {
        api: 'https://api.ukuapi.com/api.php/provide/vod/',
        name: 'U酷',
    },
    haohua: {
        api: 'https://hhzyapi.com/api.php/provide/vod',
        name: '豪华',
    },
    jisu: {
        api: 'https://jszyapi.com/api.php/provide/vod',
        name: '极速',
    },
    siju: {
        api: 'https://49zyw.com/api.php/provide/vod/',
        name: '四九',
    },
    suoni: {
        api: 'https://suoniapi.com/api.php/provide/vod/',
        name: '索尼',
    },
    ikun: {
        api: 'https://ikunzyapi.com/api.php/provide/vod/',
        name: 'ikun',
    },
    ffzy: {
        api: 'http://cj.ffzyapi.com/api.php/provide/vod/',
        name: '非凡',
    },
    lzi: {
        api: 'https://cj.lziapi.com/api.php/provide/vod/',
        name: '量子',
    },
    hongniu: {
        api: 'https://www.hongniuzy2.com/api.php/provide/vod/',
        name: '红牛',
    },
    feisu: {
        api: 'https://www.feisuzyapi.com/api.php/provide/vod/',
        name: '飞速',
    },
    kuaikan: {
        api: 'https://www.kuaikan-api.com/api.php/provide/vod/',
        name: '快看',
    },
    xiongzhang: {
        api: 'https://xzcjz.com/api.php/provide/vod/',
        name: '熊掌',
    },
    yinghua: {
        api: 'https://m3u8.apiyhzy.com/api.php/provide/vod/',
        name: '樱花',
    },
    wolong: {
        api: 'https://collect.wolongzyw.com/api.php/provide/vod/',
        name: '卧龙',
    },
    piaohua: {
        api: 'http://www.ahjiuman.com/api.php/provide/vod/at/json',
        name: '飘花',
    },
    tianyi: {
        api: 'https://www.911ysw.top/tianyi.php/provide/vod/',
        name: '天翼',
    },
    huya: {
        api: 'https://www.huyaapi.com/api.php/provide/vod/',
        name: '虎牙',
    },
    baidu: {
        api: 'https://api.apibdzy.com/api.php/provide/vod/',
        name: '百度',
    },
    piaoling: {
        api: 'https://p2100.net/api.php/provide/vod/',
        name: '飘零',
    },
    wujin: {
        api: 'https://api.wujinapi.com/api.php/provide/vod/',
        name: '无尽',
    },
    subo: {
        api: 'https://subocaiji.com/api.php/provide/vod/',
        name: '速博',
    },
    modu: {
        api: 'https://caiji.moduapi.cc/api.php/provide/vod/',
        name: '魔都',
    },
    zuida: {
        api: 'http://zuidazy.me/api.php/provide/vod/',
        name: '最大',
    },
    qihu: {
        api: 'https://caiji.qhzyapi.com/api.php/provide/vod/',
        name: '奇虎',
    },
    huohu: {
        api: 'https://hhzyapi.com/api.php/provide/vod/',
        name: '火狐',
    },
    xinlang: {
        api: 'https://api.xinlangapi.com/xinlangapi.php/provide/vod/',
        name: '新浪',
    },
    kuaiyun: {
        api: 'https://www.kuaiyunzy.com/api.php/provide/vod/',
        name: '快云',
    },
};

// 调用全局方法合并
if (window.extendAPISites) {
    window.extendAPISites(CUSTOMER_SITES);
} else {
    console.error("错误：请先加载 config.js！");
}
