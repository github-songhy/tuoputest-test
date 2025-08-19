import { connections, connFormat, originConnColor } from './global-variable.js';
import { CONNECTION_STYLES_DETAIL, PATH_DETAIL } from './constants.js';

// 解析transform属性获取位置的工具函数
function parseTransform(transform) {
    const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
    return match ? {
        x: parseFloat(match[1]),
        y: parseFloat(match[2])
    } : { x: 0, y: 0 };
}

// 生成连线路径数据的工具函数 - 支持五种不同风格
function generatePathData(sourceX, sourceY, targetX, targetY, conntype = connFormat.type) {
    // 计算基础向量和距离
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const isHorizontalDominant = Math.abs(dx) > Math.abs(dy);

    // 根据风格选择不同的路径生成策略
    switch (conntype) {
        case 'right-angle':
            return generateRightAnglePath(sourceX, sourceY, targetX, targetY, isHorizontalDominant);
        case 'direct-line':
            return generateDirectLinePath(sourceX, sourceY, targetX, targetY);
        case 'segmented':
            return generateSegmentedPath(sourceX, sourceY, targetX, targetY, isHorizontalDominant);
        case 'hierarchical':
            return generateHierarchicalPath(sourceX, sourceY, targetX, targetY, isHorizontalDominant);
        case 'smooth-curve':
        default:
            return generateSmoothCurvePath(sourceX, sourceY, targetX, targetY, isHorizontalDominant, distance);
    }

    /**
     * 1. 平滑曲线连接 - 现代简约风格，适合大多数拓扑图
     * 特点：使用贝塞尔曲线，根据距离动态调整曲率，过渡自然
     */
    function generateSmoothCurvePath(sourceX, sourceY, targetX, targetY, isHorizontalDominant, distance) {
        // 根据距离动态调整控制点距离，避免过弯
        const controlDistance = Math.max(50, Math.min(distance * 0.3, 200));
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;

        if (isHorizontalDominant) {
            // 水平方向为主，控制点左右分布
            const controlX1 = sourceX + (dx > 0 ? controlDistance : -controlDistance);
            const controlX2 = targetX - (dx > 0 ? controlDistance : -controlDistance);
            return `M ${sourceX} ${sourceY} C ${controlX1} ${sourceY}, ${controlX2} ${targetY}, ${targetX} ${targetY}`;
        } else {
            // 垂直方向为主，控制点上下分布
            const controlY1 = sourceY + (dy > 0 ? controlDistance : -controlDistance);
            const controlY2 = targetY - (dy > 0 ? controlDistance : -controlDistance);
            return `M ${sourceX} ${sourceY} C ${sourceX} ${controlY1}, ${targetX} ${controlY2}, ${targetX} ${targetY}`;
        }
    }

    /**
     * 2. 直角折线 - 技术感强，适合网络拓扑图
     * 特点：严格直角转折，清晰展示连接关系，转折点位于中心偏移处
     */
    function generateRightAnglePath(sourceX, sourceY, targetX, targetY, isHorizontalDominant) {
        // 计算转折点，略微偏离中心使线条更美观
        const offsetRatio = PATH_DETAIL.offsetRatio; // 偏离中心的比例，使线条更自然
        const midX = sourceX + (targetX - sourceX) * offsetRatio;
        const midY = sourceY + (targetY - sourceY) * offsetRatio;

        if (isHorizontalDominant) {
            // 水平为主：先水平后垂直
            return `M ${sourceX} ${sourceY} H ${midX} V ${targetY} H ${targetX}`;
        } else {
            // 垂直为主：先垂直后水平
            return `M ${sourceX} ${sourceY} V ${midY} H ${targetX} V ${targetY}`;
        }
    }

    /**
     * 3. 两点直线 - 简洁直接，适合简单关系展示
     * 特点：两点之间直线连接，添加微小偏移避免与节点重叠
     */
    function generateDirectLinePath(sourceX, sourceY, targetX, targetY) {
        // 计算方向向量，用于微小偏移避免与节点重叠
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const offset = PATH_DETAIL.offset; // 偏移像素

        // 计算偏移后的起点和终点
        const startX = sourceX + (dx / length) * offset;
        const startY = sourceY + (dy / length) * offset;
        const endX = targetX - (dx / length) * offset;
        const endY = targetY - (dy / length) * offset;

        return `M ${startX} ${startY} L ${endX} ${endY}`;
    }

    /**
     * 4. 分段曲线 - 适合复杂流程图，多转折点但保持平滑
     * 特点：使用多段贝塞尔曲线，适合长距离连接
     */
    function generateSegmentedPath(sourceX, sourceY, targetX, targetY, isHorizontalDominant) {
        // 计算中间控制点
        const midX = (sourceX + targetX) / 2;
        const midY = (sourceY + targetY) / 2;

        // 额外控制点，创建更自然的分段曲线
        const controlOffset = isHorizontalDominant ?
            Math.abs(targetY - sourceY) * 0.3 :
            Math.abs(targetX - sourceX) * 0.3;

        if (isHorizontalDominant) {
            // 水平为主的三段曲线
            return `M ${sourceX} ${sourceY} 
            C ${midX * 0.7 + sourceX * 0.3} ${sourceY - controlOffset}, 
                ${midX * 0.3 + sourceX * 0.7} ${midY}, 
                ${midX} ${midY} 
            S ${midX * 0.3 + targetX * 0.7} ${targetY + controlOffset}, 
                ${targetX} ${targetY}`;
        } else {
            // 垂直为主的三段曲线
            return `M ${sourceX} ${sourceY} 
            C ${sourceX - controlOffset} ${midY * 0.7 + sourceY * 0.3}, 
                ${midX} ${midY * 0.3 + sourceY * 0.7}, 
                ${midX} ${midY} 
            S ${targetX + controlOffset} ${midY * 0.3 + targetY * 0.7}, 
                ${targetX} ${targetY}`;
        }
    }

    /**
     * 5. 层级折线 - 适合有明确层次关系的图（如组织结构图）
     * 特点：转折点位置固定，形成清晰的视觉层次
     */
    function generateHierarchicalPath(sourceX, sourceY, targetX, targetY, isHorizontalDominant) {
        // 固定转折距离，创建一致的视觉层次
        const fixedOffset = PATH_DETAIL.fixedOffset;

        if (isHorizontalDominant) {
            // 水平方向：先偏移固定距离再水平连接
            const offsetY = sourceY < targetY ? sourceY + fixedOffset : sourceY - fixedOffset;
            return `M ${sourceX} ${sourceY} V ${offsetY} H ${targetX} V ${targetY}`;
        } else {
            // 垂直方向：先偏移固定距离再垂直连接
            const offsetX = sourceX < targetX ? sourceX + fixedOffset : sourceX - fixedOffset;
            return `M ${sourceX} ${sourceY} H ${offsetX} V ${targetY} H ${targetX}`;
        }
    }
}

// 优化后的连线函数
function connectDevices(sourceId, targetId, connStyle = connFormat.style, connType = connFormat.type) {

    // 检查样式是否存在
    const styleConfig = CONNECTION_STYLES_DETAIL[connStyle] || CONNECTION_STYLES_DETAIL.default;
    originConnColor.color = styleConfig.lineColor;

    // 如果连线已经存在，则不再创建
    const existingConnection = connections.find(conn =>
        (conn.source === sourceId && conn.target === targetId) ||
        (conn.source === targetId && conn.target === sourceId)
    );
    if (existingConnection) {
        return;
    }

    const svg = d3.select('#topologySVG');

    // 初始化箭头标记 - 只创建一次可复用的标记
    function initArrowMarkers(svg, styleConfig) {
        let defs = svg.select('defs');
        if (defs.empty()) {
            defs = svg.append('defs');
        }

        // 清除已存在的标记
        defs.selectAll('.connection-arrow').remove();

        // 创建箭头标记
        defs.append('marker')
            .attr('id', 'connection-arrow')
            .attr('class', 'connection-arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 10)
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', styleConfig.arrowSize)
            .attr('markerHeight', styleConfig.arrowSize)
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', styleConfig.arrowFill);

        // 创建悬停状态的箭头标记
        defs.append('marker')
            .attr('id', 'connection-arrow-hover')
            .attr('class', 'connection-arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 10)
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', styleConfig.arrowSize + 1)
            .attr('markerHeight', styleConfig.arrowSize + 1)
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', styleConfig.arrowHoverFill);
    }

    // 初始化箭头标记（如果尚未初始化）
    if (svg.select('#connection-arrow').empty()) {
        initArrowMarkers(svg, styleConfig);
    }

    const sourceNode = svg.select(`[data-id="${sourceId}"]`);
    const targetNode = svg.select(`[data-id="${targetId}"]`);

    // 未选择设备则不连线
    if (sourceNode.empty() || targetNode.empty()) return;

    // 获取节点位置
    const sourcePos = parseTransform(sourceNode.attr('transform') || 'translate(0,0)');
    const targetPos = parseTransform(targetNode.attr('transform') || 'translate(0,0)');

    const sourceX = sourcePos.x;
    const sourceY = sourcePos.y;
    const targetX = targetPos.x;
    const targetY = targetPos.y;

    // 创建连线并设置ID
    const connectionId = `conn-${sourceId}-${targetId}`;

    // 计算路径数据
    const pathData = generatePathData(sourceX, sourceY, targetX, targetY, connType);

    // 创建连线
    const path = svg.append('path')
        .attr('d', pathData)
        .attr('stroke', styleConfig.lineColor)
        .attr('stroke-width', styleConfig.lineWidth)
        .attr('stroke-dasharray', styleConfig.lineDash.join(' '))
        .attr('fill', 'none')
        .attr('marker-end', 'url(#connection-arrow)')
        .attr('class', 'connection')
        .attr('data-id', connectionId)
        .attr('opacity', 0) // 初始透明度为0，用于动画
        .attr('stroke-linecap', 'round') // 线条端点圆润
        .attr('stroke-linejoin', 'round'); // 线条连接点圆润

    // 添加连线延迟
    path.transition()
        .duration(100)
        .attr('opacity', 1);

    // 添加交互效果
    path.on('mouseover', function () {
        d3.select(this)
            .attr('stroke', styleConfig.lineHoverColor)
            .attr('stroke-width', styleConfig.lineHoverWidth)
            .attr('marker-end', 'url(#connection-arrow-hover)');
    })
        .on('mouseout', function () {
            d3.select(this)
                .attr('stroke', styleConfig.lineColor)
                .attr('stroke-width', styleConfig.lineWidth)
                .attr('marker-end', 'url(#connection-arrow)');
        })
        .style('cursor', 'pointer');

    // 存储连线
    connections.push({
        id: connectionId,
        element: path,
        source: sourceId,
        target: targetId,
        style: connStyle
    });

    addFlowEffect(connectionId);
}

// 优化后的更新连线函数
function updateDeviceConnections(deviceId = '', connType = connFormat.type, connStyle = connFormat.style) {
    const svg = d3.select('#topologySVG');
    // 获取需要更新的连线（如果指定了设备ID则只更新相关连线，否则更新所有）
    const connectionsToUpdate = deviceId
        ? connections.filter(conn => conn.source === deviceId || conn.target === deviceId)
        : connections;

    // 遍历需要更新的连线
    connectionsToUpdate.forEach(conn => {
        // 获取源设备和目标设备
        const sourceNode = svg.select(`[data-id="${conn.source}"]`);
        const targetNode = svg.select(`[data-id="${conn.target}"]`);

        // 如果任一节点不存在则跳过
        if (sourceNode.empty() || targetNode.empty()) return;

        // 获取节点位置（使用统一的解析函数）
        const sourcePos = parseTransform(sourceNode.attr('transform') || 'translate(0,0)');
        const targetPos = parseTransform(targetNode.attr('transform') || 'translate(0,0)');

        const sourceX = sourcePos.x;
        const sourceY = sourcePos.y;
        const targetX = targetPos.x;
        const targetY = targetPos.y;

        // 生成新的路径数据（使用统一的生成函数，保持样式一致性）
        const pathData = generatePathData(sourceX, sourceY, targetX, targetY, connType);

        // 生成新的样式配置
        const styleConfig = CONNECTION_STYLES_DETAIL[connStyle] || CONNECTION_STYLES_DETAIL.default;
        originConnColor.color = styleConfig.lineColor;

        // 更新连线路径
        conn.element
            .attr('d', pathData)
            .attr('stroke', styleConfig.lineColor)
            .attr('stroke-width', styleConfig.lineWidth)
            .attr('stroke-dasharray', styleConfig.lineDash.join(' '))

        // 更新交互效果
        conn.element
            .on('mouseover', function () {
                d3.select(this)
                    .attr('stroke', styleConfig.lineHoverColor)
                    .attr('stroke-width', styleConfig.lineHoverWidth)
                    .attr('marker-end', 'url(#connection-arrow-hover)');
            }
            )
            .on('mouseout', function () {
                d3.select(this)
                    .attr('stroke', styleConfig.lineColor)
                    .attr('stroke-width', styleConfig.lineWidth)
                    .attr('marker-end', 'url(#connection-arrow)');
            })
            .style('cursor', 'pointer');

    });
}

// 添加流动效果
function addFlowEffect(connectionId) {
    const connection = connections.find(conn => conn.id === connectionId);
    if (!connection) return;

    // 创建流动效果容器
    if (!connection.flowGroup) {
        const svg = d3.select('#topologySVG');
        connection.flowGroup = svg.append('g')
            .attr('class', 'flow-effect')
            .attr('data-connection-id', connectionId);

        // 创建流动渐变
        createFlowGradient(connectionId);

        // 添加流动圆形元素
        const flowCount = 5;
        for (let i = 0; i < flowCount; i++) {
            connection.flowGroup.append('circle')
                .attr('r', 8)
                .attr('fill', `url(#flowGradient-${connectionId})`)
                .style('opacity', 1)
                .attr('data-flow-index', i);
        }
    }

    // 启动动画
    animateFlow(connectionId);
}

// 移除流动效果
function removeFlowEffect(connectionId) {
    const connection = connections.find(conn => conn.id === connectionId);
    if (!connection) return;

    // 停止动画
    if (connection.animationId) {
        cancelAnimationFrame(connection.animationId);
        connection.animationId = null;
    }

    // 移除流动效果
    if (connection.flowGroup) {
        connection.flowGroup.remove();
        connection.flowGroup = null;
    }
}

// 创建流动渐变
function createFlowGradient(connectionId) {
    const svg = d3.select('#topologySVG');
    const defs = svg.select('defs') || svg.append('defs');

    // 检查渐变是否已存在
    if (defs.select(`#flowGradient-${connectionId}`).empty()) {
        defs.append('linearGradient')
            .attr('id', `flowGradient-${connectionId}`)
            .attr('x1', '0%')
            .attr('y1', '0%')
            .attr('x2', '100%')
            .attr('y2', '0%')
            .selectAll('stop')
            .data([
                { offset: '0%', color: 'rgba(62, 241, 22, 0)' },
                { offset: '50%', color: 'rgb(0, 255, 30)' },
                { offset: '100%', color: 'rgba(22, 184, 4, 0)' }
            ])
            .enter().append('stop')
            .attr('offset', d => d.offset)
            .attr('stop-color', d => d.color);
    }
}

// 动画流动效果
function animateFlow(connectionId) {
    const connection = connections.find(conn => conn.id === connectionId);
    if (!connection || !connection.flowGroup) return;

    // 正确选择连线元素（确保ID选择器正确）
    const path = d3.select(`[data-id="${connectionId}"]`);
    if (path.empty()) {
        console.error(`找不到连线元素:[data-id="${connectionId}"]`);
        return;
    }

    // 获取路径长度
    const pathLength = path.node().getTotalLength();

    // 存储动画ID
    if (!connection.animationId) {
        // 动画更新
        function updateFlow() {
            const SPEED_FACTOR = 0.3  // 速度因子，越大越快
            const PHASE_DELAY = 0.5      // 元素间相位延迟，越小越密集
            const time = Date.now() * SPEED_FACTOR / 1000;

            // 检查流动组是否存在
            if (!connection.flowGroup) {
                return; // 如果不存在，停止动画
            }

            connection.flowGroup.selectAll('circle')
                .attr('transform', (_, i) => {
                    // 计算每个流动元素的位置
                    const phase = (time + i * PHASE_DELAY) % 2;
                    const position = phase * pathLength;
                    const point = path.node().getPointAtLength(position);
                    return `translate(${point.x}, ${point.y})`;
                });

            // 只有在流动组存在时才继续请求动画帧
            if (connection.flowGroup) {
                connection.animationId = requestAnimationFrame(updateFlow);
            }
        }

        // 启动动画
        connection.animationId = requestAnimationFrame(updateFlow);
        
    }
}

export { connectDevices, updateDeviceConnections, addFlowEffect, removeFlowEffect };

