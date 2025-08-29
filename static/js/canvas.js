import { devices, usedDevices, connections, deviceIconMapping, selectedElement, originConnColor } from './global-variable.js';
import { STATUS_COLORS, APP_CONFIG, HIGHLIGHT_COLOR } from './constants.js';
import { resetCanvas, loadTopology, saveTopology } from './top-function.js';
import { connectDevices, updateDeviceConnections, addFlowEffect, removeFlowEffect } from './connection.js';

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

    // 开启定时更新
    startTopologyUpdates(interval_update_secend);

};

// 加载设备图标映射
function loadDeviceIconMapping() {
    // fetch必须走服务器
    fetch('/config/device_icon_mapping.json')
        .then(response => response.json())
        .then(data => {
            Object.assign(deviceIconMapping, data);;
        })
        .catch(error => {
            console.error('加载设备图标映射失败:', error);
        });
};

// 加载设备数据
function loadDeviceData() {
    // 从后端API获取数据
    fetch('/api/devices')
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

// 渲染左侧设备库按area->station->type三级分类
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

                // 更新所有提示窗位置
                updateAllErrorInfoPositions();
                // 更新所有电压信息提示窗位置
                updateAllVoltageInfoPositions();

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
                updateAllErrorInfoPositions(d.id); // 更新相关提示窗位置
                // 更新对应电压信息提示窗位置
                updateAllVoltageInfoPositions(d.id);

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
    let statusColor = STATUS_COLORS.normal; // 默认状态
    if (device.status === 'normal') statusColor = STATUS_COLORS.normal; // 正常状态
    if (device.status === 'warning') statusColor = STATUS_COLORS.warning; // 警告状态
    if (device.status === 'error') statusColor = STATUS_COLORS.error; // 故障状态

    // 使用设备图标映射中的图片
    const iconPath = deviceIconMapping[device.type] || APP_CONFIG.defaultIconPath; // 默认使用HV图标
    nodeGroup.append('image')
        .attr('xlink:href', iconPath)
        .attr('width', 100)
        .attr('height', 100)
        .attr('x', -30)
        .attr('y', -30)
        .attr('stroke', statusColor)
        .attr('stroke-width', 3)
        .attr('rx', 5);

    // 显示设备名称
    nodeGroup.append('text')
        .text(device.name)
        .attr('text-anchor', 'middle')
        .attr('dy', 95)
        .attr('fill', 'black')
        .attr('font-size', '30px');

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
            .attr('r', 15)
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
        d3.select(`#${selectedElement.id}-connection-arrow path`).attr('fill', '#ffff00');

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
        d3.select(`[data-id="${selectedElement.id}"]`).attr('stroke', originConnColor.color).attr('stroke-width', 3);
        // 清除箭头高亮
        d3.select(`#${selectedElement.id}-arrow path`).attr('fill', originConnColor.color);
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
            clearErrorInfo(deviceId)
            clearVoltageInfo(deviceId);

            // 从usedDevices数组中移除
            let usedDevicesTemp = usedDevices.filter(d => d.id !== deviceId)
            usedDevices.length = 0;
            Object.assign(usedDevices, usedDevicesTemp);

            // 删除相关连线
            let relatedConnections = connections.filter(conn => conn.source === deviceId || conn.target === deviceId)

            relatedConnections.forEach(conn => {
                conn.element.remove();
                removeFlowEffect(conn.id);
            });

            // 从connections数组中移除
            let connectionsTemp = connections.filter(conn =>
                conn.source !== deviceId && conn.target !== deviceId
            )
            connections.length = 0;
            Object.assign(connections, connectionsTemp);

            // 清除属性面板
            document.getElementById('propertyForm').innerHTML = '';
        } else if (selectedElement.type === 'connection') {
            // 删除连线
            const connectionId = selectedElement.id;

            // 找到并删除连线
            const connection = connections.find(conn => conn.id === connectionId);
            if (connection) {
                connection.element.remove();
                removeFlowEffect(connectionId);
                // 从connections数组中移除
                let connectionsTemp = connections.filter(conn => conn.id !== connectionId)
                connections.length = 0;
                Object.assign(connections, connectionsTemp);
            }
        }
        // 清除选中状态
        selectedElement.id = ''
        selectedElement.type = ''

    }
});

// 定时更新拓扑状态
function startTopologyUpdates(secends) {
    // 每secend秒更新一次
    setInterval(updateTopologyStatus, secends * 1000);
}

// 更新拓扑状态、提示窗以及流动效果
function updateTopologyStatus() {

    fetch('/api/devices')
        .then(response => response.json())
        .then(newDevices => {

            // newDevices = newDevices.filter(device => device.station === '接入间')
            newDevices = newDevices.filter(device => device.station === '天河机楼')

            // 存储异常设备ID
            const abnormalDevices = new Set();
            // 存储正常设备ID
            const normalDevices = new Set();

            // 清除所有设备的提示窗
            usedDevices.forEach(device => {
                clearErrorInfo(device.id);
                // 清除电压信息提示窗
                clearVoltageInfo(device.id);
            });

            // 查询所有类型为'高压输入'的设备是否有异常状态
            const highVoltageInputDevices = newDevices.filter(device => device.type === '高压输入');
            // 全部异常则视为断电
            const publicPowerOff = highVoltageInputDevices.every(device => device.status === 'warning' || device.status === 'error')

            // 更新设备状态 并 收集异常设备信息
            usedDevices.forEach(device => {
                const newDevice = newDevices.find(item => item.id === device.id);
                if (newDevice) Object.assign(device, newDevice)

                const newStatus = device.status;

                // 更新设备显示
                updateDeviceDisplay(device);

                // 为电池组设备显示电压信息
                if (device.type === '电池组') {
                    // UPS电池暂时不显示电压
                    if(!(device.name.includes('UPS') || device.name.includes('ups')))
                        showVoltageInfo(device);
                }

                // 分类设备状态
                if (newStatus === 'warning' || newStatus === 'error') {
                    abnormalDevices.add(device.id);
                } else if (newStatus === 'normal') {
                    normalDevices.add(device.id);
                }
            });

            // 获取拓扑图的广度优先搜索序列
            // 优先处理上游涉设备，避免对某个设备修改其相关连线时上游的设备相关连线还未更新的情况
            // 新增逻辑: 会形成环的线过滤掉，保证能正常使用BFS
            const topologicalOrder = bfsTopologicalOrder(usedDevices, connections.filter(conn => !conn.looped))

            // 为异常设备及其下游设备添加警告图标和提示窗
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
                // 为异常设备添加错误提示窗
                abnormalDevices.forEach(deviceId => {
                    const device = usedDevices.find(d => d.id === deviceId);
                    if (device && (device.status === 'error' || device.status === 'warning')) {
                        showErrorInfo(device);
                    }
                });
            }

            // 保存原始颜色配置
            const originalFlowColor = APP_CONFIG.flowEffect.color;

            // 如果市电停电，更改流动效果颜色为黄色
            if (publicPowerOff) {
                APP_CONFIG.flowEffect.color = 'rgb(255, 255, 0)';
            }

            // 判断是否有油机启动
            let oilDevices = topologicalOrder.filter(device => device.type === '油机')
            let oilDeviceAreUsed = (oilDevices == []) ? false : oilDevices.every(oilDevice => {
                let relatedConn = connections.find(conn => conn.source === oilDevice.id)
                if (relatedConn && relatedConn.flowGroup)
                    return true
                else return false
            })

            // 根据状态进行流动效果更新
            topologicalOrder.forEach(device => {
                const deviceId = device.id;
                const isBackup = device.is_backup === 'True';
                const sourceConnections = connections.filter(conn => conn.source === deviceId);

                // 是否应该有流动效果标记
                let shouldHaveFlow = isBackup ?
                    (device.status === 'error' || device.status === 'warning') :
                    (device.status === 'normal');

                // 如果是市电备路，则不应该有流动效果
                if (device.notes === '市电备路') shouldHaveFlow = false

                // 如果当前油机正在供电，则类型为电池的不应该有流动效果
                if (oilDeviceAreUsed && device.type === '电池组')
                    shouldHaveFlow = false
                // 如果当前市电停电且油机没供电，那么有足够电压的电池设备要供电，都应该有流动效果
                if (!oilDeviceAreUsed && publicPowerOff && device.type === '电池组') {
                    if (device.voltage.split('v')[0] * 1 >= 43)
                        shouldHaveFlow = true
                    else shouldHaveFlow = false
                }

                sourceConnections.forEach(conn => {
                    // 检查当前连线是否已经有流动效果
                    const hasFlow = !!conn.flowGroup;

                    // 当应该有流动效果且当前没有时，添加流动效果
                    if (shouldHaveFlow && !hasFlow) {
                        addFlowEffect(conn.id);
                    }
                    // 当不应该有流动效果且当前有时，移除流动效果
                    else if (!shouldHaveFlow && hasFlow) {
                        // 特殊情况：如果已经有流动效果了，但是当前是备用油机设备且当前市电断电了那就不移除，否则移除
                        if (isBackup && publicPowerOff && device.type === '油机');
                        else {
                            removeFlowEffect(conn.id);
                        }
                    }
                });

            });

            // 最后再根据已经确定的有流动效果的连线确定剩余连线是否要添加或者删除流动
            // 遍历所有设备 找到每个设备的正在活跃(有流动效果)的最源头
            // 如果有且到达该设备的路径是通的(某个路径上连线都有流动效果)，就为以这个设备为起点的连线添加流动效果
            topologicalOrder.forEach(device => {
                // 只处理正常状态的设备
                if (device.status != 'normal') return;

                const deviceId = device.id;
                // 查找当前设备的所有最源头设备
                const sourceDevices = findUpstreamSourceDevices(deviceId);
                if (sourceDevices.size === 0) {
                    return;
                }

                let activeSources = []
                sourceDevices.forEach(sourceId => {
                    connections.filter(conn => conn.source === sourceId).forEach(
                        conn => {
                            // 如果这个源端点有流动效果,那么就把这个源端点加入到activeSources数组中
                            if (!!conn.flowGroup) {
                                activeSources.push(sourceId)
                            }
                        }
                    )
                })

                // 当前节点只要有一个“以该源头节点为起点的连线有流动效果的”源头，且以所有上述源头为起点到达该节点的所有路径上只要有一条是通的
                // 那么以这个端点为起点的连线都要添加流动效果
                if (activeSources.length != 0 && hasAvailablePath(activeSources, deviceId)) {

                    connections.filter(conn => conn.source == deviceId).forEach(
                        conn => {
                            // 如果没有流动效果,就添加
                            if (!conn.flowGroup) {
                                addFlowEffect(conn.id)
                            }
                            // 如果有先移除再加以便更新流动颜色
                            else {
                                removeFlowEffect(conn.id)
                                addFlowEffect(conn.id)
                            }
                        }
                    )
                }
                // 如果没有一个源头能往下流那么以这个端点为起点的连线都要移除流动效果
                else {
                    connections.filter(conn => conn.source == deviceId).forEach(
                        conn => {
                            if (conn.flowGroup) {
                                removeFlowEffect(conn.id)
                            }
                        }
                    )
                }
            });

            // 电池设备充电时的特殊处理
            // 当市电停电且油机没供电时，没法充电，所有的构成环的连线(整流系统到电池的连线)都应该移除流动效果
            let haveOilUsed = topologicalOrder.filter(device => device.type === '油机').some(oilDevice => {
                let relatedConn = connections.find(conn => conn.source === oilDevice.id)
                if (relatedConn && relatedConn.flowGroup)
                    return true
                else false
            })
            if (publicPowerOff && !haveOilUsed) {
                connections.filter(conn => conn.looped).forEach(conn => {
                    if (conn.flowGroup)
                        removeFlowEffect(conn.id)
                })
            }
            // 当市电有电或油机供电且电池设备电压不足时进行充电
            else {
                connections.filter(conn => conn.looped).forEach(conn => {
                    let batteryDevice = usedDevices.find(d => d.id === conn.target)
                    if (batteryDevice.voltage.split('v')[0] * 1 < 53.7) {
                        if (!conn.flowGroup)
                            addFlowEffect(conn.id)
                    }
                    else
                        removeFlowEffect(conn.id)
                })
            }

            // 恢复原始颜色配置
            APP_CONFIG.flowEffect.color = originalFlowColor;

        })
        .catch(error => {
            console.error('获取设备状态失败:', error);
        });
}

// 更新设备状态显示
function updateDeviceDisplay(device) {
    const svg = d3.select('#topologySVG');
    const nodeGroup = svg.select(`[data-id="${device.id}"]`);

    if (nodeGroup.empty()) return;

    // 设置不重要设备的透明度
    if (device.notes === 'unimportant') {
        nodeGroup.attr('opacity', 0.3); // 设置半透明
    } else {
        nodeGroup.attr('opacity', 1); // 完全不透明
    }

    // 更新状态颜色
    // 设备状态指示
    let statusColor = STATUS_COLORS.normal; // 默认状态
    if (device.status === 'normal') statusColor = STATUS_COLORS.normal; // 正常状态
    if (device.status === 'warning') statusColor = STATUS_COLORS.warning; // 警告状态
    if (device.status === 'error') statusColor = STATUS_COLORS.error; // 故障状态

    // 移除旧的警告图标
    nodeGroup.select('text.warning-icon').remove();

    // 更新设备图标边框颜色
    nodeGroup.select('image')
        .attr('stroke', statusColor);

    // 更新或添加状态指示器
    const statusIndicator = nodeGroup.select('circle[cx="20"][cy="-20"]');
    if (statusIndicator.empty()) {
        if (device.status === 'error' || device.status === 'warning') {
            nodeGroup.append('circle')
                .attr('r', 15)
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
        .attr('font-size', '30px')
        .attr('fill', '#e74c3c')
        .attr('text-anchor', 'middle');
}

// 查找下游设备
function findDownstreamDevices(deviceId) {
    const downstreamDevices = new Set();

    function findDevices(id) {
        // 找到以id为源的所有连接
        const outgoingConnections = connections.filter(conn => !conn.looped && conn.source === id);

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

// 查找设备的所有最源头设备
function findUpstreamSourceDevices(deviceId) {
    const sourceDevices = new Set();
    const visitedDevices = new Set();

    function dfs(currentDeviceId) {
        // 避免循环引用
        if (visitedDevices.has(currentDeviceId)) {
            return;
        }
        visitedDevices.add(currentDeviceId);

        // 查找当前设备的所有上游连接
        const incomingConnections = connections.filter(conn => !conn.looped && conn.target === currentDeviceId);

        if (incomingConnections.length === 0) {
            // 没有上游连接，说明是最源头设备
            sourceDevices.add(currentDeviceId);
        } else {
            // 递归查找所有上游设备
            incomingConnections.forEach(conn => {
                dfs(conn.source);
            });
        }
    }

    dfs(deviceId);
    sourceDevices.delete(deviceId)
    return sourceDevices;
}

// 清除错误提示窗
function clearErrorInfo(deviceId) {
    const svg = d3.select('#topologySVG');
    const errorInfo = svg.select(`.error-info[data-device-id="${deviceId}"]`);
    if (!errorInfo.empty()) {
        errorInfo.remove();
    }
}

// 清除电压信息提示窗
function clearVoltageInfo(deviceId) {
    const svg = d3.select('#topologySVG');
    const voltageInfo = svg.select(`.voltage-info[data-device-id="${deviceId}"]`);
    if (!voltageInfo.empty()) {
        voltageInfo.remove();
    }
}

// 显示电压信息提示窗
function showVoltageInfo(device) {
    const svg = d3.select('#topologySVG');
    const nodeGroup = svg.select(`[data-id="${device.id}"]`);

    if (nodeGroup.empty()) return;

    // 获取设备位置
    const transform = nodeGroup.attr('transform');
    if (!transform) return;

    const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
    if (!match) return;

    const x = parseFloat(match[1]) - 50; // 向左偏移50px
    const y = parseFloat(match[2]) // 向上偏移50px

    // 清除旧的提示窗
    clearVoltageInfo(device.id);

    // 获取电压信息
    const voltageInfo = `V: ${device.voltage || 'N/A'}`;

    // 创建提示窗容器
    const infoGroup = svg.append('g')
        .attr('class', 'voltage-info')
        .attr('data-device-id', device.id)
        .attr('transform', `translate(${x},${y})`);

    let fillColor = 'rgb(74, 144, 226)'
    if (device.voltage.split('v')[0] * 1 < 53.7)
        fillColor = 'rgb(255, 0, 0)'


    // 计算文本宽度以确定提示框大小
    const text = infoGroup.append('text')
        .text(voltageInfo)
        .attr('fill', 'white')
        .attr('font-size', '25px')
        .attr('font-weight', 'bold')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.3em');

    const textWidth = text.node().getBBox().width + 10; // 左右各加5px边距
    const textHeight = 25; // 固定高度

    // 背景矩形
    infoGroup.insert('rect', 'text')
        .attr('width', textWidth)
        .attr('height', textHeight)
        .attr('rx', 5)
        .attr('ry', 5)
        .attr('fill', fillColor)
        .attr('opacity', '1')
        .attr('x', -textWidth / 2)
        .attr('y', -textHeight / 2);

    // 连接到设备的线
    infoGroup.append('line')
        .attr('x1', -5)
        .attr('y1', textHeight / 2)
        .attr('x2', 30)
        .attr('y2', textHeight / 2 + 15)
        .attr('stroke', fillColor)
        .attr('stroke-width', 2)
        .attr('opacity', '1');
}

// 显示错误提示窗
function showErrorInfo(device) {
    const svg = d3.select('#topologySVG');
    const nodeGroup = svg.select(`[data-id="${device.id}"]`);

    if (nodeGroup.empty()) return;

    // 获取设备位置
    const transform = nodeGroup.attr('transform');
    if (!transform) return;

    const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
    if (!match) return;

    const x = parseFloat(match[1]) + 40; // 向右偏移40px
    const y = parseFloat(match[2]) - 60; // 向上偏移60px

    // 清除旧的提示窗
    clearErrorInfo(device.id);

    // 获取错误信息
    const errorInfo = device.error_info || '设备状态异常';

    // 创建提示窗容器
    const infoGroup = svg.append('g')
        .attr('class', 'error-info')
        .attr('data-device-id', device.id)
        .attr('transform', `translate(${x},${y})`);

    // 计算文本宽度以确定提示框大小
    const text = infoGroup.append('text')
        .text(errorInfo)
        .attr('fill', 'white')
        .attr('font-size', '30px')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.3em');

    const textWidth = text.node().getBBox().width + 10; // 左右各加5px边距
    const textHeight = 40; // 固定高度

    // 背景矩形
    infoGroup.insert('rect', 'text')
        .attr('width', textWidth)
        .attr('height', textHeight)
        .attr('rx', 5)
        .attr('ry', 5)
        .attr('fill', '#e74c3c')
        .attr('opacity', '1')
        .attr('x', -textWidth / 2)
        .attr('y', -textHeight / 2);

    // 连接到设备的线
    infoGroup.append('line')
        .attr('x1', -30)
        .attr('y1', textHeight / 2)
        .attr('x2', -10)
        .attr('y2', textHeight / 2 + 15)
        .attr('stroke', '#e74c3c')
        .attr('stroke-width', 2)
        .attr('opacity', '1');

    // 添加点击关闭功能
    infoGroup.on('click', function () {
        clearErrorInfo(device.id);
    });
}

// 更新所有错误提示窗位置
function updateAllErrorInfoPositions(deviceId = '') {
    let needUpdateDevices = []
    if (deviceId) {
        needUpdateDevices = usedDevices.filter(device => device.id === deviceId);
    } else needUpdateDevices = usedDevices;

    needUpdateDevices.forEach(device => {
        const svg = d3.select('#topologySVG');
        const errorInfo = svg.select(`.error-info[data-device-id="${device.id}"]`);
        if (!errorInfo.empty()) {
            const nodeGroup = svg.select(`[data-id="${device.id}"]`);
            const transform = nodeGroup.attr('transform');
            if (transform) {
                const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
                if (match) {
                    const x = parseFloat(match[1]) + 40; // 向右偏移40px
                    const y = parseFloat(match[2]) - 60; // 向上偏移60px
                    errorInfo.attr('transform', `translate(${x},${y})`);
                }
            }
        }
    });
}

// 更新所有电压信息提示窗位置
function updateAllVoltageInfoPositions(deviceId = '') {
    let needUpdateDevices = []
    if (deviceId) {
        needUpdateDevices = usedDevices.filter(device => device.id === deviceId);
    } else needUpdateDevices = usedDevices;

    needUpdateDevices.forEach(device => {
        const svg = d3.select('#topologySVG');
        const voltageInfo = svg.select(`.voltage-info[data-device-id="${device.id}"]`);
        if (!voltageInfo.empty()) {
            const nodeGroup = svg.select(`[data-id="${device.id}"]`);
            const transform = nodeGroup.attr('transform');
            if (transform) {
                const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
                if (match) {
                    const x = parseFloat(match[1]) - 50; // 向左偏移50px
                    const y = parseFloat(match[2])
                    voltageInfo.attr('transform', `translate(${x},${y})`);
                }
            }
        }
    });
}

// 模拟断电事件
document.getElementById('powerOffSimulation').addEventListener('click', () => {
    // 向服务器请求模拟断电
    if (!confirm('确认模拟断电吗？')) {
        return;
    }
    alert('开始模拟断电，市电供电中断')
    fetch('/api/power-off')
        .then(response => response.json())
        .then(data => {
            alert('模拟断电完毕，市电供电恢复')
            console.log('模拟断电完毕:', data);
        })
        .catch(error => {
            console.error('模拟断电失败:', error);
        });
})

// 找到从源节点到目标节点的所有路径
function findAllPaths(sourceId, targetId) {
    const allPaths = [];
    const visited = new Set();

    function dfs(currentId, path) {
        // 避免循环引用
        if (visited.has(currentId)) {
            return;
        }

        // 将当前节点添加到路径中
        path.push(currentId);
        visited.add(currentId);

        // 如果到达目标节点，保存路径
        if (currentId === targetId) {
            allPaths.push([...path]);
        } else {
            // 递归查找所有下游节点
            const outgoingConnections = connections.filter(conn => conn.source === currentId);
            for (const conn of outgoingConnections) {
                dfs(conn.target, path);
            }
        }

        // 回溯
        path.pop();
        visited.delete(currentId);
    }

    dfs(sourceId, []);
    return allPaths;
}

// 检查是否存在可用路径
function hasAvailablePath(sourceIds, targetId) {
    let isAvailable = true;
    for (const sourceId of sourceIds) {
        const allPaths = findAllPaths(sourceId, targetId);
        if (allPaths.length > 0) {
            // 检查所有路径是否可用
            for (const path of allPaths) {
                for (let i = 0; i < path.length - 1; i++) {
                    const conn = connections.find(c => c.source === path[i] && c.target === path[i + 1]);
                    if (conn && conn.flowGroup) {
                        continue;
                    }
                    // 如果路径中有一段是不流动的则证明这个路径不可用
                    isAvailable = false;
                    break;
                }
                if (isAvailable) {
                    return isAvailable
                }
            }
        }
    }
    return isAvailable;
}

// 找到拓扑图广度优先搜索序列
function bfsTopologicalOrder(devices, connections) {
    // 创建邻接表和入度映射
    const graph = new Map();
    const inDegree = new Map();

    // 初始化图结构
    devices.forEach(device => {
        graph.set(device.id, []);
        inDegree.set(device.id, 0);
    });

    // 构建图
    connections.forEach(({ source, target }) => {
        graph.get(source).push(target);
        inDegree.set(target, inDegree.get(target) + 1);
    });

    // 找到所有起点（入度为0的节点）
    const queue = [];
    inDegree.forEach((degree, device) => {
        if (degree === 0) queue.push(device);
    });

    // 执行BFS
    const result = [];
    while (queue.length > 0) {
        const node = queue.shift();
        result.push(devices.find(device => device.id === node));

        // 处理当前节点的所有邻居
        graph.get(node).forEach(neighbor => {
            inDegree.set(neighbor, inDegree.get(neighbor) - 1);
            if (inDegree.get(neighbor) === 0) {
                queue.push(neighbor);
            }
        });
    }

    return result;
}

export {
    addDeviceToCanvas,
    connectDevices
}
