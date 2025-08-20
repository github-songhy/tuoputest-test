import { devices, usedDevices, connections, connFormat } from './global-variable.js';
import { CONNECTION_STYLES, CONNECTION_TYPES } from './constants.js';
import {addDeviceToCanvas,connectDevices} from './canvas.js';
import { updateDeviceConnections, addFlowEffect } from './connection.js';

const connTypeSelect = document.getElementById("connTypeSelect");
const connStyleSelect = document.getElementById("connStyleSelect");

// // 填充连线类型选择框
Object.keys(CONNECTION_TYPES).forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    connTypeSelect.appendChild(option);
});

// 填充连线样式选择框
Object.keys(CONNECTION_STYLES).forEach(style => {
    const option = document.createElement('option');
    option.value = style;
    option.textContent = style;
    connStyleSelect.appendChild(option);
});

// 添加事件监听器获取选中值
connTypeSelect.addEventListener("change", function() {
    const selectedValue = this.value;    
    if (selectedValue) {
        connFormat.type = CONNECTION_TYPES[selectedValue];
        updateDeviceConnections(undefined, connFormat.type, undefined);
    }
});

connStyleSelect.addEventListener("change", function() {
    const selectedValue = this.options[this.selectedIndex].value;  
    if (selectedValue) {
        connFormat.style = CONNECTION_STYLES[selectedValue];
        updateDeviceConnections(undefined, undefined, connFormat.style);
    }
});


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
    fetch('http://132.97.69.123:3000/api/save-topology', {
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
    modal.addEventListener('click', function (event) {
        if (event.target === modal) {
            closeModal();
        }
    });

    // 加载拓扑文件列表
    function loadTopologyFiles() {
        fetch('http://132.97.69.123:3000/api/topology-files')
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
                    item.querySelector('.btn-load').addEventListener('click', function () {
                        loadSelectedTopology(file.name);
                    });

                    // 删除按钮事件
                    item.querySelector('.btn-delete').addEventListener('click', function () {
                        if (confirm(`确定要删除文件 ${file.name} 吗？`)) {
                            deleteTopologyFile(file.name);
                        }
                    });
                });

                // 添加搜索功能
                const searchInput = document.getElementById('topology-search');
                searchInput.addEventListener('input', function () {
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
        fetch(`http://132.97.69.123:3000/saved_topologies/${filename}`)
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
        fetch('http://132.97.69.123:3000/api/delete-topology', {
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
    usedDevices.length = 0 // 清空已使用的设备列表
    connections.length = 0; ; // 清空连线
}

export {
    resetCanvas,
    loadTopology,
    saveTopology
}
