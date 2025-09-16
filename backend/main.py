import cv2
import threading
import time
from flask import Flask, Response, jsonify
from flask_cors import CORS

# 物体検出ライブラリのインポートは初回有効化時まで遅延
OBJECT_DETECTION_AVAILABLE = None  # None: 未確認, True: 利用可能, False: 利用不可
YOLO = None

app = Flask(__name__)
CORS(app)  # CORSを有効にしてフロントエンドからのアクセスを許可

# グローバル変数
camera = None
camera_lock = threading.Lock()
is_streaming = False
object_detection_model = None
object_detection_enabled = False

def check_ultralytics_availability():
    """ultralyticsの利用可能性を確認し、必要に応じてインポートする。"""
    global OBJECT_DETECTION_AVAILABLE, YOLO
    
    if OBJECT_DETECTION_AVAILABLE is not None:
        return OBJECT_DETECTION_AVAILABLE
    
    print("ultralyticsの利用可能性を確認中...")
    try:
        from ultralytics import YOLO
        OBJECT_DETECTION_AVAILABLE = True
        print("ultralyticsが利用可能です。")
        return True
    except ImportError:
        print("ultralyticsがインストールされていません。物体検出機能は無効になります。")
        OBJECT_DETECTION_AVAILABLE = False
        YOLO = None
        return False

def initialize_object_detection_model():
    """物体検出モデルを初期化する。"""
    global object_detection_model
    
    # まずultralyticsの利用可能性を確認
    if not check_ultralytics_availability():
        print("ultralyticsが利用できません。物体検出機能は無効です。")
        return False
    
    try:
        print("物体検出モデルの読み込みを開始しています...")
        model_path = 'models/yolo11n.pt'
        print(f"モデルファイル: {model_path}")
        
        # モデル読み込み（時間がかかる処理）
        object_detection_model = YOLO(model_path)
        print(f"物体検出モデルを正常に読み込みました: {model_path}")
        return True
    except Exception as e:
        print(f"物体検出モデルの読み込みに失敗しました: {e}")
        object_detection_model = None
        return False

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
    global is_streaming, object_detection_model, object_detection_enabled

    while is_streaming:
        cap = get_camera()
        if cap is None:
            break

        ret, frame = cap.read()
        if not ret:
            break

        # 物体検出が有効な場合、推論を実行
        if object_detection_enabled and object_detection_model is not None:
            try:
                # 物体検出推論を実行
                results = object_detection_model(frame)
                # 推論結果を画像に描画
                frame = results[0].plot()
            except Exception as e:
                print(f"物体検出推論エラー: {e}")

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

@app.route('/enable_object_detection', methods=['POST'])
def enable_object_detection():
    """物体検出を有効にする。"""
    global object_detection_enabled, object_detection_model
    
    # 初回有効化時にultralyticsの利用可能性を確認
    if not check_ultralytics_availability():
        return jsonify({'status': 'error', 'message': 'ultralyticsがインストールされていません'})
    
    if object_detection_model is None:
        print("物体検出モデルが未初期化のため、初期化を開始します...")
        if initialize_object_detection_model():
            object_detection_enabled = True
            print("物体検出が有効になりました")
            return jsonify({'status': 'enabled', 'message': '物体検出を有効にしました（モデル読み込み完了）'})
        else:
            print("物体検出モデルの初期化に失敗しました")
            return jsonify({'status': 'error', 'message': '物体検出モデルの読み込みに失敗しました'})
    else:
        object_detection_enabled = True
        print("物体検出が有効になりました（モデルは既に読み込み済み）")
        return jsonify({'status': 'enabled', 'message': '物体検出を有効にしました'})

@app.route('/disable_object_detection', methods=['POST'])
def disable_object_detection():
    """物体検出を無効にする。"""
    global object_detection_enabled
    
    object_detection_enabled = False
    return jsonify({'status': 'disabled', 'message': '物体検出を無効にしました'})

@app.route('/health', methods=['GET'])
def health():
    """ヘルスチェックエンドポイント。"""
    return jsonify({
        'status': 'healthy',
        'object_detection_available': OBJECT_DETECTION_AVAILABLE if OBJECT_DETECTION_AVAILABLE is not None else False,
        'streaming': is_streaming
    })

@app.route('/object_detection_status', methods=['GET'])
def object_detection_status():
    """物体検出の状態を取得する。"""
    global object_detection_enabled, object_detection_model
    
    # 初回状態確認時にultralyticsの利用可能性を確認
    if OBJECT_DETECTION_AVAILABLE is None:
        check_ultralytics_availability()
    
    status = {
        'available': OBJECT_DETECTION_AVAILABLE if OBJECT_DETECTION_AVAILABLE is not None else False,
        'enabled': object_detection_enabled,
        'model_loaded': object_detection_model is not None
    }
    print(f"物体検出状態を返します: {status}")
    return jsonify(status)

if __name__ == '__main__':
    try:
        print("Flaskサーバーを起動しています...")
        print("フロントエンドから http://localhost:5000 にアクセスしてください")
        
        # ultralyticsのインポートは初回有効化時まで遅延
        print("ultralyticsのインポートは初回物体検出有効化時まで遅延されます。")
        
        app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
    except KeyboardInterrupt:
        print("サーバーを停止しています...")
    finally:
        release_camera()
        print("リソースを解放しました")