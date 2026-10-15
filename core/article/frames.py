"""按时间点截配图：python3 core/article/frames.py <run_dir> <name>@<秒> ...
在 ±0.25s（动画视频画面变化快，窗口别放大） 内取最清晰（拉普拉斯方差）的一帧，经 oil-video-article 的 extract_frame.py 截取，输出 <run>/article/img/NN_name.jpg"""
import sys, os, subprocess, cv2
run = sys.argv[1]; V = f'{run}/video.mp4'; o = f'{run}/article/img'; os.makedirs(o, exist_ok=True)
EX = os.path.join(os.path.dirname(__file__), 'vendor/oil-video-article/scripts/extract_frame.py')
cap = cv2.VideoCapture(V)
def sharp(t):
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000); ok, f = cap.read()
    return cv2.Laplacian(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var() if ok else -1
for i, spec in enumerate(sys.argv[2:], 1):
    name, t = spec.rsplit('@', 1); t = float(t)
    best = max([t + d / 4 for d in range(-1, 2)], key=sharp)
    png = f'/tmp/frame_{i}.png'; subprocess.run(['python3', EX, '--video', V, '--time', f'{best:.2f}', '--output', png], check=True, capture_output=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', png, '-q:v', '3', f'{o}/{i:02d}_{name}.jpg'], check=True)
    print(f'{i:02d}_{name}.jpg @ {best:.2f}s')
