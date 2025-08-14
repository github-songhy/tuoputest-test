import { devices, usedDevices, connections, deviceIconMapping, selectedElement } from './global-variable.js';
import { STATUS_COLORS, APP_CONFIG, HIGHLIGHT_COLOR } from './constants.js';

import { resetCanvas, loadTopology, saveTopology } from './top-function.js';
import { connectDevices, updateDeviceConnections } from './connection.js';

// 交互状态相关变量
let isDragging = false;
let dragSource = null;
let connectingDeviceId = null; // 正在连接的设备ID

// 定时更新时间间隔(单位：秒) - 从常量配置中获取
const interval_update_secend = APP_CONFIG.intervalUpdateSeconds;

// 初始化函数
window.onload = function () {
    // 加载设备图标映射
    loadDeviceIconMapping();

    // 加载设备数据
    loadDeviceData();

    // 绑定按钮事件
    document.getElementById('save').addEventListener('click', saveTopology);
    document.getElementById('reset').addEventListener('click', resetCanvas);
    document.getElementById('load').addEventListener('click', loadTopology);
};

// 加载设备图标映射
function loadDeviceIconMapping() {
    // fetch必须走服务器
    fetch('http://localhost:3000/config/device_icon_mapping.json')
        .then(response => response.json())
        .then(data => {
            Object.assign(deviceIconMapping, data);;
        })
        .catch(error => {
            console.error('加载设备图标映射失败:', error);
        });
}

// 加载设备数据
function loadDeviceData() {
    // 从后端API获取数据
    fetch('http://localhost:3000/api/devices')
        .then(response => response.json())
        .then(data => {
            devices.length = 0;
            Object.assign(devices, data);

            // 处理数据，添加必要的属性
            devices.forEach(device => {
                device['x'] = 0;
                device['y'] = 0;

                // 转换数值字段
                if (device.position_x) device.position_x = parseInt(device.position_x);
                if (device.position_y) device.position_y = parseInt(device.position_y);
            });


            // 渲染设备库
            renderDeviceLibrary();
        })
        .catch(error => {
            console.error('加载设备信息失败:', error);
            alert('加载设备信息失败, 请确保后端服务正在运行');
        });
}

// 渲染左侧设备库（按area->station->type三级分类）
function renderDeviceLibrary() {
    const deviceItems = document.getElementById('deviceItems');
    deviceItems.innerHTML = '';

    // 按area->station->type分组
    const groupedDevices = {};
    devices.forEach(device => {
        const area = device.area || '未分类';
        const station = device.station || '未知站点';
        const type = device.type || '未知类型';

        if (!groupedDevices[area]) groupedDevices[area] = {};
        if (!groupedDevices[area][station]) groupedDevices[area][station] = {};
        if (!groupedDevices[area][station][type]) groupedDevices[area][station][type] = [];

        groupedDevices[area][station][type].push(device);
    });

    // 创建分类结构
    for (const [area, stations] of Object.entries(groupedDevices)) {
        const areaDiv = document.createElement('div');
        areaDiv.className = 'category-area';

        const areaHeader = document.createElement('div');
        areaHeader.className = 'category-header';
        areaHeader.innerHTML = `<i class="arrow">▶</i> ${area}`;
        areaDiv.appendChild(areaHeader);

        const areaContent = document.createElement('div');
        areaContent.className = 'category-content';
        areaContent.style.display = 'none';

        for (const [station, types] of Object.entries(stations)) {
            const stationDiv = document.createElement('div');
            stationDiv.className = 'category-station';

            const stationHeader = document.createElement('div');
            stationHeader.className = 'subcategory-header';
            stationHeader.innerHTML = `<i class="arrow">▶</i> ${station}`;
            stationDiv.appendChild(stationHeader);

            const stationContent = document.createElement('div');
            stationContent.className = 'subcategory-content';
            stationContent.style.display = 'none';

            for (const [type, devices] of Object.entries(types)) {
                const typeDiv = document.createElement('div');
                typeDiv.className = 'category-type';

                const typeHeader = document.createElement('div');
                typeHeader.className = 'subsubcategory-header';
                typeHeader.innerHTML = `<i class="arrow">▶</i> ${type}`;
                typeDiv.appendChild(typeHeader);

                const typeContent = document.createElement('div');
                typeContent.className = 'subsubcategory-content';
                typeContent.style.display = 'none';

                devices.forEach(device => {
                    const deviceDiv = document.createElement('div');
                    deviceDiv.className = 'device-item';
                    deviceDiv.textContent = device.name;
                    deviceDiv.draggable = true;
                    deviceDiv.dataset.id = device.id;

                    deviceDiv.addEventListener('dragstart', function (e) {
                        dragSource = this;
                        e.dataTransfer.setData('text/plain', device.id);
                    });

                    typeContent.appendChild(deviceDiv);
                });

                typeHeader.addEventListener('click', function () {
                    const isHidden = typeContent.style.display === 'none';
                    typeContent.style.display = isHidden ? 'block' : 'none';
                    this.querySelector('.arrow').textContent = isHidden ? '▼' : '▶';
                });

                typeDiv.appendChild(typeContent);
                stationContent.appendChild(typeDiv);
            }

            stationHeader.addEventListener('click', function () {
                const isHidden = stationContent.style.display === 'none';
                stationContent.style.display = isHidden ? 'block' : 'none';
                this.querySelector('.arrow').textContent = isHidden ? '▼' : '▶';
            });

            stationDiv.appendChild(stationContent);
            areaContent.appendChild(stationDiv);
        }

        areaHeader.addEventListener('click', function () {
            const isHidden = areaContent.style.display === 'none';
            areaContent.style.display = isHidden ? 'block' : 'none';
            this.querySelector('.arrow').textContent = isHidden ? '▼' : '▶';
        });

        areaDiv.appendChild(areaContent);
        deviceItems.appendChild(areaDiv);
    }
}

// 初始化拓扑画布（注册拖拽和放置事件）
function initTopologyCanvas() {
    const svg = d3.select('#topologySVG');

    // 画布拖拽功能
    svg.call(d3.drag()
        .on('start', function (event) {
            if (!event.sourceEvent.target.classList.contains('node')) {

                isDragging = true;

                resetColor(); // 清除选中状态
                // 清除选中元素
                selectedElement.id = ''
                selectedElement.type = ''

                connectingDeviceId = null; // 清除正在连接的设备ID
            }
        })
        .on('drag', function (event) {
            if (isDragging) {
                const nodes = d3.selectAll('.node');
                nodes.attr('transform', function (d) {
                    d.x = d.x + event.dx;
                    d.y = d.y + event.dy;
                    // 更新相关连线位置
                    updateDeviceConnections(d.id);
                    return `translate(${d.x},${d.y})`;
                });

            }
        })
        .on('end', function () {
            isDragging = false;
        }));

    // 设备放置事件
    svg.on('drop', function (e) {
        e.preventDefault();
        if (dragSource) {
            const deviceId = e.dataTransfer.getData('text/plain');
            const device = devices.find(d => d.id == deviceId);
            if (device) {
                addDeviceToCanvas(device, e.offsetX, e.offsetY);
                dragSource = null;
            }
        }
    });

    // 允许放置
    svg.on('dragover', function (e) {
        e.preventDefault();
    });
}

// 初始化拓扑画布（注册拖拽和放置事件）
initTopologyCanvas();

// 添加设备到画布
function addDeviceToCanvas(device, x, y) {
    const svg = d3.select('#topologySVG');

    // 检查设备是否已存在
    const existingNode = svg.select(`[data-id="${device.id}"]`);
    if (!existingNode.empty()) return;

    device.x = x; // 设置初始位置
    device.y = y;
    const nodeGroup = svg.append('g')
        .attr('class', 'node')
        .attr('data-id', device.id) // 添加ID属性用于识别
        .attr('transform', `translate(${x},${y})`)
        .datum(device)
        .call(d3.drag()
            .on('drag', function (event, d) {
                d3.select(this).attr('transform', `translate(${event.x},${event.y})`);
                updateDeviceConnections(d.id); // 更新连线位置

                resetColor(); // 清除选中状态
                //  清除选中元素
                selectedElement.id = ''
                selectedElement.type = ''

                connectingDeviceId = null; // 清除正在连接的设备ID
            })
            .on('end', function (event, d) {
                // 更新位置数据
                d.x = event.x;
                d.y = event.y;
            }));

    // 设备状态指示
    let statusColor = STATUS_COLORS.normal; // 正常状态
    if (device.status === 'warning') statusColor = STATUS_COLORS.warning; // 警告状态
    if (device.status === 'error') statusColor = STATUS_COLORS.error; // 故障状态

    // 使用设备图标映射中的图片
    const iconPath = deviceIconMapping[device.type] || APP_CONFIG.defaultIconPath; // 默认使用HV图标
    nodeGroup.append('image')
        .attr('xlink:href', iconPath)
        .attr('width', 60)
        .attr('height', 60)
        .attr('x', -30)
        .attr('y', -30)
        .attr('stroke', statusColor)
        .attr('stroke-width', 3)
        .attr('rx', 5);

    // 显示设备名称
    nodeGroup.append('text')
        .text(device.name)
        .attr('text-anchor', 'middle')
        .attr('dy', 50)
        .attr('fill', 'black')
        .attr('font-size', '10px');

    // 移除了固定连接点，现在可以从设备任意位置连接
    // 添加点击事件以支持从任意位置开始连接
    nodeGroup.on('mousedown', function (event, d) {
        if (event.ctrlKey) {
            connectingDeviceId = d.id;
            resetColor();
            d3.select(this).select('image').attr('stroke', '#ffff00');

        }
    });

    // 显示设备状态
    if (device.status !== 'normal') {
        nodeGroup.append('circle')
            .attr('r', 8)
            .attr('cx', 20)
            .attr('cy', -20)
            .attr('fill', statusColor);
    }

    // 添加点击事件,选中设备
    nodeGroup.on('click', function (event, d) {
        resetColor(); // 清除上次选中状态

        selectedElement.type = 'device'
        selectedElement.id = d.id

        // 高亮选中的设备
        d3.select(this).select('image')
            .style('outline', `2px solid ${HIGHLIGHT_COLOR}`)
    })

    // 添加到已使用的设备列表
    usedDevices.push(device);
}

// 显示属性面板
function showPropertyPanel(device) {
    const propertyForm = document.getElementById('propertyForm');

    // 创建只读属性表单
    let formHTML = `
        <h4>${device.name} 属性</h4>
        <div class="property-item">
            <label>设备ID:</label>
            <input type="text" value="${device.id}" disabled>
        </div>
        <div class="property-item">
            <label>设备名称:</label>
            <input type="text" value="${device.name}" disabled>
        </div>
        <div class="property-item">
            <label>设备类型:</label>
            <input type="text" value="${device.type}" disabled>
        </div>
        <div class="property-item">
            <label>状态:</label>
            <input type="text" value="${device.status === 'normal' ? '正常' : device.status === 'warning' ? '警告' : '故障'}" disabled>
        </div>
    `;

    // 添加其他属性（排除已显示的属性）
    const excludedKeys = ['id', 'name', 'type', 'status'];
    for (const [key, value] of Object.entries(device)) {
        if (!excludedKeys.includes(key)) {
            formHTML += `
                <div class="property-item">
                    <label>${key}:</label>
                    <input type="text" value="${value}" disabled>
                </div>
            `;
        }
    }

    propertyForm.innerHTML = formHTML;
}

// 添加点击事件、连接事件处理
d3.select('#topologySVG').on('click', function (event) {

    // 如果点击的是空白区域，清除选中状态,
    // 防止与设备元素点击的函数冲突
    // 因为会先触发元素的注册的点击事件，设置selectedElement的值，再触发画布的点击
    if (event.target === this) { // this是画布本身，也即点击的是空白部分
        resetColor();
        // 清除选中元素
        selectedElement.id = ''
        selectedElement.type = ''
        connectingDeviceId = null; // 清除正在连接的设备ID
        return;
    }

    // 选中连线
    if (event.target.classList.contains('connection')) {
        // 获取连线ID
        const connectionId = event.target.getAttribute('data-id');
        selectedElement.type = 'connection'
        selectedElement.id = connectionId
        // 高亮选中的连线
        d3.select(event.target).attr('stroke', '#ffff00').attr('stroke-width', 4);
        d3.select(`#${selectedElement.id}-arrow path`).attr('fill', '#ffff00');

    }

    // 选中设备（会先触发设备的点击事件，selectedElement会被设置为设备的信息）
    else if (selectedElement.type === 'device') {

        const deviceId = selectedElement.id;

        showPropertyPanel(usedDevices.find(d => d.id === deviceId));

        // 连接逻辑
        if (!connectingDeviceId) {
            // 开始连接
            connectingDeviceId = deviceId;
            // 使用d3找到id与这个设备对应的连接点并高亮
            d3.select(`[data-id="${connectingDeviceId}"] image`).attr('stroke', '#ffff00').attr('stroke-width', 3);


        } else {
            // 完成连接
            // 如果连接点是同一个设备，则不进行连接
            if (connectingDeviceId !== deviceId) {
                connectDevices(connectingDeviceId, deviceId);
            }
            d3.select(`[data-id="${connectingDeviceId}"] image`).attr('stroke', '#2ecc71').attr('stroke-width', 3);
            connectingDeviceId = null;
        }

    }
});

// 清除选中状态颜色
function resetColor() {
    if (selectedElement.id === '' && selectedElement.type === '') {
        return;
    }
    // 设备节点
    if (selectedElement.type === 'device') {
        //清除高亮
        d3.select(`[data-id="${selectedElement.id}"] image`).style('outline', 'none');
        // 清除属性面板
        document.getElementById('propertyForm').innerHTML = '';
    }
    // 连线
    else if (selectedElement.type === 'connection') {
        // 清除连线高亮
        d3.select(`[data-id="${selectedElement.id}"]`).attr('stroke', '#999').attr('stroke-width', 3);
        // 清除箭头高亮
        d3.select(`#${selectedElement.id}-arrow path`).attr('fill', '#999');
    }
}

// 键盘事件 - 删除选中的元素
document.addEventListener('keydown', function (e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElement.id !== '' && selectedElement.type !== '') {

        const svg = d3.select('#topologySVG');
        if (selectedElement.type === 'device') {
            // 删除设备
            const deviceId = selectedElement.id;

            // 删除设备节点
            svg.select(`[data-id="${deviceId}"]`).remove();

            // 从usedDevices数组中移除
            usedDevices.length = 0;
            Object.assign(usedDevices, usedDevices.filter(d => d.id !== deviceId));

            // 删除相关连线
            let relatedConnections = connections.filter(conn => conn.source === deviceId || conn.target === deviceId)

            relatedConnections.forEach(conn => {
                conn.element.remove();
            });

            // 从connections数组中移除
            connections.length = 0;
            Object.assign(connections, connections.filter(conn =>
                conn.source !== deviceId && conn.target !== deviceId
            ));

            // 清除属性面板
            document.getElementById('propertyForm').innerHTML = '';
        } else if (selectedElement.type === 'connection') {
            // 删除连线
            const connectionId = selectedElement.id;

            // 找到并删除连线
            const connection = connections.find(conn => conn.id === connectionId);
            if (connection) {
                connection.element.remove();
                // 从connections数组中移除
                connections.length = 0;
                Object.assign(connections, connections.filter(conn => conn.id !== connectionId));
            }
        }
        // 清除选中状态
        selectedElement.id = ''
        selectedElement.type = ''

    }
});

// 定时更新拓扑状态
function startTopologyUpdates() {
    // 每interval_secend秒更新一次
    setInterval(updateTopologyStatus, interval_update_secend * 1000);
}

// 更新拓扑状态
function updateTopologyStatus() {
    // 模拟从API获取设备状态更新
    // 实际应用中应替换为真实的API调用
    fetch('http://localhost:3000/api/device-status')
        .then(response => response.json())
        .then(deviceStatuses => {
            // 存储异常设备ID
            const abnormalDevices = new Set();

            // 更新设备状态 并 收集异常设备信息
            usedDevices.forEach(device => {
                const newStatus = deviceStatuses[device.id] || device.status;
                device.status = newStatus;

                // 更新设备显示
                updateDeviceDisplay(device);

                // 如果变为异常状态，添加到异常设备集合
                if (newStatus === 'warning' || newStatus === 'error') {
                    abnormalDevices.add(device.id);
                }
            });

            // 为异常设备及其下游设备添加警告图标
            if (abnormalDevices.size > 0) {
                abnormalDevices.forEach(deviceId => {
                    // 找到下游设备
                    const downstreamDevices = findDownstreamDevices(deviceId);
                    // 包括自身
                    downstreamDevices.add(deviceId);

                    // 为所有下游设备添加警告图标
                    downstreamDevices.forEach(id => {
                        addWarningIcon(id);
                    });
                });
            }
        })
        .catch(error => {
            console.error('获取设备状态失败:', error);
        });
}

// 更新设备显示
function updateDeviceDisplay(device) {
    const svg = d3.select('#topologySVG');
    const nodeGroup = svg.select(`[data-id="${device.id}"]`);

    if (nodeGroup.empty()) return;

    // 更新状态颜色
    let statusColor = '#2ecc71'; // 正常状态
    if (device.status === 'warning') statusColor = '#f1c40f'; // 警告状态
    if (device.status === 'error') statusColor = '#e74c3c'; // 故障状态

    // 移除旧的警告图标
    nodeGroup.select('text.warning-icon').remove();

    // 更新设备图标边框颜色
    nodeGroup.select('image')
        .attr('stroke', statusColor);

    // 更新或添加状态指示器
    const statusIndicator = nodeGroup.select('circle[cx="20"][cy="-20"]');
    if (statusIndicator.empty()) {
        if (device.status !== 'normal') {
            nodeGroup.append('circle')
                .attr('r', 8)
                .attr('cx', 20)
                .attr('cy', -20)
                .attr('fill', statusColor);
        }
    } else {
        if (device.status === 'normal') {
            statusIndicator.remove();
            // 同时移除警告图标
            nodeGroup.select('text.warning-icon').remove();
        } else {
            statusIndicator.attr('fill', statusColor);
        }
    }
}

// 查找下游设备
function findDownstreamDevices(deviceId) {
    const downstreamDevices = new Set();

    function findDevices(id) {
        // 找到以id为源的所有连接
        const outgoingConnections = connections.filter(conn => conn.source === id);

        outgoingConnections.forEach(conn => {
            const targetId = conn.target;
            if (!downstreamDevices.has(targetId)) {
                downstreamDevices.add(targetId);
                // 递归查找
                findDevices(targetId);
            }
        });
    }

    findDevices(deviceId);
    return downstreamDevices;

}

// 添加警告图标
function addWarningIcon(deviceId) {
    const svg = d3.select('#topologySVG');
    const nodeGroup = svg.select(`[data-id="${deviceId}"]`);

    if (nodeGroup.empty()) return;

    // 先移除已有的警告图标
    nodeGroup.select('text.warning-icon').remove();

    // 添加新的警告图标
    nodeGroup.append('text')
        .attr('class', 'warning-icon')
        .text('⚠')
        .attr('x', 20)
        .attr('y', -15)
        .attr('font-size', '16px')
        .attr('fill', '#e74c3c')
        .attr('text-anchor', 'middle');
}

// 页面加载完成后启动更新
window.addEventListener('load', startTopologyUpdates);


export {
    addDeviceToCanvas,
    connectDevices
}
