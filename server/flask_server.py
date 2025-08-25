from flask import Flask, request, jsonify, send_file
import json
import csv
import os
import datetime
import pandas as pd
import os
import time

# 1.static_folder设置的路径的作用是在浏览器地址栏输入类似http://localhost:3000/static_folder/b.html
# 会自动取static_folder指定的文件夹下寻找相应的文件
# 如设置static_folder='../static'后，输入http://localhost:3000/static/b.html 会自动取相对于当前文件的“../static/b.html”

# 2.无论使用return send_file,还是 send_from_directory都是计算相对于当前文件的相对路径

# 3.template_folder设置的路径的作用是当使用return render_template()直接用参数template_folder指定的文件夹中的文件名
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


# 获取设备信息列表
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

# 模拟断电
@app.route('/api/power-off', methods=['GET'])
def power_off():

    csv_file_path = 'f:/tuoputest-test/static/data/device_info3.csv'
    excel_file_path = 'f:/tuoputest-test/static/data/天河历史告警导出.xls'

    # 检查文件是否存在
    if not os.path.exists(csv_file_path):
        raise FileNotFoundError(f"CSV文件不存在: {csv_file_path}")
    if not os.path.exists(excel_file_path):
        raise FileNotFoundError(f"Excel文件不存在: {excel_file_path}")

    # 读取CSV文件
    try:
        device_df = pd.read_csv(csv_file_path)
        print(f"成功读取CSV文件，共{len(device_df)}行数据")
    except Exception as e:
        raise Exception(f"读取CSV文件时出错: {str(e)}")

    # 读取Excel文件
    try:
        # 假设Excel文件中的第一个工作表包含告警数据
        # alarm_df = pd.read_excel(excel_file_path, engine='xlrd')
        alarm_df = pd.read_excel(excel_file_path, sheet_name='天河机楼告警案例')
        print(f"成功读取Excel文件，共{len(alarm_df)}行数据")
    except Exception as e:
        raise Exception(f"读取Excel文件时出错: {str(e)}")

    # 检查两个DataFrame中是否都有'name'列
    if 'name' not in device_df.columns:
        raise ValueError("CSV文件中没有'name'列")
    if 'name' not in alarm_df.columns:
        # 检查是否有'友好名称'列
        if '友好名称' in alarm_df.columns:
            alarm_df.rename(columns={'友好名称': 'name'}, inplace=True)
        else:
            raise ValueError("Excel文件中没有'name'列")
        # 检查是否有'告警等级'列
        if '告警等级' in alarm_df.columns:
            alarm_df.rename(columns={'告警等级': 'type'}, inplace=True)
        else:
            raise ValueError("Excel文件中没有'type'列")

    # 每5s读取alarm_df一行，并根据name列在device_df中找到对应的行，做如下修改
    #   1.修改对应的status列, 如果是"严重告警",status修改为error,如果是"主要告警",status修改为warning
    #   2.修改对应的error_info列, 把"告警等级"和"信号名称"合并到error_info列中
    #   3.每次修改前，将上一次在devices_df中匹配到的行的status列修改为normal，error_info列置为空
    #   4.最后覆盖写入新文件
    # 初始化上一次匹配到的行索引为None

    # 先将type为'高压输入'的status列置为error
    device_df.loc[device_df['type'] == '高压输入', 'status'] = 'error'
    device_df.loc[device_df['type'] == '高压输入', 'error_info'] = '市电停电'
    device_df.loc[device_df['notes'] == '市电备路', 'error_info'] = '等待切换'

    last_match_index = None
    for index, row in alarm_df.iterrows():
        # 先将上一次匹配到的行的status列修改为normal，error_info列置为空
        if last_match_index is not None:
            device_df.loc[last_match_index, 'status'] = 'normal'
            device_df.loc[last_match_index, 'error_info'] = ''
        name = row['name']
        type = row['type']
        # 在device_df中查找对应的行
        device_row = device_df[device_df['name'] == name]
        if not device_row.empty:
            # 记录当前匹配到的行索引
            last_match_index = device_row.index[0]
            # 找到对应的行，修改status列
            if type == "严重告警":
                # loc方法的用法：df.loc[行索引, 列索引]
                device_df.loc[device_row.index, 'status'] = 'error'
            elif type == "主要告警":
                device_df.loc[device_row.index, 'status'] = 'warning'
            # 合并"告警等级"和"信号名称"到error_info列
            error_info = f"{type}，信号名称：{row['信号名称']}"
            device_df.loc[device_row.index, 'error_info'] = error_info
        else:
            print(f"未找到名称为'{name}'的设备行")
        # 最后将修改后的device_df写入CSV文件
        # new_csv_file_path = csv_file_path.replace('.csv', '_new.csv')
        new_csv_file_path = csv_file_path
        with open(new_csv_file_path , 'w', newline='', encoding='utf-8') as f:
            device_df.to_csv(f, index=False)
        # 等待n秒
        n = 3
        print(f"{index + 1}已将修改后的设备信息写入新文件: {new_csv_file_path}")
        time.sleep(n)
    #最后将所有status置为normal，error_info置为空
    device_df['status'] = 'normal'
    device_df['error_info'] = ''
    with open(new_csv_file_path , 'w', newline='', encoding='utf-8') as f:
            device_df.to_csv(f, index=False)
    return jsonify({'success': True, 'message': '模拟断电成功'})


if __name__ == '__main__':
    print('Server running on http://localhost:3000')
    app.run(host='0.0.0.0', port=3000, debug=True)

