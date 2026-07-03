// 和风天气 API 封装（https://dev.qweather.com 新版）
// 认证：Header X-QW-Api-Key；Host 为项目专属域名（VITE_WEATHER_HOST）
// 流程：坐标 → Weather Now（顺带取 locationId）→ 并行查城市/空气/预警

const API_KEY = import.meta.env.VITE_WEATHER_API_KEY;
const API_HOST = import.meta.env.VITE_WEATHER_HOST;

function wxRequest(url) {
	return new Promise((resolve, reject) => {
		uni.request({
			url,
			method: "GET",
			header: { "X-QW-Api-Key": API_KEY },
			success: (res) => resolve(res),
			fail: (err) => reject(err),
		});
	});
}

// fxLink 格式：https://www.qweather.com/weather/heping-101030800.html
function extractLocationId(fxLink) {
	const match = (fxLink || "").match(/-(\d+)\.html$/);
	return match ? match[1] : null;
}

async function fetchWeatherNow(coords) {
	const url = `https://${API_HOST}/v7/weather/now?location=${coords.lng},${coords.lat}`;
	try {
		const res = await wxRequest(url);
		if (res.statusCode === 200 && res.data?.code === "200") {
			return {
				text: res.data.now.text,
				temp: res.data.now.temp,
				locationId: extractLocationId(res.data.fxLink),
			};
		}
	} catch (e) {
		console.error("[weather] now error:", e);
	}
	return { text: null, temp: null, locationId: null };
}

async function fetchCity(locationId) {
	const url = `https://${API_HOST}/geo/v2/city/lookup?location=${locationId}`;
	try {
		const res = await wxRequest(url);
		if (res.statusCode === 200 && res.data?.code === "200") {
			const loc = res.data.location?.[0]
			if (!loc) return null
			return loc.adm2 && loc.name ? `${loc.adm2}·${loc.name}` : (loc.adm2 || loc.name || null)
		}
	} catch (e) {
		console.error("[weather] geo error:", e);
	}
	return null;
}

async function fetchAirQuality(locationId) {
	const url = `https://${API_HOST}/v7/air/now?location=${locationId}`;
	try {
		const res = await wxRequest(url);
		if (res.statusCode === 200 && res.data?.code === "200") {
			return res.data.now?.category ?? null; // 优/良/轻度污染/…
		}
	} catch (e) {
		console.error("[weather] air error:", e);
	}
	return null;
}

async function fetchWarning(locationId) {
	const url = `https://${API_HOST}/v7/warning/now?location=${locationId}`;
	try {
		const res = await wxRequest(url);
		if (res.statusCode === 200 && res.data?.code === "200") {
			const active = (res.data.warning || []).filter((w) => w.status === "active");
			return active.length ? active[0].title : null;
		}
	} catch (e) {
		console.error("[weather] warning error:", e);
	}
	return null;
}

// 入参：{ lat, lng }
// 返回：{ city, weatherText, temp, airQuality, warning }，任一字段失败为 null
export async function getEnvironmentInfo(coords) {
	if (!API_KEY || !API_HOST || !coords) {
		return { city: null, weatherText: null, temp: null, airQuality: null, warning: null };
	}

	const { text, temp, locationId } = await fetchWeatherNow(coords);

	const [city, airQuality, warning] = locationId
		? await Promise.all([fetchCity(locationId), fetchAirQuality(locationId), fetchWarning(locationId)])
		: [null, null, null];

	return { city, weatherText: text, temp, airQuality, warning };
}
