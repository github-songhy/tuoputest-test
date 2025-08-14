from flask import Flask, request, jsonify, send_from_directory, send_file,render_template
import json
import csv
import os
import datetime
import random

# static_folder设置的路径的作用是在浏览器地址栏输入类似http://localhost:3000/static_folder/b.html
# 会自动取static_folder指定的文件夹下寻找相应的文件
# 如设置static_folder='../static'后，输入http://localhost:3000/static/b.html 会自动取相对于当前文件的“../static/b.html”
# 后续无论使用return send_file,还是 send_from_directory都是计算相对于当前文件的相对路径

# template_folder设置的路径的作用是当使用render_template()直接写template_folder设置的文件夹中的文件名
# 如果不设置默认是当前文件所在目录的templates文件夹

# 获取项目根目录
current_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.dirname(current_dir)  # F:\tuoputest-test
static_dir = os.path.join(root_dir, 'static')  # F:\tuoputest-test\static

app = Flask(__name__, static_folder=root_dir)

# 从配置文件中读取文件路径
with open(f'{root_dir}/config/file_path.json', 'r') as f:
    file_paths = json.load(f)
    data_path = file_paths['data_path']
    saved_topology_dir = file_paths['saved_topology_dir']
    indexHtml_path = file_paths['indexHtml_path']

# 确保保存拓扑的目录存在
save_dir = os.path.join(root_dir, saved_topology_dir)
if not os.path.exists(save_dir):
    os.makedirs(save_dir)

# 获取设备列表
@app.route('/api/devices', methods=['GET'])
def get_devices():
    # 读取CSV数据
    devices = []
    csv_file = os.path.join(root_dir, data_path)
    with open(csv_file, 'r', newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            devices.append(row)
    return jsonify(devices)

# 获取设备状态
@app.route('/api/device-status', methods=['GET'])
def get_device_status():
    # 从CSV文件中读取设备状态
    csv_file = os.path.join(root_dir, data_path)
    device_statuses = {}
    with open(csv_file, 'r', newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            device_statuses[row['id']] = row['status']
    return jsonify(device_statuses)

# 获取保存的拓扑文件列表
@app.route('/api/topology-files', methods=['GET'])
def get_topology_files():
    # 获取目录中的所有JSON文件
    files = []
    for filename in os.listdir(save_dir):
        if filename.endswith('.json'):
            file_path = os.path.normpath(os.path.join(save_dir, filename))
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

# 保存拓扑图
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
            save_file = os.path.normpath(os.path.join(save_dir, fileName))
        else:
            # 生成默认带时间戳的文件名
            timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            save_file = os.path.normpath(os.path.join(save_dir, f'topology_{timestamp}.json'))

        # 保存数据
        with open(save_file, 'w', encoding='utf-8') as f:
            json.dump(topology_data, f, ensure_ascii=False, indent=2)

        return jsonify({'success': True, 'message': '拓扑图保存成功', 'file': save_file})
    except Exception as e:
        return jsonify({'success': False, 'message': f'保存失败: {str(e)}'})

# 删除拓扑图
@app.route('/api/delete-topology', methods=['POST'])
def delete_topology():
    try:
        # 读取请求体
        delete_data = request.json
        filename = delete_data.get('filename')
        
        if not filename:
            return jsonify({'success': False, 'message': '文件名不能为空'}), 400

        file_path = os.path.normpath(os.path.join(save_dir, filename))
        if not os.path.exists(file_path):
            return jsonify({'success': False, 'message': '文件不存在'}), 404

        os.remove(file_path)
        return jsonify({'success': True, 'message': f'文件 {filename} 已成功删除'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'删除文件失败: {str(e)}'}), 500

# 提供静态文件服务
# 如http://localhost:3000/static/index.html
# 如http://localhost:3000/config/device_mapping.json
# 如http://localhost:3000/saved_topologies/1.json
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_static(path):

    if path == '':
        path = indexHtml_path

    file_path = os.path.join(root_dir, path)

    print("------------------file_path------------------", file_path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return send_file(file_path)
    else:
        return 'File not found', 404


if __name__ == '__main__':
    print('Server running on http://localhost:3000')
    app.run(host='0.0.0.0', port=3000, debug=True)