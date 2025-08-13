import { connections } from './script.js';

// 样式配置 - 可以通过修改这里切换不同样式方案
const connectionStyles = {
    // 方案1: 默认现代风格
    default: {
        lineColor: '#4a90e2',
        lineHoverColor: '#2c6ecb',
        lineWidth: 2,
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
        lineWidth: 1.5,
        lineHoverWidth: 2.5,
        lineDash: [],
        arrowFill: '#555',
        arrowHoverFill: '#222',
        arrowSize: 4
    },
    // 方案3: 虚线风格
    dashed: {
        lineColor: '#7b61ff',
        lineHoverColor: '#5a40e0',
        lineWidth: 2,
        lineHoverWidth: 3,
        lineDash: [5, 3],
        arrowFill: '#7b61ff',
        arrowHoverFill: '#5a40e0',
        arrowSize: 5
    }
};

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

// 解析transform属性获取位置的工具函数
function parseTransform(transform) {
    const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
    return match ? {
        x: parseFloat(match[1]),
        y: parseFloat(match[2])
    } : { x: 0, y: 0 };
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
    const offsetRatio = 0.45; // 偏离中心的比例，使线条更自然
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
    const offset = 5; // 偏移像素

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
    const fixedOffset = 40;

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


/**
 * 生成连线路径数据的工具函数 - 支持五种不同风格
 * @param {number} sourceX - 源点X坐标
 * @param {number} sourceY - 源点Y坐标
 * @param {number} targetX - 目标点X坐标
 * @param {number} targetY - 目标点Y坐标
 * @param {string} style - 连线风格: 'smooth-curve' | 'right-angle' | 'direct-line' | 'segmented' | 'hierarchical'
 * @returns {string} SVG路径数据
 */
function generatePathData(sourceX, sourceY, targetX, targetY, style = 'right-angle') {
    // 计算基础向量和距离
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const isHorizontalDominant = Math.abs(dx) > Math.abs(dy);

    // 根据风格选择不同的路径生成策略
    switch (style) {
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
}

// 优化后的连线函数
function connectDevices(sourceId, targetId, style = 'dashed') {
    // 检查样式是否存在
    const styleConfig = connectionStyles[style] || connectionStyles.default;

    // 如果连线已经存在，则不再创建
    const existingConnection = connections.find(conn =>
        (conn.source === sourceId && conn.target === targetId) ||
        (conn.source === targetId && conn.target === sourceId)
    );
    if (existingConnection) {
        return;
    }

    const svg = d3.select('#topologySVG');

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
    const pathData = generatePathData(sourceX, sourceY, targetX, targetY);

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

    // 添加连线动画
    path.transition()
        .duration(500)
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
        style: style
    });
}

// 优化后的更新连线函数
function updateDeviceConnections(deviceId = '') {
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
        const pathData = generatePathData(sourceX, sourceY, targetX, targetY);

        // 平滑更新连线路径（添加过渡动画）
        conn.element
            .attr('d', pathData);
    });
}


export { connectDevices, updateDeviceConnections };
