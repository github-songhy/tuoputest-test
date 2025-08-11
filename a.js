// 全局变量
let devices = [];
let usedDiveces = []; // 已使用的设备列表
let connections = []; // 存储连线
let isDragging = false;
let dragSource = null;
let selectedElement = null; // 当前选中的元素（设备或连线）
let connectingDeviceId = null; // 正在连接的设备ID
let deviceIconMapping = {}; // 设备图标映射
let temporaryConnection = null; // 临时连线，用于连接过程中
let showGrid = true; // 是否显示网格
let gridSize = 20; // 网格大小
let panOffset = { x: 0, y: 0 }; // 画布平移偏移
let zoomLevel = 1; // 缩放级别

// 新增边缘计算函数
function getNearestEdge(source, target) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  } else {
    return dy > 0 ? 'bottom' : 'top';
  }
}

function getEdgeMidpoint(bounds, edge) {
  switch(edge) {
    case 'top': return [bounds.x + bounds.width/2, bounds.y];
    case 'bottom': return [bounds.x + bounds.width/2, bounds.y + bounds.height];
    case 'left': return [bounds.x, bounds.y + bounds.height/2];
    case 'right': return [bounds.x + bounds.width, bounds.y + bounds.height/2];
  }
}

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
    document.getElementById('toggleGrid').addEventListener('click', toggleGrid);
};

// 加载设备图标映射
function loadDeviceIconMapping() {
    fetch('device_icon_mapping.json')
        .then(response => response.json())
        .then(data => {
            deviceIconMapping = data;
        })
        .catch(error => {
            console.error('加载设备图标映射失败:', error);
        });

    // 鼠标离开画布事件
    svg.on('mouseleave', function() {
        if (temporaryConnection) {
            temporaryConnection.remove();
            temporaryConnection = null;
        }
    });

    // 鼠标点击事件 - 完成连接
    svg.on('click', function(event) {
        if (connectingDeviceId && event.target === this) {
            // 清除临时连线
            if (temporaryConnection) {
                temporaryConnection.remove();
                temporaryConnection = null;
            }
            connectingDeviceId = null;
        } else if (connectingDeviceId && event.target.classList.contains('node')) {
            // 连接到目标设备
            const targetDeviceId = event.target.closest('.node').dataset.id;
            if (connectingDeviceId !== targetDeviceId) {
                connectDevices(connectingDeviceId, targetDeviceId);
            }
            connectingDeviceId = null;
            if (temporaryConnection) {
                temporaryConnection.remove();
                temporaryConnection = null;
            }
        }
    })
}

// 添加设备到画布
function addDeviceToCanvas(device, x, y) {
    const svg = d3.select('#topologySVG');

    // 检查设备是否已存在
    const existingNode = svg.select(`[data-id="${device.id}"]`);
    if (!existingNode.empty()) return; // 如果设备已存在，则不添加

    // 创建设备节点组
    const node = svg.append('g')
        .attr('class', 'node')
        .attr('data-id', device.id)
        .attr('transform', `translate(${x}, ${y})`)
        .style('cursor', 'move')
        .on('click', function(event) {
            event.stopPropagation();
            resetColor(); // 清除其他元素的选中状态
            selectedElement = this;
            d3.select(this).classed('selected', true); // 添加选中样式
        })
        .on('dblclick', function(event) {
            event.stopPropagation();
            // 开始连接设备
            connectingDeviceId = device.id;
            resetColor();
            d3.select(this).classed('connecting', true);
        });

    // 绘制设备图标或矩形
    const iconPath = deviceIconMapping[device.type] || 'default.png';
    if (iconPath) {
        node.append('image')
            .attr('href', iconPath)
            .attr('width', 40)
            .attr('height', 40)
            .attr('x', -20)
            .attr('y', -20);
    } else {
        node.append('rect')
            .attr('width', 40)
            .attr('height', 40)
            .attr('x', -20)
            .attr('y', -20)
            .attr('rx', 5)
            .attr('fill', '#f0f0f0')
            .attr('stroke', '#666')
            .attr('stroke-width', 2);
    }

    // 添加设备标签
    node.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 30)
        .attr('font-size', 12)
        .text(device.name);

    // 设备拖拽功能
    node.call(d3.drag()
        .on('start', function(event) {
            resetColor();
            selectedElement = this;
            d3.select(this).classed('selected', true);
            connectingDeviceId = null; // 取消连接状态
        })
        .on('drag', function(event) {
            const transform = d3.zoomTransform(svg.node());
            const newX = (event.x / transform.k) - (transform.x / transform.k);
            const newY = (event.y / transform.k) - (transform.y / transform.k);

            // 网格对齐
            const alignedX = Math.round(newX / gridSize) * gridSize;
            const alignedY = Math.round(newY / gridSize) * gridSize;

            d3.select(this).attr('transform', `translate(${alignedX}, ${alignedY})`);

            // 更新相关连线
            updateConnectionsForDevice(device.id);
        })
        .on('end', function() {
            // 更新设备位置
            const transform = d3.select(this).attr('transform');
            const match = transform.match(/translate\(([^,]+),([^\)]+)\)/);
            if (match) {
                const device = devices.find(d => d.id == this.dataset.id);
                if (device) {
                    device.x = parseFloat(match[1]);
                    device.y = parseFloat(match[2]);
                }
            }
        }));

    // 添加到已使用设备列表
    usedDiveces.push(device);
}

// 加载设备数据
function loadDeviceData() {
    // 模拟数据，实际项目中替换为真实API调用
    // 这里使用模拟数据是为了避免依赖后端服务
    const mockData = [
        { id: '1', name: '服务器A', type: 'server', area: '数据中心', station: '主站' },
        { id: '2', name: '交换机B', type: 'switch', area: '数据中心', station: '主站' },
        { id: '3', name: '路由器C', type: 'router', area: '数据中心', station: '备用站' },
        { id: '4', name: '防火墙D', type: 'firewall', area: '网络区域', station: '边界站' },
        { id: '5', name: '存储设备E', type: 'storage', area: '数据中心', station: '主站' }
    ];

    // 使用模拟数据
    devices = mockData;

    // 处理数据，添加必要的属性
    devices.forEach(device => {
        device['x'] = 0;
        device['y'] = 0;
        device.position_x = 0;
        device.position_y = 0;
    });

    // 渲染设备库
    renderDeviceLibrary();
    // 初始化拓扑画布
    initTopologyCanvas();

    // 模拟设备图标映射
    deviceIconMapping = {
        'server': 'server.png',
        'switch': 'switch.png',
        'router': 'router.png',
        'firewall': 'firewall.png',
        'storage': 'storage.png'
    };
}

// 连接设备
function connectDevices(sourceId, targetId) {
    const svg = d3.select('#topologySVG');
    const sourceNode = svg.select(`[data-id="${sourceId}"]`);
    const targetNode = svg.select(`[data-id="${targetId}"]`);

    if (sourceNode.empty() || targetNode.empty()) return;

    // 检查是否已存在相同连接
    const existingConnection = connections.find(conn => 
        conn.sourceId === sourceId && conn.targetId === targetId
    );
    if (existingConnection) return;

    // 创建新连接
    const connectionId = `conn-${Date.now()}`;
    const connection = {
        id: connectionId,
        sourceId: sourceId,
        targetId: targetId
    };
    connections.push(connection);

    // 绘制连线
    drawConnection(connection);
}

// 绘制连线
function drawConnection(connection) {
    const svg = d3.select('#topologySVG');
    const sourceNode = svg.select(`[data-id="${connection.sourceId}"]`);
    const targetNode = svg.select(`[data-id="${connection.targetId}"]`);

    if (sourceNode.empty() || targetNode.empty()) return;

    const sourceBounds = sourceNode.node().getBBox();
    const targetBounds = targetNode.node().getBBox();

    // 计算源设备和目标设备的中心点
    const sourceCenter = {
        x: sourceBounds.x + sourceBounds.width / 2,
        y: sourceBounds.y + sourceBounds.height / 2
    };
    const targetCenter = {
        x: targetBounds.x + targetBounds.width / 2,
        y: targetBounds.y + targetBounds.height / 2
    };

    // 计算最近的边缘
    const sourceEdge = getNearestEdge(sourceCenter, targetCenter);
    const targetEdge = getNearestEdge(targetCenter, sourceCenter);

    // 获取边缘中点
    const [startX, startY] = getEdgeMidpoint(sourceBounds, sourceEdge);
    const [endX, endY] = getEdgeMidpoint(targetBounds, targetEdge);

    // 创建连线组
    const connectionGroup = svg.append('g')
        .attr('class', 'connection')
        .attr('data-id', connection.id)
        .on('click', function(event) {
            event.stopPropagation();
            resetColor();
            selectedElement = this;
            d3.select(this).classed('selected', true);
        });

    // 创建折线路径（使用直角折线）
    let pathData;
    if (sourceEdge === 'right' && targetEdge === 'left') {
        // 水平连接
        const midY = (startY + endY) / 2;
        pathData = `M ${startX},${startY} H ${startX + 30} V ${midY} H ${endX - 30} V ${endY} H ${endX}`;
    } else if (sourceEdge === 'bottom' && targetEdge === 'top') {
        // 垂直连接
        const midX = (startX + endX) / 2;
        pathData = `M ${startX},${startY} V ${startY + 30} H ${midX} V ${endY - 30} H ${endX} V ${endY}`;
    } else if (sourceEdge === 'right' && targetEdge === 'top') {
        // 右到上
        pathData = `M ${startX},${startY} H ${startX + 30} V ${endY} H ${endX}`;
    } else if (sourceEdge === 'right' && targetEdge === 'bottom') {
        // 右到下
        pathData = `M ${startX},${startY} H ${startX + 30} V ${endY} H ${endX}`;
    } else if (sourceEdge === 'left' && targetEdge === 'top') {
        // 左到上
        pathData = `M ${startX},${startY} H ${startX - 30} V ${endY} H ${endX}`;
    } else if (sourceEdge === 'left' && targetEdge === 'bottom') {
        // 左到下
        pathData = `M ${startX},${startY} H ${startX - 30} V ${endY} H ${endX}`;
    } else if (sourceEdge === 'bottom' && targetEdge === 'left') {
        // 下到左
        pathData = `M ${startX},${startY} V ${startY + 30} H ${endX} V ${endY}`;
    } else if (sourceEdge === 'bottom' && targetEdge === 'right') {
        // 下到右
        pathData = `M ${startX},${startY} V ${startY + 30} H ${endX} V ${endY}`;
    } else if (sourceEdge === 'top' && targetEdge === 'left') {
        // 上到左
        pathData = `M ${startX},${startY} V ${startY - 30} H ${endX} V ${endY}`;
    } else if (sourceEdge === 'top' && targetEdge === 'right') {
        // 上到右
        pathData = `M ${startX},${startY} V ${startY - 30} H ${endX} V ${endY}`;
    } else if (sourceEdge === 'left' && targetEdge === 'right') {
        // 左到右
        const midY = (startY + endY) / 2;
        pathData = `M ${startX},${startY} H ${startX - 30} V ${midY} H ${endX + 30} V ${endY} H ${endX}`;
    } else if (sourceEdge === 'top' && targetEdge === 'bottom') {
        // 上到下
        const midX = (startX + endX) / 2;
        pathData = `M ${startX},${startY} V ${startY - 30} H ${midX} V ${endY + 30} H ${endX} V ${endY}`;
    } else {
        // 默认直接连接
        pathData = `M ${startX},${startY} L ${endX},${endY}`;
    }

    // 创建路径元素
    connectionGroup.append('path')
        .attr('d', pathData)
        .attr('fill', 'none')
        .attr('stroke', '#666')
        .attr('stroke-width', 2)
        .attr('marker-end', 'url(#arrowhead)');

    // 创建箭头标记
    if (svg.select('#arrowhead').empty()) {
        svg.append('defs').append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 9)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M 0,-5 L 10,0 L 0,5')
            .attr('fill', '#666');
    }
}

// 更新设备相关的连线
function updateConnectionsForDevice(deviceId) {
    const svg = d3.select('#topologySVG');

    // 移除所有旧连线
    svg.selectAll('.connection').remove();

    // 重新绘制所有连线
    connections.forEach(connection => {
        drawConnection(connection);
    });
}

// 清除选中状态
function resetColor() {
    d3.selectAll('.node').classed('selected', false).classed('connecting', false);
    d3.selectAll('.connection').classed('selected', false);
    selectedElement = null;
}

// 保存拓扑图
function saveTopology() {
    const topologyData = {
        devices: usedDiveces,
        connections: connections
    };

    localStorage.setItem('topologyData', JSON.stringify(topologyData));
    alert('拓扑图保存成功!');
}

// 重置画布
function resetCanvas() {
    const svg = d3.select('#topologySVG');
    svg.selectAll('.node').remove();
    svg.selectAll('.connection').remove();
    usedDiveces = [];
    connections = [];
    selectedElement = null;
    connectingDeviceId = null;

    // 重置缩放和平移
    svg.transition().duration(500).call(
        d3.zoom().transform, d3.zoomIdentity
    );
    zoomLevel = 1;
    panOffset = { x: 0, y: 0 };
}

// 加载拓扑图
function loadTopology() {
    const savedData = localStorage.getItem('topologyData');
    if (!savedData) {
        alert('没有找到保存的拓扑图数据!');
        return;
    }

    const topologyData = JSON.parse(savedData);
    resetCanvas();

    // 加载设备
    topologyData.devices.forEach(device => {
        addDeviceToCanvas(device, device.x, device.y);
    });

    // 加载连线
    topologyData.connections.forEach(connection => {
        connections.push(connection);
        drawConnection(connection);
    });
}

// 切换网格显示
function toggleGrid() {
    showGrid = !showGrid;
    const svg = d3.select('#topologySVG');
    svg.selectAll('.grid-line').remove();

    if (showGrid) {
        drawGrid();
    }
}

// 绘制网格
function drawGrid() {
    const svg = d3.select('#topologySVG');
    const width = svg.node().clientWidth;
    const height = svg.node().clientHeight;

    // 水平网格线
    const horizontalLines = svg.selectAll('.horizontal-grid')
        .data(d3.range(0, height, gridSize))
        .enter().append('line')
        .attr('class', 'grid-line horizontal-grid')
        .attr('x1', 0)
        .attr('y1', d => d)
        .attr('x2', width)
        .attr('y2', d => d)
        .attr('stroke', '#eee')
        .attr('stroke-width', 1);

    // 垂直网格线
    const verticalLines = svg.selectAll('.vertical-grid')
        .data(d3.range(0, width, gridSize))
        .enter().append('line')
        .attr('class', 'grid-line vertical-grid')
        .attr('x1', d => d)
        .attr('y1', 0)
        .attr('x2', d => d)
        .attr('y2', height)
        .attr('stroke', '#eee')
        .attr('stroke-width', 1);
}

// 更新设备显示状态
function updateDeviceDisplay() {
    const svg = d3.select('#topologySVG');

    // 模拟设备状态变化
    usedDiveces.forEach(device => {
        // 随机设置设备状态
        device.status = Math.random() > 0.7 ? 'error' : 'normal';

        const node = svg.select(`[data-id="${device.id}"]`);
        if (!node.empty()) {
            // 更新设备边框颜色
            const rect = node.select('rect');
            if (!rect.empty()) {
                rect.attr('stroke', device.status === 'error' ? 'red' : '#666');
            }

            // 更新或添加警告图标
            if (device.status === 'error') {
                addWarningIcon(node);
            } else {
                node.select('.warning-icon').remove();
            }
        }
    });
}

// 添加警告图标
function addWarningIcon(node) {
    // 检查是否已存在警告图标
    if (node.select('.warning-icon').empty()) {
        node.append('circle')
            .attr('class', 'warning-icon')
            .attr('cx', 15)
            .attr('cy', -15)
            .attr('r', 8)
            .attr('fill', 'red');

        node.append('text')
            .attr('class', 'warning-icon')
            .attr('x', 15)
            .attr('y', -12)
            .attr('text-anchor', 'middle')
            .attr('font-size', 12)
            .attr('fill', 'white')
            .text('!');
    }
}

// 查找下游设备
function findDownstreamDevices(deviceId, visited = new Set()) {
    if (visited.has(deviceId)) return [];

    visited.add(deviceId);
    const downstream = [];

    // 查找所有从当前设备出发的连接
    const outgoingConnections = connections.filter(conn => conn.sourceId === deviceId);

    outgoingConnections.forEach(conn => {
        downstream.push(conn.targetId);
        // 递归查找下游设备的下游
        downstream.push(...findDownstreamDevices(conn.targetId, visited));
    });

    return [...new Set(downstream)]; // 去重
}

// 定期更新拓扑状态
function startTopologyUpdates() {
    setInterval(updateDeviceDisplay, 5000);
    // 立即更新一次
    updateDeviceDisplay();
}

// 键盘事件处理
document.addEventListener('keydown', function(event) {
    if (event.key === 'Delete' && selectedElement) {
        const id = selectedElement.dataset.id;

        if (selectedElement.classList.contains('node')) {
            // 删除设备
            const deviceIndex = usedDiveces.findIndex(d => d.id == id);
            if (deviceIndex !== -1) {
                usedDiveces.splice(deviceIndex, 1);
            }

            // 删除相关连线
            connections = connections.filter(conn => 
                conn.sourceId !== id && conn.targetId !== id
            );

            // 更新显示
            d3.select(selectedElement).remove();
            d3.selectAll('.connection').remove();
            connections.forEach(connection => drawConnection(connection));
        } else if (selectedElement.classList.contains('connection')) {
            // 删除连线
            connections = connections.filter(conn => conn.id !== id);
            d3.select(selectedElement).remove();
        }

        selectedElement = null;
    }
});

// 初始化图表定义
function initSvgDefs() {
    const svg = d3.select('#topologySVG');
    if (svg.select('defs').empty()) {
        svg.append('defs');
    }
}

// 修复加载设备图标映射函数中的错误
function loadDeviceIconMapping() {
    fetch('device_icon_mapping.json')
        .then(response => response.json())
        .then(data => {
            deviceIconMapping = data;
        })
        .catch(error => {
            console.error('加载设备图标映射失败:', error);
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

// 初始化拓扑画布
function initTopologyCanvas() {
    const svg = d3.select('#topologySVG');
    const svgContainer = d3.select('#svgContainer');

    // 初始化SVG定义
    initSvgDefs();

    // 绘制网格
    if (showGrid) drawGrid();

    // 启动拓扑状态更新
    startTopologyUpdates();

    // 画布缩放功能
    svg.call(d3.zoom()
        .scaleExtent([0.5, 2])
        .on('zoom', function(event) {
            zoomLevel = event.transform.k;
            svg.attr('transform', event.transform);
        }));

    // 画布拖拽功能
    svg.call(d3.drag()
        .on('start', function (event) {
            if (!event.sourceEvent.target.classList.contains('node') && !event.sourceEvent.target.classList.contains('connection')) {
                isDragging = true;
                resetColor(); // 清除选中状态
                selectedElement = null; // 清除选中元素
                connectingDeviceId = null; // 清除正在连接的设备ID
            }
        })
        .on('drag', function (event) {
            if (isDragging) {
                const transform = d3.zoomTransform(this);
                const newTransform = d3.zoomIdentity
                    .translate(transform.x + event.dx, transform.y + event.dy)
                    .scale(transform.k);
                d3.select(this).attr('transform', newTransform);
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
                // 计算实际坐标（考虑缩放和平移）
                const pt = d3.clientPoint(this, e);
                const transform = d3.zoomTransform(this);
                const x = (pt[0] - transform.x) / transform.k;
                const y = (pt[1] - transform.y) / transform.k;

                // 网格对齐
                const alignedX = Math.round(x / gridSize) * gridSize;
                const alignedY = Math.round(y / gridSize) * gridSize;

                addDeviceToCanvas(device, alignedX, alignedY);
                dragSource = null;
            }
        }
    });

    // 允许放置
    svg.on('dragover', function (e) {
        e.preventDefault();
    });

    // 鼠标移动事件 - 用于临时连线
    svg.on('mousemove', function(event) {
        if (connectingDeviceId) {
            const svg = d3.select('#topologySVG');
            const sourceNode = svg.select(`[data-id="${connectingDeviceId}"]`);
            if (!sourceNode.empty()) {
                const sourceBounds = sourceNode.node().getBBox();
                const transform = d3.zoomTransform(svg.node());
                const mouseX = (event.clientX - transform.x) / transform.k;
                const mouseY = (event.clientY - transform.y) / transform.k;
                
                const sourceCenter = {
                    x: sourceBounds.x + sourceBounds.width / 2,
                    y: sourceBounds.y + sourceBounds.height / 2
                };
                const target = { x: mouseX, y: mouseY };
                const edge = getNearestEdge(sourceCenter, target);
                const [startX, startY] = getEdgeMidpoint(sourceBounds, edge);
                
                if (!temporaryConnection) {
                    temporaryConnection = svg.append('line')
                        .attr('class', 'temporary-connection')
                        .attr('stroke', '#999')
                        .attr('stroke-width', 2)
                        .attr('stroke-dasharray', '5,5');
                }
                
                temporaryConnection
                    .attr('x1', startX)
                    .attr('y1', startY)
                    .attr('x2', mouseX)
                    .attr('y2', mouseY);
            }
        }
    })
}