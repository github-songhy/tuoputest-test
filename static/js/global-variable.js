// 存放应用程序中所有全局变量

// 设备数据相关变量
let devices = [];
let usedDevices = []; // 已使用的设备列表
let connections = []; // 存储连线
let selectedElement = {
    type: '',
    id: ''

} ; // 当前选中的元素（设备或连线）

// 映射和配置相关变量

let deviceIconMapping = {}; // 设备图标映射

// 原始连线颜色(选择不同的连线样式后，非选中时需要恢复原始颜色)
let originConnColor = {color: '#4a90e2'}; 

// 正在使用的连线相关变量 默认是 hierarchical default   
let connFormat = {type: 'hierarchical', style: 'default'}; // 正在使用的连线格式


// 导出所有全局变量
export {
    devices, // 设备数据
    usedDevices, // 已使用的设备列表
    connections, // 存储连线
    selectedElement, // 当前选中的元素（设备或连线）
    deviceIconMapping, // 设备图标映射
    connFormat, // 正在使用的连线格式
    originConnColor // 原始连线颜色
};
