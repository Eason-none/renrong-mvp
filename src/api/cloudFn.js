// 小程序端统一走微信云开发云函数 llmProxy（wx.cloud.callFunction）。
// 真实 key 藏在云函数环境变量里，微信天然鉴权——只有本小程序能调，无需域名/备案/合法域名白名单。
// 仅在 mp-weixin 端被调用；H5 端仍走 VITE_API_PROXY_URL 指向的 HTTP 代理（见各 api 文件的 #ifndef 分支）。
//
// 本模块只在函数体内引用 wx.cloud，模块顶层不触碰 wx，所以被 H5 产物一起打包也无副作用。
//
// 返回 res.result，形如 { statusCode, data }（见 cloudfunctions/llmProxy/index.js），
// 与原 uni.request 的 { res.statusCode, res.data } 同形，调用方解析逻辑不变。
// 云函数在控制台里的实际名字（不是文件名）。改了这里就是改了实际调用的函数。
const FN_NAME = "fengrong"

export function callLlmCloud({ target, model, messages }) {
	return new Promise((resolve, reject) => {
		wx.cloud.callFunction({
			name: FN_NAME,
			data: { target, model, messages },
			success: (res) => resolve(res.result),
			fail: (err) => reject(new Error(`云函数 ${FN_NAME} 调用失败：${err.errMsg || err.errmsg || err.message}`)),
		})
	})
}
