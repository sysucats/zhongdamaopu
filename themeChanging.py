import os
import glob
import math
import sys

from tqdm import tqdm
from PIL import Image
import shutil

# 此处填写目标颜色以及原主题颜色
# 默认黄色是 '#ffd101' '#73A7DD'


# 读取文件夹及其子文件中的图片并提取颜色值
def extract_colors_from_folder(png_files):
    color_counts = {}  # 用字典来存储颜色及其出现次数
    print("组件图片总数:", len(png_files))
    for png_file in tqdm(png_files, desc='提取颜色并验证', ncols=100):
        img = Image.open(png_file)
        pixels = img.getdata()

        for pixel in pixels:
            hex_value = rgb_to_hex(pixel[:3])
            color_counts[hex_value] = color_counts.get(hex_value, 0) + 1
    sorted_colors = sorted(color_counts.items(), key=lambda x: x[1], reverse=True)
    return sorted_colors[1:11]


# 将RGB值转换为十六进制格式
def rgb_to_hex(colour):
    r, g, b = colour
    hex_color = f"#{r:02x}{g:02x}{b:02x}"
    return hex_color


# 十六进制格式转换为RGB值
def hex_to_rgb(hex_color):
    # 去掉可能包含的 '#' 字符
    hex_color = hex_color.lstrip('#')

    # 获取红、绿和蓝分量的十六进制值
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)

    return r, g, b


# 根据基准色计算梯度颜色
def gradient_color(hex_color, gradient_value = 35):
    origin_color = hex_color
    hex_color = hex_color.lstrip('#')
    r, g, b = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

    # 计算渐变色brighter1
    gradient_r1 = min(255, r + gradient_value)
    gradient_g1 = min(255, g + gradient_value)
    gradient_b1 = min(255, b + gradient_value)
    gradient_brighter1 = rgb_to_hex((gradient_r1, gradient_g1, gradient_b1))

    # 计算渐变色brighter2
    gradient_r2 = min(255, r + gradient_value*2)
    gradient_g2 = min(255, g + gradient_value*2)
    gradient_b2 = min(255, b + gradient_value*2)
    gradient_brighter2 = rgb_to_hex((gradient_r2, gradient_g2, gradient_b2))

    # 计算渐变色darker1
    gradient_r3 = max(0, r - gradient_value * 2)
    gradient_g3 = max(0, g - gradient_value * 2)
    gradient_b3 = max(0, b - gradient_value * 2)
    gradient_dark1 = rgb_to_hex((gradient_r3, gradient_g3, gradient_b3))

    # 计算渐变色darker2
    gradient_r4 = max(0, r - gradient_value * 2)
    gradient_g4 = max(0, g - gradient_value * 2)
    gradient_b4 = max(0, b - gradient_value * 2)
    gradient_dark2 = rgb_to_hex((gradient_r4, gradient_g4, gradient_b4))

    return origin_color, gradient_brighter1, gradient_brighter2, gradient_dark2, gradient_dark1


# 计算颜色间欧式距离,用于减小误差
def color_distance(color1, color2):
    r1, g1, b1 = color1[0:3]
    r2, g2, b2 = color2[0:3]
    return math.sqrt((r2 - r1) ** 2 + (g2 - g1) ** 2 + (b2 - b1) ** 2)


def replace_color_in_images(png_files, replace_dic , tolerance = 50):
    for png_file in tqdm(png_files, desc='置换中', ncols=100):
        img = Image.open(png_file)
        pixels = img.load()
        width, height = img.size
        for color_origin in replace_dic:
            colour_origin_rgb = hex_to_rgb(color_origin)
            colour_aim_rgb = hex_to_rgb(replace_dic[color_origin])
            for x in range(width):
                for y in range(height):
                    if color_distance(pixels[x, y], colour_origin_rgb) < tolerance:
                        pixels[x, y] = colour_aim_rgb
            img.save(png_file)


def remove_file(file_names, paths):
    # 使用列表推导式筛选掉匹配的元素并构建新的列表
    updated_addresses = [path for path in paths if
                         not any(path.endswith("\\" + name) for name in file_names)]
    return updated_addresses


if __name__ == "__main__":

    if len(sys.argv) < 3:
        print("参数不全,请输入待更换主题色号以及目标更换主题色号!")
    else:
        print(sys.argv[1])
        print(sys.argv[2])

    colour_aim = sys.argv[2]
    colour_origin = sys.argv[1]
    folder_path = 'miniprogram/pages/public/images'
    exception = ['zdmp.png', 'male.png', 'female.png']

    # 文件读取
    png_files = glob.glob(os.path.join(folder_path, '**/*.png'), recursive=True)
    png_files = remove_file(['app_logo.png'], png_files)
    print("共读取png图片", len(png_files), '张', '\n', png_files)

    colors = {color: count for color, count in extract_colors_from_folder(png_files)}
    print('colors', len(colors), ':', colors)

    # 根据此序列识别是否规定化过
    origin_colours = {'#ffd101': 627596, '#ffffff': 543237, '#ffde54': 485065, '#fff7d4': 149900, '#a78f2a': 88556, '#e2b71c': 77449, '#f9f28b': 75981, '#726735': 53384, '#fed940': 48114, '#c8e9e3': 33721}
    print('origin_colours', len(origin_colours), ':', origin_colours)

    # 根据新颜色基准colour_aim计算颜色梯度
    color_new = gradient_color(colour_aim)

    # 原色替换标准,将未均衡化的原主题黄色系,替换为以新主题色为基准的相应亮度
    replace_standard = {'#726735': -2, '#a78f2a': -2, '#e2b71c': 0, '#fed940': 0, '#ffd101':0, '#ffde54': 1, 'f9f28b': 2, 'dfb600': -1, '#ffcc33': -2, '#F6EF37':1}

    replace_dic = dict()
    # 与原始未标准化的颜色空间比对,获得替换字典
    if set(origin_colours.keys()) == set(colors.keys()):
        print("进行色值规定化以便整体修改...")
        for hex_key in replace_standard:
            replace_dic[hex_key] = color_new[replace_standard[hex_key]]
    else:
        print('已规定化,直接匹配进行修改')
        color_old = gradient_color(colour_origin)
        for index, hex_key in enumerate(color_old):
            replace_dic[hex_key] = color_new[index]

    png_replace = remove_file(exception, png_files)

    replace_color_in_images(png_replace, replace_dic, 20)

    # right.png 图片bug手动修复
    index_to_correct = None
    index_material = None
    for index, element in enumerate(png_files):
        if element.endswith('right_y.png'):
            index_to_correct = index
    for index, element in enumerate(png_files):
        if element.endswith('right.png'):
            index_material = index
    if index_to_correct is not None and index_material is not None:
        print('bug修正..')
        shutil.copyfile(png_files[index_material], png_files[index_to_correct])
