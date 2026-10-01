"""配乐、拟音与混音：python audio.py（在影片目录里运行，先跑 events 和 voice 两步）
按镜头类型自动编配，见 core/audio/deck.py。"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('WORKBENCH_ROOT') or os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, ROOT)
from core.audio.deck import mix

mix(HERE)
