from flask import Flask, request, jsonify, send_from_directory
import json
import csv
import os
import datetime
import random

app = Flask(__name__, static_folder='.')

# 确保保存拓扑的目录存在
save_dir = os.path.join(os.path.dirname(__file__), 'saved_topologies')
if not os.path.exists(save_dir):
    os.makedirs(save_dir)


@app.route('/api/devices', methods=['GET'])
def get_devices():
    # 读取CSV数据
    devices = []
    csv_file = os.path.join(os.path.dirname(__file__), './device_info2.csv')
    with open(csv_file, 'r', newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            devices.append(row)
    return jsonify(devices)

@app.route('/api/device-status', methods=['GET'])
def get_device_status():
    # 模拟设备状态更新
    csv_file = os.path.join(os.path.dirname(__file__), './device_info.csv')
    devices = []
    with open(csv_file, 'r', newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            devices.append(row['id'])

    # 随机选择一些设备设置为异常状态
    device_statuses = {}
    for device_id in devices:
        # 80%的概率保持正常状态
        if random.random() < 0.8:
            device_statuses[device_id] = 'normal'
        else:
            # 10%警告，10%错误
            if random.random() < 0.5:
                device_statuses[device_id] = 'warning'
            else:
                device_statuses[device_id] = 'error'
    return jsonify(device_statuses)

@app.route('/api/topology-files', methods=['GET'])
def get_topology_files():
    # 获取目录中的所有JSON文件
    files = []
    for filename in os.listdir(save_dir):
        if filename.endswith('.json'):
            file_path = os.path.join(save_dir, filename)
            # 获取文件的创建时间
            created_time = os.path.getctime(file_path)
            # 转换为可读格式
            created_time_str = datetime.datetime.fromtimestamp(created_time).strftime('%Y-%m-%d %H:%M:%S')
            files.append({
                'name': filename,
                'createdTime': created_time_str
            })

    # 按创建时间降序排序
    files.sort(key=lambda x: x['createdTime'], reverse=True)
    return jsonify(files)

@app.route('/api/save-topology', methods=['POST'])
def save_topology():
    try:
        # 读取请求体
        topology_data = request.json

        # 使用前端提供的文件名或生成带时间戳的文件名
        fileName = topology_data.get('fileName')
        if fileName:
            # 确保文件名以.json结尾
            if not fileName.endswith('.json'):
                fileName += '.json'
            save_file = os.path.join(save_dir, fileName)
        else:
            # 生成默认带时间戳的文件名
            timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            save_file = os.path.join(save_dir, f'topology_{timestamp}.json')

        # 保存数据
        with open(save_file, 'w', encoding='utf-8') as f:
            json.dump(topology_data, f, ensure_ascii=False, indent=2)

        return jsonify({'success': True, 'message': '拓扑图保存成功', 'file': save_file})
    except Exception as e:
        return jsonify({'success': False, 'message': f'保存失败: {str(e)}'})

@app.route('/api/delete-topology', methods=['POST'])
def delete_topology():
    try:
        # 读取请求体
        delete_data = request.json
        filename = delete_data.get('filename')
        
        if not filename:
            return jsonify({'success': False, 'message': '文件名不能为空'}), 400

        file_path = os.path.join(save_dir, filename)
        if not os.path.exists(file_path):
            return jsonify({'success': False, 'message': '文件不存在'}), 404

        os.remove(file_path)
        return jsonify({'success': True, 'message': f'文件 {filename} 已成功删除'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'删除文件失败: {str(e)}'}), 500

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_static(path):
    if path == '':
        path = 'index.html'
    
    file_path = os.path.join(os.path.dirname(__file__), path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return send_from_directory(os.path.dirname(__file__), path)
    else:
        return 'File not found', 404

if __name__ == '__main__':
    print('Server running on http://localhost:3000')
    app.run(host='0.0.0.0', port=3000, debug=True)