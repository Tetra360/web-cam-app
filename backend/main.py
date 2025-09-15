import cv2
import threading
import time
from flask import Flask, Response, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # CORSを有効にしてフロントエンドからのアクセスを許可

# グローバル変数
camera = None
camera_lock = threading.Lock()
is_streaming = False

def get_camera():
    """カメラオブジェクトを取得する。見つからなければNoneを返す。"""
    global camera
    with camera_lock:
        if camera is None:
            camera = cv2.VideoCapture(0)
            if not camera.isOpened():
                print("カメラを開けませんでした")
                camera = None
        return camera

def release_camera():
    """カメラリソースを解放する。"""
    global camera
    with camera_lock:
        if camera is not None:
            camera.release()
            camera = None

def generate_frames():
    """カメラフレームを生成するジェネレータ。"""
    global is_streaming

    while is_streaming:
        cap = get_camera()
        if cap is None:
            break

        ret, frame = cap.read()
        if not ret:
            break

        # フレームをJPEGにエンコード
        ret, buffer = cv2.imencode('.jpg', frame)
        if ret:
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

        time.sleep(0.033)  # 約30FPS

@app.route('/video_feed')
def video_feed():
    """カメラ映像のストリーミングエンドポイント。"""
    global is_streaming

    if not is_streaming:
        # 停止中は黒い画像を返す
        black_frame = cv2.imencode('.jpg', cv2.zeros((480, 640, 3), dtype='uint8'))[1].tobytes()
        return Response(
            (b'--frame\r\n'
             b'Content-Type: image/jpeg\r\n\r\n' + black_frame + b'\r\n'),
            mimetype='multipart/x-mixed-replace; boundary=frame'
        )

    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/start_stream', methods=['POST'])
def start_stream():
    """ストリーミングを開始する。"""
    global is_streaming

    if not is_streaming:
        is_streaming = True
        return jsonify({'status': 'started'})
    else:
        return jsonify({'status': 'already_streaming'})

@app.route('/stop_stream', methods=['POST'])
def stop_stream():
    """ストリーミングを停止する。"""
    global is_streaming

    if is_streaming:
        is_streaming = False
        return jsonify({'status': 'stopped'})
    else:
        return jsonify({'status': 'already_stopped'})

if __name__ == '__main__':
    try:
        print("Flaskサーバーを起動しています...")
        print("フロントエンドから http://localhost:5000 にアクセスしてください")
        app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
    except KeyboardInterrupt:
        print("サーバーを停止しています...")
    finally:
        release_camera()
        print("リソースを解放しました")