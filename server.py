import http.server
import socketserver
import json
import csv
import os
import datetime
import random
from urllib.parse import urlparse
import http.server

PORT = 3000

class MyHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        # 解析URL路径
        parsed_path = urlparse(self.path)

        # 处理API请求
        if parsed_path.path == '/api/topology-files':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')  # 允许跨域
            self.end_headers()

            save_dir = os.path.join(os.path.dirname(__file__), 'saved_topologies')
            if not os.path.exists(save_dir):
                os.makedirs(save_dir)

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

            self.wfile.write(json.dumps(files).encode())
            return
        elif parsed_path.path == '/api/devices':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')  # 允许跨域
            self.end_headers()

            # 读取CSV数据
            devices = []
            csv_file = os.path.join(os.path.dirname(__file__), './device_info.csv')
            with open(csv_file, 'r', newline='', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    devices.append(row)

            # 发送JSON数据
            self.wfile.write(json.dumps(devices).encode())
            return
        elif parsed_path.path == '/api/device-status':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')  # 允许跨域
            self.end_headers()

            # 模拟设备状态更新
            # 实际应用中应从数据库或其他数据源获取
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

            # 发送JSON数据
            self.wfile.write(json.dumps(device_statuses).encode())
            return

        # 处理静态文件请求
        else:
            # 移除查询参数，只保留路径部分
            path_without_query = self.path.split('?')[0]

            # 默认提供index.html
            if path_without_query == '/':
                file_path = os.path.join(os.path.dirname(__file__), 'index.html')
            else:
                # 确保路径拼接在Windows上正确工作
                file_path = os.path.join(os.path.dirname(__file__), *path_without_query[1:].split('/'))

            # 检查文件是否存在
            if os.path.exists(file_path) and os.path.isfile(file_path):
                # 确定文件类型
                if file_path.endswith('.html'):
                    content_type = 'text/html'
                elif file_path.endswith('.js'):
                    content_type = 'application/javascript'
                elif file_path.endswith('.css'):
                    content_type = 'text/css'
                elif file_path.endswith('.svg'):
                    content_type = 'image/svg+xml'
                elif file_path.endswith('.json'):
                    content_type = 'application/json'
                else:
                    content_type = 'application/octet-stream'

                # 发送文件
                self.send_response(200)
                self.send_header('Content-type', content_type)
                self.end_headers()
                with open(file_path, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b'File not found')


    def do_POST(self):
        # 解析URL路径
        parsed_path = urlparse(self.path)

        # 处理保存拓扑的API请求
        if parsed_path.path == '/api/save-topology':
            # 读取请求体
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            topology_data = json.loads(post_data)

            # 保存数据到文件
            try:
                # 创建保存目录（如果不存在）
                save_dir = os.path.join(os.path.dirname(__file__), 'saved_topologies')
                if not os.path.exists(save_dir):
                    os.makedirs(save_dir)

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

                # 返回成功响应
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')  # 允许跨域
                self.end_headers()
                response = {'success': True, 'message': '拓扑图保存成功', 'file': save_file}
                self.wfile.write(json.dumps(response).encode())
            except Exception as e:
                # 返回错误响应
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')  # 允许跨域
                self.end_headers()
                response = {'success': False, 'message': f'保存失败: {str(e)}'}
                self.wfile.write(json.dumps(response).encode())
            return
        elif parsed_path.path == '/api/delete-topology':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            delete_data = json.loads(post_data)

            filename = delete_data.get('filename')
            if not filename:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')  # 允许跨域
                self.end_headers()
                response = {'success': False, 'message': '文件名不能为空'}
                self.wfile.write(json.dumps(response).encode())
                return

            save_dir = os.path.join(os.path.dirname(__file__), 'saved_topologies')
            file_path = os.path.join(save_dir, filename)
            print(file_path)
            if not os.path.exists(file_path):
                self.send_response(404)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')  # 允许跨域
                self.end_headers()
                response = {'success': False, 'message': '文件不存在'}
                self.wfile.write(json.dumps(response).encode())
                return

            try:
                os.remove(file_path)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')  # 允许跨域
                self.end_headers()
                response = {'success': True, 'message': f'文件 {filename} 已成功删除'}
                self.wfile.write(json.dumps(response).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')  # 允许跨域
                self.end_headers()
                response = {'success': False, 'message': f'删除文件失败: {str(e)}'}
                self.wfile.write(json.dumps(response).encode())
            return

        # 其他POST请求返回404
        self.send_response(404)
        self.end_headers()
        self.wfile.write(b'Not found')

    # 处理OPTIONS请求，用于CORS预检
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        return

# 启动服务器
with socketserver.TCPServer(('', PORT), MyHandler) as httpd:
    print(f'Server running on http://localhost:{PORT}')
    httpd.serve_forever()