import { useState, useEffect } from "react";

function App() {
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamUrl, setStreamUrl] = useState("");
	const [objectDetectionEnabled, setObjectDetectionEnabled] = useState(false);
	const [objectDetectionAvailable, setObjectDetectionAvailable] = useState(false);

	// ストリームURLを更新する関数
	const updateStreamUrl = () => {
		setStreamUrl(`http://localhost:5000/video_feed?t=${Date.now()}`);
	};

	// 物体検出状態を取得する関数
	const checkObjectDetectionStatus = async () => {
		try {
			const response = await fetch("http://localhost:5000/object_detection_status");
			if (response.ok) {
				const data = await response.json();
				console.log("物体検出状態:", data);
				setObjectDetectionAvailable(data.available);
				setObjectDetectionEnabled(data.enabled);
			} else {
				console.error("物体検出状態取得失敗:", response.status);
			}
		} catch (error) {
			console.error("物体検出状態取得エラー:", error);
		}
	};

	// 物体検出を有効化
	const enableObjectDetection = async () => {
		try {
			const response = await fetch("http://localhost:5000/enable_object_detection", {
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
			const response = await fetch("http://localhost:5000/disable_object_detection", {
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
		try {
			const response = await fetch("http://localhost:5000/start_stream", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
			});

			if (response.ok) {
				setIsStreaming(true);
				updateStreamUrl();
				// ストリーミング開始後に物体検出状態を再確認
				checkObjectDetectionStatus();
			} else {
				alert("ストリーム開始に失敗しました");
			}
		} catch (error) {
			console.error("ストリーム開始エラー:", error);
			alert("ストリーム開始に失敗しました");
		}
	};

	// ストリーミング停止
	const stopStream = async () => {
		try {
			const response = await fetch("http://localhost:5000/stop_stream", {
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

	// コンポーネントマウント時に物体検出状態を確認
	useEffect(() => {
		checkObjectDetectionStatus();
	}, []);

	return (
		<div className="flex flex-col h-screen">
			{/* 映像表示エリア */}
			<div className="flex-1 bg-black flex items-center justify-center">
				{streamUrl ? (
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
						isStreaming
							? "bg-gray-600 cursor-not-allowed"
							: "bg-green-600 hover:bg-green-700"
					}`}
					onClick={startStream}
					disabled={isStreaming}
				>
					開始
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