#!/usr/bin/env python3
"""主体检测（MediaPipe 人脸）：python3 core/edit/detect_subject.py <视频|图片> [in秒] [out秒] [采样数]
输出一行 JSON：{"w":源宽,"h":源高,"box":[x,y,w,h] 归一化 或 null,"hits":n,"samples":n}
模型 blaze_face_short_range.tflite 缓存在 ~/.cache/video-maker/（首次自动下载，约 230KB）。"""
import json, os, sys, urllib.request
MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
CACHE = os.path.expanduser('~/.cache/video-maker/blaze_face_short_range.tflite')

def model():
    if not os.path.exists(CACHE):
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        urllib.request.urlretrieve(MODEL_URL, CACHE + '.part'); os.replace(CACHE + '.part', CACHE)
    return CACHE

def frames(src, t0, t1, n):
    import cv2
    img = cv2.imread(src) if os.path.splitext(src)[1].lower() in ('.jpg', '.jpeg', '.png', '.webp') else None
    if img is not None:
        yield img; return
    cap = cv2.VideoCapture(src)
    if t1 <= t0:
        fps = cap.get(cv2.CAP_PROP_FPS) or 25; t1 = (cap.get(cv2.CAP_PROP_FRAME_COUNT) or 1) / fps
    for i in range(n):
        cap.set(cv2.CAP_PROP_POS_MSEC, 1000 * (t0 + (t1 - t0) * (i + 0.5) / n))
        ok, f = cap.read()
        if ok: yield f
    cap.release()

def main():
    a = sys.argv[1:]
    src, t0, t1, n = a[0], float(a[1]) if len(a) > 1 else 0, float(a[2]) if len(a) > 2 else 0, int(a[3]) if len(a) > 3 else 5
    import cv2, mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision
    det = vision.FaceDetector.create_from_options(vision.FaceDetectorOptions(base_options=BaseOptions(model_asset_path=model()), min_detection_confidence=0.5))
    W = H = 0; boxes = []; samples = 0
    for f in frames(src, t0, t1, n):
        samples += 1; H, W = f.shape[:2]
        rgb = cv2.cvtColor(f, cv2.COLOR_BGR2RGB)
        found = []
        # short-range 模型输入 128²，横画面整帧缩小后脸太小：整帧 + 方形分块（步长半块）都扫，坐标映回原帧
        side = min(W, H); xs = sorted({0, W - side, *range(0, W - side, side // 2)})
        for ox in [None] + xs:
            tile = rgb if ox is None else rgb[:, ox:ox + side].copy()
            r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=tile))
            for d in r.detections:
                b = d.bounding_box; o = 0 if ox is None else ox
                found.append([(b.origin_x + o) / W, b.origin_y / H, b.width / W, b.height / H])
            if found and ox is None: break
        if not found: continue
        boxes.append(max(found, key=lambda b: b[2] * b[3]))  # 最大脸当主体
    box = None
    if boxes:  # 取中位数，抗单帧误检
        med = lambda k: sorted(x[k] for x in boxes)[len(boxes) // 2]
        box = [round(med(k), 4) for k in range(4)]
    det.close()
    print(json.dumps({'w': W, 'h': H, 'box': box, 'hits': len(boxes), 'samples': samples}))

if __name__ == '__main__':
    main()
