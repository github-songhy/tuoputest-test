import pandas as pd
import os
import time

def handle_alarm_data():

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
    last_match_index = None
    for _, row in alarm_df.iterrows():
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
        new_csv_file_path = csv_file_path.replace('.csv', '_new.csv')
        with open(new_csv_file_path , 'w', newline='', encoding='utf-8') as f:
            device_df.to_csv(f, index=False)
        # 等待10秒
        print(f"{_ + 1}已将修改后的设备信息写入新文件: {new_csv_file_path}")
        time.sleep(10)
    return device_df


if __name__ == '__main__':
    try:
        result = connect_device_and_alarm_data()
        # 打印result的name、status、error_info列
        # print(result[['name', 'status', 'error_info']])
        
    except Exception as e:
        print(f"执行过程中出错: {str(e)}")