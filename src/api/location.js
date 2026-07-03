// 封装 wx.getLocation 获取城市名，仅 mp-weixin 有效，H5 直接返回 null。
// 微信逆地理编码需要腾讯地图 key；和风天气 API 直接用城市名查询，
// 所以这里只取 wx.getLocation 返回的 city 字段（type=2 时有该字段）。
export async function getCity() {
	// #ifndef MP-WEIXIN
	return null;
	// #endif

	// #ifdef MP-WEIXIN
	return new Promise((resolve) => {
		wx.getLocation({
			type: "gcj02",
			success(res) {
				// wx.getLocation 不直接返回城市名，需要逆地理编码。
				// 调用微信内置的 wx.geocoder 或腾讯地图 API 成本较高，
				// 改用和风天气的 GeoAPI 按经纬度查城市——该逻辑在 weather.js 里一并处理。
				// 这里只返回经纬度，由 weather.js 统一解析城市+天气。
				resolve({ lat: res.latitude, lng: res.longitude });
			},
			fail() {
				resolve(null);
			},
		});
	});
	// #endif
}
