// 全局变量
let devices = [];
let usedDevices = []; // 已使用的设备列表
let connections = []; // 存储连线
let isDragging = false;
let dragSource = null;
let selectedElement = null; // 当前选中的元素（设备或连线）
let connectingDeviceId = null; // 正在连接的设备ID
let deviceIconMapping = {}; // 设备图标映射

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
    fetch('device_icon_mapping.json')
        .then(response => response.json())
        .then(data => {
            deviceIconMapping = data;
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
            devices = data;

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
                selectedElement = null; // 清除选中元素
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
                selectedElement = null; // 清除选中元素
                connectingDeviceId = null; // 清除正在连接的设备ID
            })
            .on('end', function (event, d) {
                // 更新位置数据
                d.x = event.x;
                d.y = event.y;
            }));

    // 设备状态指示
    let statusColor = '#2ecc71'; // 正常状态
    if (device.status === 'warning') statusColor = '#f1c40f'; // 警告状态
    if (device.status === 'error') statusColor = '#e74c3c'; // 故障状态

    // 使用设备图标映射中的图片
    const iconPath = deviceIconMapping[device.type] || 'device_icons/hv.svg'; // 默认使用HV图标
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
        .attr('dy', 30)
        .attr('fill', 'black')
        .attr('font-size', '10px');

    // 移除了固定连接点，现在可以从设备任意位置连接
    // 添加点击事件以支持从任意位置开始连接
    nodeGroup.on('mousedown', function(event, d) {
        if (event.ctrlKey) {
            connectingDeviceId = d.id;
            resetColor();
            d3.select(this).select('image').attr('stroke', '#ff0');
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
        selectedElement = {
            type: 'device',
            id: d.id
        };
        // 高亮选中的设备
        d3.select(this).select('image').attr('stroke', '#ff0').attr('stroke-width', 4);
    })

    // 添加到已使用的设备列表
    usedDevices.push(device);
}

// 更新设备的所有连线
function updateDeviceConnections(deviceId = '') {
    svg = d3.select('#topologySVG');
    // 遍历所有连线
    connections.forEach(conn => {
        // 如果操作的是单个元素检查连线是否连接到当前设备      
        if (conn.source == deviceId || conn.target == deviceId) {
            // 获取源设备坐标
            const sourceNode = svg.select(`[data-id="${conn.source}"]`);
            const sourceX = parseFloat(sourceNode.attr('transform').split('(')[1].split(',')[0]);
            const sourceY = parseFloat(sourceNode.attr('transform').split(',')[1].split(')')[0]);

            // 获取目标设备坐标
            const targetNode = svg.select(`[data-id="${conn.target}"]`);
            const targetX = parseFloat(targetNode.attr('transform').split('(')[1].split(',')[0]);
            const targetY = parseFloat(targetNode.attr('transform').split(',')[1].split(')')[0]);

            // 计算转折点 - 更新折线路径
            const midX = (sourceX + targetX) / 2;
            const midY = (sourceY + targetY) / 2;

            let pathData;

            // 根据设备位置关系决定折线方向
            if (Math.abs(sourceX - targetX) > Math.abs(sourceY - targetY)) {
                // 水平为主的连线，在中间位置垂直弯折
                pathData = `M ${sourceX} ${sourceY} H ${midX} V ${targetY} H ${targetX}`;
            } else {
                // 垂直为主的连线，在中间位置水平弯折
                pathData = `M ${sourceX} ${sourceY} V ${midY} H ${targetX} V ${targetY}`;
            }

            // 更新连线路径
            conn.element.attr('d', pathData);
        }
    });
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

// 保存拓扑
function saveTopology() {
    // 让用户输入自定义文件名
    let fileName = prompt('请输入拓扑文件名:', 'topology_' + new Date().toISOString().replace(/[:.]/g, '-'));
    
    // 如果用户取消了输入，则不执行保存
    if (fileName === null) return;
    
    // 确保文件名有效
    if (!fileName.endsWith('.json')) {
        fileName += '.json';
    }
    
    // 收集设备信息
    const topologyData = {
        fileName: fileName,
        devices: usedDevices.map(device => ({
            id: device.id,
            name: device.name,
            type: device.type,
            status: device.status,
            x: device.x,
            y: device.y
        })),
        connections: connections.map(conn => ({
            source: conn.source,
            target: conn.target
        }))
    };

    // 发送到后端保存
    fetch('http://localhost:3000/api/save-topology', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(topologyData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(`拓扑图已成功保存为 ${fileName}`);
        } else {
            alert('保存拓扑图失败: ' + data.message);
        }
    })
    .catch(error => {
        console.error('保存拓扑图失败:', error);
        alert('保存拓扑图失败，请确保后端服务正在运行');
    });
}

// 加载拓扑
function loadTopology() {
    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'topology-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>选择拓扑文件</h3>
                <span class="close-modal">&times;</span>
            </div>
            <div class="modal-body">
                <div class="search-container">
                    <input type="text" id="topology-search" placeholder="搜索文件名...">
                </div>
                <div class="topology-list"></div>
                <div class="no-files" style="display: none; text-align: center; padding: 20px;">没有找到拓扑文件</div>
            </div>
            <div class="modal-footer">
                <button class="btn-cancel">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 关闭模态框
    function closeModal() {
        modal.remove();
    }

    modal.querySelector('.close-modal').addEventListener('click', closeModal);
    modal.querySelector('.btn-cancel').addEventListener('click', closeModal);

    // 点击模态框外部关闭
    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeModal();
        }
    });

    // 加载拓扑文件列表
    function loadTopologyFiles() {
        fetch('http://localhost:3000/api/topology-files')
            .then(response => response.json())
            .then(files => {
                const topologyList = modal.querySelector('.topology-list');
                const noFilesMessage = modal.querySelector('.no-files');

                topologyList.innerHTML = '';

                if (files.length === 0) {
                    noFilesMessage.style.display = 'block';
                    return;
                }

                noFilesMessage.style.display = 'none';

                files.forEach(file => {
                    const item = document.createElement('div');
                    item.className = 'topology-item';
                    item.innerHTML = `
                        <div class="topology-info">
                            <div class="topology-name">${file.name}</div>
                            <div class="topology-time">创建时间: ${file.createdTime}</div>
                        </div>
                        <div class="topology-actions">
                            <button class="btn-load">加载</button>
                            <button class="btn-delete">删除</button>
                        </div>
                    `;
                    topologyList.appendChild(item);

                    // 加载按钮事件
                    item.querySelector('.btn-load').addEventListener('click', function() {
                        loadSelectedTopology(file.name);
                    });

                    // 删除按钮事件
                    item.querySelector('.btn-delete').addEventListener('click', function() {
                        if (confirm(`确定要删除文件 ${file.name} 吗？`)) {
                            deleteTopologyFile(file.name);
                        }
                    });
                });

                // 添加搜索功能
                const searchInput = document.getElementById('topology-search');
                searchInput.addEventListener('input', function() {
                    const searchTerm = searchInput.value.toLowerCase();
                    const items = document.querySelectorAll('.topology-item');

                    items.forEach(item => {
                        const fileName = item.querySelector('.topology-name').textContent.toLowerCase();
                        if (fileName.includes(searchTerm)) {
                            item.style.display = 'flex';
                        } else {
                            item.style.display = 'none';
                        }
                    });
                });
            })
            .catch(error => {
                console.error('加载拓扑文件列表失败:', error);
                alert('加载拓扑文件列表失败，请确保后端服务正在运行');
            });
    }

    // 加载选中的拓扑文件
    function loadSelectedTopology(filename) {
        fetch(`http://localhost:3000/saved_topologies/${filename}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`无法加载文件: ${response.statusText}`);
                }
                return response.json();
            })
            .then(topologyData => {
                try {
                    // 清空当前画布
                    resetCanvas(false); // 传递false参数不显示确认对话框

                    // 渲染设备
                    topologyData.devices.forEach(device => {
                        // 查找原始设备数据
                        const originalDevice = devices.find(d => d.id == device.id);
                        if (originalDevice) {
                            // 复制原始设备的所有属性
                            const deviceToAdd = Object.assign({}, originalDevice);
                            // 更新位置
                            deviceToAdd.x = device.x;
                            deviceToAdd.y = device.y;

                            // 添加到画布
                            addDeviceToCanvas(deviceToAdd, device.x, device.y);
                        }
                    });

                    // 渲染连接
                    topologyData.connections.forEach(conn => {
                        const sourceDevice = usedDevices.find(d => d.id == conn.source);
                        const targetDevice = usedDevices.find(d => d.id == conn.target);

                        if (sourceDevice && targetDevice) {
                            // 创建连接线
                            connectDevices(sourceDevice.id, targetDevice.id);
                        }
                    });

                    alert('拓扑图加载成功！');
                    closeModal();
                } catch (e) {
                    console.error('解析拓扑数据失败:', e);
                    alert('解析拓扑数据失败: ' + e.message);
                }
            })
            .catch(error => {
                console.error('加载拓扑文件失败:', error);
                alert('加载拓扑文件失败: ' + error.message);
            });
    }

    // 删除拓扑文件
    function deleteTopologyFile(filename) {
        fetch('http://localhost:3000/api/delete-topology', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filename: filename })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert(`文件 ${filename} 已成功删除`);
                    // 重新加载文件列表
                    loadTopologyFiles();
                } else {
                    alert('删除失败: ' + data.message);
                }
            })
            .catch(error => {
                console.error('删除拓扑文件失败:', error);
                alert('删除拓扑文件失败，请确保后端服务正在运行');
            });
    }

    // 初始加载文件列表
    loadTopologyFiles();

}

// 重置画布
function resetCanvas(showConfirm = true) {
    if (showConfirm && !confirm('确定要清空画布吗？')) {
        return;
    }
    d3.select('#topologySVG').selectAll('*').remove();
    document.getElementById('propertyForm').innerHTML = '';
    usedDevices = []; // 清空已使用的设备列表
    connections = []; // 清空连线

    resetColor(); // 清除选中状态
    selectedElement = null;
    connectingDeviceId = null; // 正在连接的设备ID
}

// 连接设备
function connectDevices(sourceId, targetId) {

    // 如果连线已经存在，则不再创建
    const existingConnection = connections.find(conn => conn.source === sourceId && conn.target === targetId);
    if (existingConnection) {
        return;
    }

    const svg = d3.select('#topologySVG');
    const sourceNode = svg.select(`[data-id="${sourceId}"]`);
    const targetNode = svg.select(`[data-id="${targetId}"]`);

    // 未选择设备则不连线
    if (sourceNode.empty() || targetNode.empty()) return;

    const sourceX = parseFloat(sourceNode.attr('transform').split('(')[1].split(',')[0]);
    const sourceY = parseFloat(sourceNode.attr('transform').split(',')[1].split(')')[0]);
    const targetX = parseFloat(targetNode.attr('transform').split('(')[1].split(',')[0]);
    const targetY = parseFloat(targetNode.attr('transform').split(',')[1].split(')')[0]);

    // 创建连线并设置ID
    const connectionId = `conn-${sourceId}-${targetId}`;

    // 计算转折点 - 实现直角折线
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;
    let pathData;

    // 根据设备位置关系决定折线方向
    if (Math.abs(sourceX - targetX) > Math.abs(sourceY - targetY)) {
        // 水平为主的连线，在中间位置垂直弯折
        pathData = `M ${sourceX} ${sourceY} H ${midX} V ${targetY} H ${targetX}`;
    } else {
        // 垂直为主的连线，在中间位置水平弯折
        pathData = `M ${sourceX} ${sourceY} V ${midY} H ${targetX} V ${targetY}`;
    }

    const path = svg.append('path')
        .attr('d', pathData)
        .attr('stroke', '#999')
        .attr('stroke-width', 3)
        .attr('fill', 'none')
        .attr('marker-end', `url(#${connectionId}-arrow)`)
        .attr('class', 'connection')
        .attr('data-id', connectionId);

    // 添加箭头标记
    svg.append('defs').append('marker')
        .attr('id', connectionId + '-arrow')
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 5)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 3)
        .attr('markerHeight', 3)
        .attr('xoverflow', 'visible')
        .append('svg:path')
        .attr('d', 'M 0,-5 L 10,0 L 0,5')
        .attr('fill', '#999');

    // 存储连线
    connections.push({
        id: connectionId,
        element: path,
        source: sourceId,
        target: targetId
    });
}

// 添加点击事件、连接事件处理
d3.select('#topologySVG').on('click', function (event) {

    // 清除上次选中状态
    resetColor();

    // 如果点击的是空白区域，清除选中状态,
    // 防止与设备元素点击的函数冲突
    // 因为会先触发元素的注册的点击事件，设置selectedElement的值，再触发画布的点击
    if (event.target === this) { // this是画布本身，也即点击的是空白部分
        selectedElement = null;
        connectingDeviceId = null; // 清除正在连接的设备ID
        return;
    }

    // 选中连线
    if (event.target.classList.contains('connection')) {
        // 获取连线ID
        const connectionId = event.target.getAttribute('data-id');
        selectedElement = {
            type: 'connection',
            id: connectionId
        };
        // 高亮选中的连线
        d3.select(event.target).attr('stroke', '#ff0').attr('stroke-width', 4);
        d3.select(`#${selectedElement.id}-arrow path`).attr('fill', '#ff0');

    }
    // 点击设备（会先触发设备的点击事件，selectedElement会被设置为设备的信息）
    else if (selectedElement !== null && selectedElement.type === 'device') {
        
        const deviceId = selectedElement.id;

        showPropertyPanel(usedDevices.find(d => d.id === deviceId));

        // 连接逻辑
        if (!connectingDeviceId) {
            // 开始连接
            connectingDeviceId = deviceId;
            // 使用d3找到id与这个设备对应的连接点并高亮
            d3.select(`[data-id="${connectingDeviceId}"] image`).attr('stroke', '#ff0').attr('stroke-width', 3);


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
    if (selectedElement === null) {
        return;
    }
    // 设备节点
    if (selectedElement.type === 'device') {
        //清除高亮
        d3.select(`[data-id="${selectedElement.id}"] image`).attr('stroke', '#2ecc71').attr('stroke-width', 3);
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
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElement) {
        const svg = d3.select('#topologySVG');

        if (selectedElement.type === 'device') {
            // 删除设备
            const deviceId = selectedElement.id;

            // 删除设备节点
            svg.select(`[data-id="${deviceId}"]`).remove();

            // 从usedDevices数组中移除
            usedDevices = usedDevices.filter(d => d.id !== deviceId);

            // 删除相关连线
            const relatedConnections = connections.filter(conn =>
                conn.source === deviceId || conn.target === deviceId
            );

            relatedConnections.forEach(conn => {
                conn.element.remove();
            });

            // 从connections数组中移除
            connections = connections.filter(conn =>
                conn.source !== deviceId && conn.target !== deviceId
            );

            // 清除属性面板
            document.getElementById('propertyForm').innerHTML = '';
        } else if (selectedElement.type === 'connection') {
            // 删除连线
            const connectionId = selectedElement.id;

            // 找到并删除连线
            const connection = connections.find(conn => conn.id === connectionId);
            if (connection) {
                connection.element.remove();
                connections = connections.filter(conn => conn.id !== connectionId);
            }
        }
        // 清除选中状态
        selectedElement = null;
    }
});

// 定时更新拓扑状态
function startTopologyUpdates() {
    // 每2秒更新一次
    setInterval(updateTopologyStatus, 200000);
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

            // 更新设备状态
            usedDevices.forEach(device => {
                const newStatus = deviceStatuses[device.id] || device.status;
                if (newStatus !== device.status) {
                    device.status = newStatus;

                    // 更新设备显示
                    updateDeviceDisplay(device);

                    // 如果变为异常状态，添加到异常设备集合
                    if (newStatus === 'warning' || newStatus === 'error') {
                        abnormalDevices.add(device.id);
                    }
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
