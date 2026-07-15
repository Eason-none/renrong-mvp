// 图片压缩（diary-trace 1.3/1.5）：聊天发图与存量原图迁移共用这套压缩逻辑。
// 2026-07-15 内测反馈：分享卡照片糊。根因=卡片照片区物理宽约 280逻辑px×dpr3≈840px，
// 300px 源图放大 2.8 倍。长边提到 900 后基本 1:1 输出；单张 ~40KB→~150KB，
// 10MB 预算约 60 张（外置层同图去重仍有效），真机压测后再定是否分档。
// 原图从不落库：ChatView只用压缩后的结果写入消息记录，原图仅存在于内存里供当次模型调用。

const THUMB_MAX_EDGE = 900;

// H5的uni.chooseImage返回的tempFilePath是blob: URL，历史遗留的旧图是data: URL——
// 两者都能直接作Image().src用，H5端压缩因此不区分"文件路径"还是"已落库的dataURL"。
function compressViaCanvas(imgSrc) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(img.width, img.height));
			const width = Math.max(1, Math.round(img.width * scale));
			const height = Math.max(1, Math.round(img.height * scale));
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			canvas.getContext("2d").drawImage(img, 0, 0, width, height);
			resolve(canvas.toDataURL("image/jpeg", 0.7));
		};
		img.onerror = () => reject(new Error("图片加载失败"));
		img.src = imgSrc;
	});
}

function compressFilePathWeixin(path) {
	return new Promise((resolve, reject) => {
		uni.compressImage({
			src: path,
			quality: 60,
			compressedWidth: THUMB_MAX_EDGE,
			success: (res) => {
				uni.getFileSystemManager().readFile({
					filePath: res.tempFilePath,
					encoding: "base64",
					success: (fileRes) => resolve(`data:image/jpeg;base64,${fileRes.data}`),
					fail: reject,
				});
			},
			fail: reject,
		});
	});
}

// mp-weixin的uni.compressImage只接受本地文件路径，不接受dataURL——迁移旧数据时手上只有
// 已落库的base64，需要先落一个临时文件才能压缩。
function writeDataUrlToTempFile(dataUrl) {
	return new Promise((resolve, reject) => {
		const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
		const tmpPath = `${uni.env.USER_DATA_PATH}/img_migrate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.tmp`;
		uni.getFileSystemManager().writeFile({
			filePath: tmpPath,
			data: base64,
			encoding: "base64",
			success: () => resolve(tmpPath),
			fail: reject,
		});
	});
}

// 从uni.chooseImage拿到的本地文件path压缩：ChatView发送新图片时用。
export function compressImageFile(path) {
	// #ifdef H5
	return compressViaCanvas(path);
	// #endif
	// #ifndef H5
	return compressFilePathWeixin(path);
	// #endif
}

// 从已落库的base64 dataURL压缩：存量迁移用，手上没有对应的本地文件path。
export function compressImageDataUrl(dataUrl) {
	// #ifdef H5
	return compressViaCanvas(dataUrl);
	// #endif
	// #ifndef H5
	return writeDataUrlToTempFile(dataUrl).then((tmpPath) => compressFilePathWeixin(tmpPath));
	// #endif
}
