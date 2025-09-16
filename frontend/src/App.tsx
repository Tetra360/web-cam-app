import { useState, useEffect } from "react";
import "./loading.css";

function App() {
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamUrl, setStreamUrl] = useState("");
	const [objectDetectionEnabled, setObjectDetectionEnabled] = useState(false);
	const [objectDetectionAvailable, setObjectDetectionAvailable] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [backendConnected, setBackendConnected] = useState(false);
	const [isSystemStarting, setIsSystemStarting] = useState(false);

	// バックエンドのベースURLを動的に決定する関数
	const getBackendBaseUrl = () => {
		// 開発環境では現在のホストを使用（VPN環境でも対応）
		if (import.meta.env.DEV) {
			return `http://${window.location.hostname}:5000`;
		}
		// 本番環境ではlocalhostを使用
		return 'http://localhost:5000';
	};

	// バックエンドとの接続確認を行う関数（5秒タイムアウト）
	const checkBackendConnection = async () => {
		const startTime = Date.now();
		const timeoutDuration = 5000; // 5秒
		
		const attemptConnection = async (): Promise<void> => {
			// 5秒経過したかチェック
			if (Date.now() - startTime >= timeoutDuration) {
				console.error("バックエンド接続タイムアウト（5秒）");
				setBackendConnected(false);
				setIsLoading(false);
				return;
			}

			try {
				console.log("バックエンドとの接続を確認中...");
				const response = await fetch(`${getBackendBaseUrl()}/health`, {
					method: "GET",
				});

				if (response.ok) {
					const data = await response.json();
					console.log("バックエンド接続成功:", data);
					setBackendConnected(true);
					setIsLoading(false);
					return;
				} else {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}
			} catch (error) {
				console.log("バックエンド接続エラー（再試行中）:", error);
				// 200ms待ってから再試行（より高速な接続確認）
				setTimeout(() => {
					if (isLoading) { // まだローディング中の場合は再試行
						attemptConnection();
					}
				}, 200);
			}
		};

		await attemptConnection();
	};

	// ストリームURLを更新する関数
	const updateStreamUrl = () => {
		setStreamUrl(`${getBackendBaseUrl()}/video_feed?t=${Date.now()}`);
	};

	// 物体検出状態を取得する関数
	const checkObjectDetectionStatus = async () => {
		// バックエンドが接続されていない場合は実行しない
		if (!backendConnected) {
			return;
		}

		try {
			console.log("物体検出状態を確認中...");
			const response = await fetch(`${getBackendBaseUrl()}/object_detection_status`);
			console.log("物体検出状態レスポンス:", response.status, response.statusText);
			
			if (response.ok) {
				const data = await response.json();
				console.log("物体検出状態データ:", data);
				setObjectDetectionAvailable(data.available);
				setObjectDetectionEnabled(data.enabled);
				
				// デバッグ情報を表示
				if (!data.available) {
					console.warn("物体検出機能が利用できません。ultralyticsがインストールされていない可能性があります。");
				}
			} else {
				console.error("物体検出状態取得失敗:", response.status, response.statusText);
				// エラー時は利用不可として設定
				setObjectDetectionAvailable(false);
				setObjectDetectionEnabled(false);
			}
		} catch (error) {
			console.error("物体検出状態取得エラー:", error);
			// エラー時は利用不可として設定
			setObjectDetectionAvailable(false);
			setObjectDetectionEnabled(false);
		}
	};

	// 物体検出を有効化
	const enableObjectDetection = async () => {
		try {
			const response = await fetch(`${getBackendBaseUrl()}/enable_object_detection`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
			});

			if (response.ok) {
				const data = await response.json();
				if (data.status === "enabled") {
					setObjectDetectionEnabled(true);
					// ストリーミング中ならURLを更新して物体検出結果を反映
					if (isStreaming) {
						updateStreamUrl();
					}
				} else {
					alert(data.message || "物体検出有効化に失敗しました");
				}
			} else {
				alert("物体検出有効化に失敗しました");
			}
		} catch (error) {
			console.error("物体検出有効化エラー:", error);
			alert("物体検出有効化に失敗しました");
		}
	};

	// 物体検出を無効化
	const disableObjectDetection = async () => {
		try {
			const response = await fetch(`${getBackendBaseUrl()}/disable_object_detection`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
			});

			if (response.ok) {
				setObjectDetectionEnabled(false);
				// ストリーミング中ならURLを更新して通常映像に戻す
				if (isStreaming) {
					updateStreamUrl();
				}
			} else {
				alert("物体検出無効化に失敗しました");
			}
		} catch (error) {
			console.error("物体検出無効化エラー:", error);
			alert("物体検出無効化に失敗しました");
		}
	};

	// ストリーミング開始
	const startStream = async () => {
		setIsSystemStarting(true);
		let isCancelled = false;

		// 20秒後に強制的にタイムアウトを発動
		const timeoutId = setTimeout(() => {
			if (!isCancelled) {
				console.error("ストリーム開始タイムアウト（20秒）");
				alert("システムの起動がタイムアウトしました（20秒）。バックエンドサーバーが起動していることを確認してください。");
				setIsSystemStarting(false);
				isCancelled = true;
			}
		}, 20000);

		const attemptStartStream = async (): Promise<void> => {
			// キャンセルされた場合は処理を停止
			if (isCancelled) {
				return;
			}

			try {
				console.log("ストリーム開始を試行中...");
				const response = await fetch(`${getBackendBaseUrl()}/start_stream`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
				});

				if (response.ok) {
					console.log("ストリーム開始成功");
					clearTimeout(timeoutId); // タイムアウトをクリア
					setIsStreaming(true);
					setIsSystemStarting(false);
					isCancelled = true;
					updateStreamUrl();
					// ストリーミング開始後に物体検出状態を再確認
					checkObjectDetectionStatus();
					return;
				} else {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}
			} catch (error) {
				console.log("ストリーム開始エラー（再試行中）:", error);
				// 500ms待ってから再試行（より高速な再試行）
				setTimeout(() => {
					if (!isCancelled) { // キャンセルされていない場合は再試行
						attemptStartStream();
					}
				}, 500);
			}
		};

		await attemptStartStream();
	};

	// ストリーミング停止
	const stopStream = async () => {
		try {
			const response = await fetch(`${getBackendBaseUrl()}/stop_stream`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
			});

			if (response.ok) {
				setIsStreaming(false);
				setStreamUrl("");
			} else {
				alert("ストリーム停止に失敗しました");
			}
		} catch (error) {
			console.error("ストリーム停止エラー:", error);
			alert("ストリーム停止に失敗しました");
		}
	};

	// コンポーネントマウント時にバックエンド接続を確認
	useEffect(() => {
		checkBackendConnection();
	}, []);

	// バックエンド接続後に物体検出状態を確認
	useEffect(() => {
		if (backendConnected) {
			checkObjectDetectionStatus();
		}
	}, [backendConnected]);


	// メイン画面（バックエンド接続済み）
	return (
		<div className="flex flex-col h-screen">
			{/* 映像表示エリア */}
			<div className="flex-1 bg-black flex items-center justify-center">
				{isSystemStarting ? (
					<div className="flex justify-center items-center" aria-label="読み込み中">
						<div className="loader"></div>
					</div>
				) : streamUrl ? (
					<img
						src={streamUrl}
						alt="カメラ映像"
						className="max-w-full max-h-full object-contain"
					/>
				) : (
					<div className="text-white text-xl">カメラ映像</div>
				)}
			</div>

			{/* ボタン */}
			<div className="flex justify-center gap-4 p-4 bg-gray-800">
				<button
					className={`px-6 py-3 rounded text-white font-medium ${
						isStreaming || isSystemStarting
							? "bg-gray-600 cursor-not-allowed"
							: "bg-green-600 hover:bg-green-700"
					}`}
					onClick={startStream}
					disabled={isStreaming || isSystemStarting}
				>
					{isSystemStarting ? "システム起動中..." : "開始"}
				</button>
				<button
					className={`px-6 py-3 rounded text-white font-medium ${
						!isStreaming
							? "bg-gray-600 cursor-not-allowed"
							: "bg-red-600 hover:bg-red-700"
					}`}
					onClick={stopStream}
					disabled={!isStreaming}
				>
					停止
				</button>
				
				{/* 物体検出トグルボタン */}
				<button
					className={`px-6 py-3 rounded text-white font-medium transition-colors ${
						!objectDetectionAvailable
							? "bg-gray-500 cursor-not-allowed"
							: objectDetectionEnabled
							? "bg-green-600 hover:bg-green-700"
							: "bg-gray-600 hover:bg-gray-700"
					}`}
					onClick={objectDetectionEnabled ? disableObjectDetection : enableObjectDetection}
					disabled={!objectDetectionAvailable}
					title={!objectDetectionAvailable ? "物体検出機能は利用できません" : objectDetectionEnabled ? "物体検出を無効化" : "物体検出を有効化"}
				>
					物体検出 {objectDetectionEnabled ? "ON" : "OFF"}
					{!objectDetectionAvailable && " (利用不可)"}
				</button>
				
			</div>
		</div>
	);
}

export default App;