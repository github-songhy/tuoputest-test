// 存放应用程序中所有常量

// 连线样式方案详情
const CONNECTION_STYLES_DETAIL = {
    // 方案1: 默认现代风格
    default: {
        lineColor: '#4a90e2',
        lineHoverColor: '#2c6ecb',
        lineWidth: 6,
        lineHoverWidth: 3,
        lineDash: [],
        arrowFill: '#4a90e2',
        arrowHoverFill: '#2c6ecb',
        arrowSize: 5
    },
    // 方案2: 技术风格
    technical: {
        lineColor: '#555',
        lineHoverColor: '#222',
        lineWidth: 3,
        lineHoverWidth: 5,
        lineDash: [],
        arrowFill: '#555',
        arrowHoverFill: '#222',
        arrowSize: 4
    },
    // 方案3: 虚线风格
    dashed: {
        lineColor: '#7b61ff',
        lineHoverColor: '#5a40e0',
        lineWidth: 4,
        lineHoverWidth: 6,
        lineDash: [6, 3],
        arrowFill: '#7b61ff',
        arrowHoverFill: '#5a40e0',
        arrowSize: 5
    }
};

// 连线样式常量
const CONNECTION_STYLES = {
    default: 'default',
    technical: 'technical',
    dashed: 'dashed'
};


// 连线风格常量
const CONNECTION_TYPES = {
    smoothCurve: 'smooth-curve',
    rightAngle: 'right-angle',
    directLine: 'direct-line',
    segmented: 'segmented',
    hierarchical: 'hierarchical'
};


// 连线路径生成相关常量
const PATH_DETAIL = {
    offsetRatio: 0.45,  // 偏离中心的比例，使线条更自然
    offset: 5,         // 偏移像素
    fixedOffset: 40    // 固定转折距离，创建一致的视觉层次
};

// 设备状态颜色常量
const STATUS_COLORS = {
    normal: '#2ecc71',  // 正常状态
    warning: '#f1c40f', // 警告状态
    error: '#e74c3c'    // 故障状态
};

// 高亮颜色常量
const HIGHLIGHT_COLOR = '#ffff00'

// 应用程序配置常量
const APP_CONFIG = {
    intervalUpdateSeconds: 2,  // 定时更新时间间隔(单位：秒)
    defaultIconPath: 'device_icons/hv.svg', // 默认设备图标路径
    flowEffect: {
        shape: 'triangle',  // 流动效果形状: 'circle' 或 'triangle'
        size: 8,            // 形状大小
        count: 5            // 流动元素数量
    }
};

// 导出所有常量
export {
    CONNECTION_STYLES_DETAIL, // 连线样式详情
    CONNECTION_STYLES, // 连线样式
    CONNECTION_TYPES, // 连线类型
    PATH_DETAIL, // 路径生成相关常量
    STATUS_COLORS, // 设备状态颜色
    HIGHLIGHT_COLOR, // 高亮颜色
    APP_CONFIG // 应用程序配置
};