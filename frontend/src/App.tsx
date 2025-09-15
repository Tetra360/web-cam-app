import { useState } from "react";

function App() {
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamUrl, setStreamUrl] = useState("");

	// ストリームURLを更新する関数
	const updateStreamUrl = () => {
		setStreamUrl(`http://localhost:5000/video_feed?t=${Date.now()}`);
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
			</div>
		</div>
	);
}

export default App;