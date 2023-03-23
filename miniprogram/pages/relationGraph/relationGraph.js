import * as echarts from '../../ec-canvas/echarts';
import { getAllCats } from "../../cat";

function getNodeColor(cat) {
  if (cat.gender == '公') {
    return "#84a59d";
  }
  if (cat.gender == '母') {
    return "#f5cac3";
  }
  return "#f7ede2";
}

async function getData(campus) {
  var cats = []
  for (const cat of (await getAllCats())) {
    if (campus && cat.campus != campus) {
      continue;
    }
    cats.push(cat);
  }
  
  var links = [], idMap = {}, sameName = {}, visited = {};
  for (const cat of cats) {
    if (sameName[cat.name] != undefined) {
      sameName[cat.name] ++;
      cat.name = `${cat.name}[${sameName[cat.name]}]`
    } else {
      sameName[cat.name] = 1;
    }
    idMap[cat._id] = cat;
  }
  for (const cat of cats) {
    if (!cat.relations) {
      continue;
    }
    for (const rel of cat.relations) {
      if (!idMap[rel.cat_id]) {
        continue;
      }
      links.push({
        source: idMap[rel.cat_id].name,
        target: cat.name,
        value: rel.type,
      });
      visited[cat._id] = {
        name: cat.name,
        value: cat.campus,
        itemStyle: {
          color: getNodeColor(cat)
        }
      };
      visited[idMap[rel.cat_id]._id] = {
        name: idMap[rel.cat_id].name,
        value: idMap[rel.cat_id].campus,
        itemStyle: {
          color: getNodeColor(idMap[rel.cat_id])
        }
      };
    }
  }
  var nodes = Object.keys(visited).map(k => visited[k]);
  console.log(nodes, links);
  return { nodes, links }
}

// 文档：https://echarts.apache.org/zh/option.html#series-graph
function initChart(canvas, width, height, dpr, nodes, links) {
  const chart = echarts.init(canvas, null, {
    width: width,
    height: height,
    devicePixelRatio: dpr // new
  });
  canvas.setChart(chart);

  var option = {
    tooltip: {},
    animation: false,
    animationDurationUpdate: 500,
    animationEasingUpdate: 'quinticInOut',
    series: [
      {
        type: 'graph',
        // none, force, circular
        layout: 'force',
        symbolSize: 50,
        draggable: false,
        roam: 'move',
        label: {
          normal: {
            show: true
          }
        },
        force: {
          repulsion: 500,
          edgeLength: 200,
          // layoutAnimation: false,
        },
        // edgeSymbol: ['circle', 'arrow'],
        // edgeSymbolSize: [4, 10],
        // edgeLabel: {
        //   normal: {
        //     textStyle: {
        //       fontSize: 20
        //     }
        //   }
        // },
        edgeSymbol: ['none', 'arrow'],
        emphasis: {
          disabled: true
        },
        autoCurveness: true,
        data: nodes,
        links: links,
        // lineStyle: {
        //   normal: {
        //     width: 2
        //   }
        // }
      }
    ]
  };

  chart.setOption(option);
  return chart;
}

Page({
  onShareAppMessage: function (res) {
    return {
      title: 'ECharts 可以在微信小程序中使用啦！',
      path: '/pages/index/index',
      success: function () { },
      fail: function () { }
    }
  },
  data: {
    ec: {
      // 将 lazyLoad 设为 true 后，需要手动初始化图表
      lazyLoad: true
    },
    isLoaded: false,
    isDisposed: false
  },

  async onReady() {
    // 获取数据
    var {nodes, links} = await getData("东校区");

    // 获取组件
    this.ecComponent = this.selectComponent('#mychart-dom-pie');
    this.init(nodes, links);
  },

  // 点击按钮后初始化图表
  init: function (nodes, links) {
    this.ecComponent.init((canvas, width, height, dpr) => {
      // 获取组件的 canvas、width、height 后的回调函数

      // 将图表实例绑定到 this 上，可以在其他成员函数（如 dispose）中访问
      this.chart = initChart(canvas, width, height, dpr, nodes, links);

      this.setData({
        isLoaded: true,
        isDisposed: false
      });

      // 注意这里一定要返回 chart 实例，否则会影响事件处理等
      return this.chart;
    });
  },

  dispose: function () {
    if (this.chart) {
      this.chart.dispose();
    }

    this.setData({
      isDisposed: true
    });
  }
});
