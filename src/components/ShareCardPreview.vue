<template>
  <!-- 只 stop tap、不 catch touchstart/touchend/touchmove：mp-weixin 上 catch 触摸事件
       会阻断整个子树的 tap 合成（预览里所有按钮点不动的根因）。预览打开期间对底下
       TracePage 横滑翻页的屏蔽由 TracePage 自己按 showShare 判断。 -->
  <view class="share-preview" @tap.stop>
    <view class="share-preview__backdrop" @tap="$emit('close')"></view>
    <view class="share-preview__body">
      <view class="share-preview__close" hover-class="u-press" @tap="$emit('close')">‹ 回去</view>

      <scroll-view class="share-preview__stage" scroll-y :style="stageStyle">
        <!-- #ifdef MP-WEIXIN -->
        <!-- 同层 2d canvas：旧 canvas-id 接口在微信端是非同层原生组件，会悬浮在所有普通组件
             之上并吃掉手势（「回去」/节选切换点不动的根因），且官方已停止维护 -->
        <canvas
          type="2d"
          id="shareCardCanvas"
          class="share-preview__canvas"
          :style="{ width: cssW + 'px', height: cssH + 'px' }"
        ></canvas>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <canvas
          canvas-id="shareCardCanvas"
          id="shareCardCanvas"
          class="share-preview__canvas"
          :style="{ width: cssW + 'px', height: cssH + 'px' }"
        ></canvas>
        <!-- #endif -->
      </scroll-view>

      <!-- 回顾卡专属：只这一段 / 全文（默认节选，不做任何"全文更完整"的暗示） -->
      <view v-if="review" class="share-preview__toggle">
        <view
          class="share-preview__toggle-opt"
          :class="{ 'share-preview__toggle-opt--on': !useFullText }"
          hover-class="u-press"
          @tap="setFullText(false)"
        >只这一段</view>
        <view
          class="share-preview__toggle-opt"
          :class="{ 'share-preview__toggle-opt--on': useFullText }"
          hover-class="u-press"
          @tap="setFullText(true)"
        >全文</view>
      </view>

      <!-- 版式（仅日记卡）+ 纸样：轻选择器，选择只影响这一次导出（不落库不上报） -->
      <view v-if="layoutOptions.length" class="share-preview__toggle">
        <view
          v-for="opt in layoutOptions"
          :key="opt.id"
          class="share-preview__toggle-opt"
          :class="{ 'share-preview__toggle-opt--on': layoutStyle === opt.id }"
          hover-class="u-press"
          @tap="setStyle(opt.id)"
        >{{ opt.label }}</view>
      </view>
      <view class="share-preview__toggle share-preview__toggle--papers">
        <view
          v-for="p in papers"
          :key="p.id"
          class="share-preview__toggle-opt"
          :class="{ 'share-preview__toggle-opt--on': paper === p.id }"
          hover-class="u-press"
          @tap="setPaper(p.id)"
        >{{ p.label }}</view>
      </view>
      <view v-if="tip" class="share-preview__tip">{{ tip }}</view>

      <view v-if="authDenied" class="share-preview__auth">
        <view class="share-preview__auth-text">相册没有打开，可以在设置里允许保存。</view>
        <view class="share-preview__auth-btn" hover-class="u-press" @tap="openSetting">去设置</view>
      </view>

      <view
        class="share-preview__save"
        :class="{ 'share-preview__save--busy': saving || drawing }"
        hover-class="u-press"
        @tap="onSaveTap"
      >{{ savedTip || '存进相册' }}</view>
    </view>
  </view>
</template>

<script>
// 分享卡预览与保存（share-card spec / add-share-cards design.md D2-D4）
// 预览即确认：唯一动作是"存进相册"，不提供直接转发——先进自己的相册，
// 发不发给别人是相册里的下一步（感知先于展示）。
import { buildDiaryCardModel, buildReviewCardModel } from '@/utils/shareCard.js'

// 小程序码来源单一常量（design.md D3）：MVP 用小程序后台预生成的静态码图（放 src/static/ 后
// 把路径填到这里）；带 scene 参数的动态码留生产阶段随代理做，替换只动这一行。
// 为空时绘制占位环（内测期可接受，不发任何网络请求）。
const SUNCODE_IMAGE = ''

// 画布设计尺寸（逻辑 px），导出时 2 倍采样；全文信纸卡超高时回退节选（spec：画布上限兜底）
const CARD_W = 340
const MAX_H = 1400
const DESK = 18 // 桌面边距（画面即"拍在桌上的卡"）
const PAD = 16 // 卡内边距

// 与产品 token 同源的纸面配色（App.vue :root；卡片是实体纸面，不随暗色主题翻转）
const C = {
  desk: '#f3f7f0',
  paper: '#fffdf8',
  ink: '#1c2417',
  body: '#3c4433',
  muted: '#5a6353',
  line: '#e6e2d5',
  rule: '#d6ccae',
  gold: '#8a5c12',
  leaf: '#8aa06f',
  shadow: 'rgba(8, 16, 6, 0.16)',
}

// 同层 2d canvas 的旧接口适配层（仅 mp-weixin 用）：全部绘制代码按旧 createCanvasContext
// 接口写成，这里把标准 CanvasRenderingContext2D 包装出同名方法，layout()/setFont() 零改动。
function legacyCtxAdapter(raw) {
  const wrap = {
    setFillStyle: (v) => { raw.fillStyle = v },
    setStrokeStyle: (v) => { raw.strokeStyle = v },
    setLineWidth: (v) => { raw.lineWidth = v },
    setTextAlign: (v) => { raw.textAlign = v },
    setFontSize: (v) => { raw.font = `${v}px sans-serif` },
    setShadow: (x, y, blur, color) => {
      raw.shadowOffsetX = x
      raw.shadowOffsetY = y
      raw.shadowBlur = blur
      raw.shadowColor = color
    },
    setLineDash: (dash) => raw.setLineDash(Array.isArray(dash) ? dash : []),
    measureText: (t) => raw.measureText(t),
    save: () => raw.save(),
    restore: () => raw.restore(),
    beginPath: () => raw.beginPath(),
    closePath: () => raw.closePath(),
    moveTo: (...a) => raw.moveTo(...a),
    lineTo: (...a) => raw.lineTo(...a),
    arcTo: (...a) => raw.arcTo(...a),
    arc: (...a) => raw.arc(...a),
    // 纸样/压花叶（add-share-card-styles）用到的变换与曲线；旧接口端（H5）原生就有这四个
    translate: (...a) => raw.translate(...a),
    rotate: (...a) => raw.rotate(...a),
    scale: (...a) => raw.scale(...a),
    bezierCurveTo: (...a) => raw.bezierCurveTo(...a),
    setLineCap: (v) => { raw.lineCap = v },
    createRadialGradient: (...a) => raw.createRadialGradient(...a),
    stroke: () => raw.stroke(),
    fill: () => raw.fill(),
    clip: () => raw.clip(),
    fillRect: (...a) => raw.fillRect(...a),
    fillText: (...a) => raw.fillText(...a),
    drawImage: (...a) => raw.drawImage(...a),
    // 2d canvas 即画即显，没有 draw() 提交步骤——保留同名方法让共用代码不分叉
    draw: (_reserve, cb) => { if (typeof cb === 'function') cb() },
  }
  // setFont() 里有 ctx.font = ... 的直接赋值（楷体栈），转发给原始上下文
  Object.defineProperty(wrap, 'font', {
    get: () => raw.font,
    set: (v) => { try { raw.font = v } catch (e) { /* 字体串不被解析就保持已设字号 */ } },
  })
  return wrap
}

// type="2d" canvas 里 drawImage 只收 Image 对象，不收路径字符串——统一经此预载
function loadNodeImage(node, src) {
  return new Promise((resolve) => {
    const img = node.createImage()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// 纸样（add-share-card-styles，用户定稿 2026-07-15）：无纯白选项，默认宣纸米
const PAPERS = [
  { id: 'rice', label: '宣纸米', base: '#f8f4ea' },
  { id: 'wash', label: '水彩晕', base: '#fbfcf8' },
  { id: 'ruled', label: '信笺线', base: '#f6f9f3' },
  { id: 'leaf', label: '叶影', base: '#f5f8f2' },
  { id: 'moss', label: '苔点', base: '#f1f4ec' },
]
const RULED_LINE = 'rgba(18, 71, 3, 0.16)' // 信笺横线：随正文逐行绘制（先线后字）

// 压花叶程序绘制：与 CompletionBeat/聊天收尾印章同一片叶（40×100 坐标系：
// 对称轮廓 + 贯穿顶尖到叶柄的中轴 + 左右各两条镜像错落侧脉）。scale/angle 复用于
// 摘句版式的金叶印与叶影纸样的倾斜散布。线宽随 scale 缩放，与 SVG 表现一致。
function drawLeaf(ctx, { x, y, scale, angle, stroke }) {
  ctx.save()
  ctx.translate(x, y)
  if (angle) ctx.rotate((angle * Math.PI) / 180)
  ctx.scale(scale, scale)
  ctx.setStrokeStyle(stroke)
  try { ctx.setLineCap('round') } catch (e) { /* 无能力就平头 */ }
  ctx.setLineWidth(2)
  ctx.beginPath()
  ctx.moveTo(20, 10)
  ctx.bezierCurveTo(35, 25, 35, 62.5, 20, 70)
  ctx.bezierCurveTo(5, 62.5, 5, 25, 20, 10)
  ctx.closePath()
  ctx.stroke()
  ctx.setLineWidth(1.2)
  ctx.beginPath()
  ctx.moveTo(20, 10)
  ctx.lineTo(20, 85)
  ctx.stroke()
  ctx.setLineWidth(1)
  const veins = [
    [20, 30.6, 26.4, 19],
    [20, 43.8, 10.6, 26.9],
    [20, 49.4, 30.5, 31],
    [20, 60.6, 8.8, 40.8],
  ]
  for (const [x1, y1, x2, y2] of veins) {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  ctx.restore()
}

export default {
  name: 'ShareCardPreview',
  props: {
    // 二选一：page = 日记页（TracePage 的 current 形状），review = { text, collectionName }
    page: { type: Object, default: null },
    review: { type: Object, default: null },
  },
  emits: ['close'],
  data() {
    return {
      cssW: CARD_W,
      cssH: 420,
      stageMaxPx: 0, // 卡片显示区可用像素高（视口高 - 顶部回去/切换/底部按钮的固定占位）
      useFullText: false,
      // 版式/纸样（add-share-card-styles）：组件态，不落库不上报不进 card model
      layoutStyle: 'specimen',
      paper: 'rice',
      drawing: false,
      saving: false,
      saved: false, // 存过一次后：按钮变"存好了"，再点即"回去"（emit close）
      authDenied: false,
      savedTip: '',
      tip: '',
    }
  },
  created() {
    // 下面三个是原生对象（canvas 节点 / Image），不能进 data()：Vue3 会包成响应式 Proxy，
    // 传回 wx.canvasToTempFilePath / drawImage 时原生层读不到内部字段
    // （报 "Cannot read property 'width' of undefined"）。模板也不引用它们。
    this.photoInfos = [] // [{ path, width, height, img? }] 预解析的照片（img 仅同层 2d canvas 用）
    this.canvasNode = null // mp-weixin 同层 2d canvas 节点（导出时要传 node 而不是 canvasId）
    this.suncodeImg = null // 太阳码在 2d canvas 里的预载 Image
    // 视口可用高度：留 ~310px 给"‹回去"/节选切换/版式行/纸样行/"存进相册"及内边距+安全区，
    // 其余给卡片显示区。scroll-view 拿到确定像素高度才会真正滚动（见 .share-preview__stage 注释）。
    const win = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
    this.stageMaxPx = Math.max(220, Math.round((win.windowHeight || win.screenHeight || 640) - 310))
  },
  computed: {
    // 卡片显示区高度：短卡片正好等于画布高（不留空框），长图封顶到视口可用高度、超出在卡内滚动
    stageStyle() {
      const cap = this.stageMaxPx || this.cssH
      return { height: Math.min(this.cssH, cap) + 'px' }
    },
    model() {
      if (this.review) return buildReviewCardModel(this.review.text, this.review.collectionName, this.useFullText)
      return buildDiaryCardModel(this.page || {})
    },
    papers() {
      return PAPERS
    },
    // 版式只给日记卡（回顾信纸形态固定）；「照片开窗」仅在有照片时出现
    layoutOptions() {
      if (this.review) return []
      const opts = [
        { id: 'specimen', label: '标本页' },
        { id: 'quote', label: '摘句' },
      ]
      if (this.model.kind === 'photo') opts.push({ id: 'photo', label: '照片开窗' })
      return opts
    },
  },
  mounted() {
    this.render()
  },
  methods: {
    setFullText(v) {
      if (this.useFullText === v || this.drawing) return
      this.useFullText = v
      this.tip = ''
      // 切了节选/全文即换了一张卡，"已存"状态失效，按钮回到"存进相册"
      this.saved = false
      this.savedTip = ''
      this.render()
    },

    // 版式/纸样切换：与节选/全文同构——换了就是另一张卡，"已存"失效
    setStyle(id) {
      if (this.layoutStyle === id || this.drawing) return
      this.layoutStyle = id
      this.tip = ''
      this.saved = false
      this.savedTip = ''
      this.render()
    },
    setPaper(id) {
      if (this.paper === id || this.drawing) return
      this.paper = id
      this.tip = ''
      this.saved = false
      this.savedTip = ''
      this.render()
    },

    // 存进相册的唯一入口：存过一次后（saved）再点，走和"回去"一样的关闭逻辑
    onSaveTap() {
      if (this.saved) {
        this.$emit('close')
        return
      }
      this.save()
    },

    // ---- 照片预解析：mp 端 base64 需先落临时文件才能进 canvas/getImageInfo ----
    // node 非空（同层 2d canvas）时顺带预载 Image 对象；单张失败只裁掉这张（全失败降级为无照片版式）。
    async resolvePhotos(node) {
      if (this.model.kind !== 'photo') return []
      const infos = []
      for (let i = 0; i < this.model.photos.length; i++) {
        const info = await this.resolvePhoto(this.model.photos[i], node, i)
        if (info) infos.push(info)
      }
      return infos
    },

    async resolvePhoto(src, node, index = 0) {
      if (!src) return null
      let path = src
      // #ifdef MP-WEIXIN
      if (src.startsWith('data:image')) {
        try {
          const fs = wx.getFileSystemManager()
          // 文件名带序号：一张卡最多 3 张照片，同名会互相覆盖
          path = `${wx.env.USER_DATA_PATH}/sharecard_photo_${index}.png`
          fs.writeFileSync(path, src.slice(src.indexOf(',') + 1), 'base64')
        } catch (e) {
          console.error('[share-card] photo temp write failed:', e)
          return null
        }
      }
      // #endif
      const info = await new Promise((resolve) => {
        uni.getImageInfo({
          src: path,
          success: (res) => resolve({ path, width: res.width, height: res.height }),
          fail: () => resolve(null),
        })
      })
      if (!info || !node) return info
      const img = await loadNodeImage(node, path)
      return img ? { ...info, img } : null
    },

    measure(ctx, text, fontSize) {
      try {
        if (ctx.measureText) {
          const m = ctx.measureText(text)
          if (m && m.width) return m.width
        }
      } catch (e) { /* 低版本基础库无 measureText，走估算 */ }
      // CJK 估算兜底：全角按 1 字宽、半角按 0.55
      let w = 0
      for (const ch of text) w += ch.charCodeAt(0) > 255 ? fontSize : fontSize * 0.55
      return w
    },

    wrapText(ctx, text, fontSize, maxWidth) {
      ctx.setFontSize(fontSize)
      const lines = []
      let line = ''
      for (const ch of text) {
        if (this.measure(ctx, line + ch, fontSize) > maxWidth && line) {
          lines.push(line)
          line = ch
        } else {
          line += ch
        }
      }
      if (line) lines.push(line)
      return lines
    },

    setFont(ctx, size, { bold = false, kai = false } = {}) {
      // ctx.font 在部分端不生效，setFontSize 恒兜底；楷体栈多级回退（design.md 风险项）
      ctx.setFontSize(size)
      try {
        const family = kai ? '"Kaiti SC", "STKaiti", KaiTi, serif' : 'sans-serif'
        ctx.font = `${bold ? 'bold ' : ''}${size}px ${family}`
      } catch (e) { /* 忽略，字号已生效 */ }
    },

    // ---- 布局 + 绘制。两遍：第一遍量高度，第二遍真画 ----
    // drawing 标志由这里统一开合（try/finally），任何分支异常都不会把切换/保存永久锁死。
    async render() {
      this.drawing = true
      try {
        // #ifdef MP-WEIXIN
        await this.renderMp()
        // #endif
        // #ifndef MP-WEIXIN
        await this.renderLegacy()
        // #endif
      } catch (err) {
        console.error('[share-card] render failed:', err)
        this.tip = '这一页没画出来，等下再试试。'
      } finally {
        this.drawing = false
      }
    },

    // 量高度 + 全文超限回退节选（share-card spec 兜底），两端共用
    computeHeight(ctx) {
      let h = this.layout(ctx, false)
      if (this.review && this.useFullText && h > MAX_H) {
        this.useFullText = false
        this.tip = '全文有点长，这张卡先收下开头这一段。'
        h = this.layout(ctx, false)
      }
      return Math.ceil(h)
    },

    // mp-weixin：同层 type="2d" canvas。像素尺寸按 dpr 采样（封顶防超画布上限），即画即显。
    async renderMp() {
      const node =
        this.canvasNode ||
        (await new Promise((resolve) => {
          uni.createSelectorQuery().in(this).select('#shareCardCanvas').fields({ node: true }, (res) => resolve(res && res.node)).exec()
        }))
      if (!node) throw new Error('canvas node 未取到')
      this.canvasNode = node
      const raw = node.getContext('2d')
      const ctx = legacyCtxAdapter(raw)
      if (SUNCODE_IMAGE && !this.suncodeImg) {
        this.suncodeImg = await loadNodeImage(node, SUNCODE_IMAGE)
      }
      this.photoInfos = await this.resolvePhotos(node)
      this.cssH = this.computeHeight(ctx)
      await this.$nextTick()
      const win = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
      const dpr = Math.min(win.pixelRatio || 2, 4096 / Math.max(this.cssH, CARD_W))
      node.width = Math.floor(CARD_W * dpr)
      node.height = Math.floor(this.cssH * dpr)
      raw.setTransform(dpr, 0, 0, dpr, 0, 0)
      this.layout(ctx, true)
    },

    // 其余端（H5 等）：旧 createCanvasContext 接口，画布高度变了必须重取上下文
    async renderLegacy() {
      this.photoInfos = await this.resolvePhotos()
      const ctx = uni.createCanvasContext('shareCardCanvas', this)
      this.cssH = this.computeHeight(ctx)
      await this.$nextTick()
      // uni-h5 的 canvas 像素尺寸随 style 变化是异步的（ResizeObserver），高度变大时若立即
      // flush 绘制命令，会在 resize 落地前画一半、resize 只保得住旧区域——背景被截成半张
      //（多图纵向拼贴让卡高首次超过默认 420 才暴露）。多等两帧让 resize 先落地。
      await new Promise((r) => setTimeout(r, 80))
      const ctx2 = uni.createCanvasContext('shareCardCanvas', this)
      this.layout(ctx2, true)
      // 部分端 draw 回调不触发，加兜底定时器防 drawing 卡死（重复 resolve 无害）
      await new Promise((resolve) => {
        ctx2.draw(false, resolve)
        setTimeout(resolve, 600)
      })
    },

    // 单遍布局函数：draw=false 只算高度，draw=true 实际落笔。返回画布总高。
    layout(ctx, draw) {
      const m = this.model
      const cardX = DESK
      const cardW = CARD_W - DESK * 2
      const innerX = cardX + PAD
      const innerW = cardW - PAD * 2
      const cardY = DESK + 10 // 顶部给胶带留出探头空间
      let y = cardY + PAD

      // -- 量算/绘制正文各段（各版式共用 walk 逻辑，先积累绘制指令高度） --
      const ops = []
      const push = (fn, height) => {
        if (draw) ops.push({ fn, y })
        y += height
      }
      // 信笺线：横线只随正文行出现（先线后字，字坐在线上），线距天然=行距
      const ruleAt = (yy) => {
        if (this.paper !== 'ruled') return
        ctx.setStrokeStyle(RULED_LINE)
        ctx.setLineWidth(1)
        ctx.beginPath()
        ctx.moveTo(innerX, yy)
        ctx.lineTo(innerX + innerW, yy)
        ctx.stroke()
      }

      if (m.kind === 'letter') {
        y += 8
        const nameSpaced = m.collectionName.split('').join(' ')
        push((yy) => {
          this.setFont(ctx, 10)
          ctx.setFillStyle(C.gold)
          ctx.setTextAlign('center')
          ctx.fillText(nameSpaced, CARD_W / 2, yy + 10)
          ctx.setTextAlign('left')
        }, 22)
        push((yy) => {
          this.setFont(ctx, 18, { bold: true, kai: true })
          ctx.setFillStyle(C.ink)
          ctx.setTextAlign('center')
          ctx.fillText('一起回望', CARD_W / 2, yy + 18)
          ctx.setTextAlign('left')
        }, 30)
        push((yy) => {
          ctx.setStrokeStyle(C.rule)
          ctx.setLineWidth(1)
          ctx.beginPath()
          ctx.moveTo(CARD_W / 2 - 18, yy + 4)
          ctx.lineTo(CARD_W / 2 + 18, yy + 4)
          ctx.stroke()
        }, 18)
        for (const para of m.paragraphs) {
          const lines = this.wrapText(ctx, para, 13, innerW)
          for (const line of lines) {
            push((yy) => {
              ruleAt(yy + 17)
              this.setFont(ctx, 13, { kai: true })
              ctx.setFillStyle(C.body)
              ctx.fillText(line, innerX, yy + 13)
            }, 13 * 2.0)
          }
          y += 6 // 段间距
        }
      } else if (this.layoutStyle === 'quote') {
        // 摘句版式（add-share-card-styles）：文字即主角——日期居中、金叶印（与完成一拍
        // 同一片压花叶）、正文放大居中、落款——「标题」。照片刻意不上卡。
        y += 4
        push((yy) => {
          this.setFont(ctx, 10)
          ctx.setFillStyle(C.muted)
          ctx.setTextAlign('center')
          ctx.fillText(m.date, CARD_W / 2, yy + 10)
          ctx.setTextAlign('left')
        }, 24)
        push((yy) => {
          drawLeaf(ctx, { x: CARD_W / 2 - 7, y: yy, scale: 0.34, angle: 0, stroke: C.gold })
        }, 40)
        for (const rawLine of m.lines) {
          const lines = this.wrapText(ctx, rawLine, 15, innerW - 8)
          for (const line of lines) {
            push((yy) => {
              ruleAt(yy + 20)
              this.setFont(ctx, 15, { kai: true })
              ctx.setFillStyle(C.body)
              ctx.setTextAlign('center')
              ctx.fillText(line, CARD_W / 2, yy + 15)
              ctx.setTextAlign('left')
            }, 15 * 2.1)
          }
          y += 3
        }
        y += 6
        const attrLines = this.wrapText(ctx, '——「' + m.title + '」', 11, innerW)
        for (const line of attrLines) {
          push((yy) => {
            this.setFont(ctx, 11, { kai: true })
            ctx.setFillStyle(C.muted)
            ctx.setTextAlign('center')
            ctx.fillText(line, CARD_W / 2, yy + 11)
            ctx.setTextAlign('left')
          }, 11 * 1.8)
        }
      } else {
        // 照片开窗版式（add-share-card-styles）：首图 cover 裁切满幅贴卡顶——开窗即取景框，
        // 标本页拼贴的"只缩不裁"不适用于此版式（用户看样机定稿的语义）。照片解析失败时
        // photoInfos 为空，photoWindow 自动为 false，回落到标本页流程。
        const photoWindow = this.layoutStyle === 'photo' && this.photoInfos.length > 0
        if (photoWindow) {
          const info = this.photoInfos[0]
          const winH = 150
          y = cardY // 贴卡顶，不留内边距
          push((yy) => {
            ctx.save()
            roundRectPath(ctx, cardX, yy, cardW, winH, 4)
            ctx.clip()
            const s = Math.max(cardW / info.width, winH / info.height)
            const dw = info.width * s
            const dh = info.height * s
            ctx.drawImage(info.img || info.path, cardX + (cardW - dw) / 2, yy + (winH - dh) / 2, dw, dh)
            ctx.restore()
          }, winH + 14)
        }
        // 照片区：纵向简单拼贴（2026-07-13 用户定版，宫格 cover 裁切废弃——形变/裁切都不可接受）。
        // 每张按原比例缩放到内容宽；过高的竖图整张缩小居中（PHOTO_MAX_H 上限），只缩不裁。
        const PHOTO_MAX_H = 300
        if (!photoWindow) {
          for (const info of this.photoInfos) {
            let dw = innerW
            let dh = Math.round((innerW * info.height) / info.width) || PHOTO_MAX_H
            if (dh > PHOTO_MAX_H) {
              dh = PHOTO_MAX_H
              dw = Math.round((PHOTO_MAX_H * info.width) / info.height)
            }
            const dx = innerX + (innerW - dw) / 2
            const blockH = dh
            push((yy) => {
              ctx.save()
              roundRectPath(ctx, dx, yy, dw, dh, 3)
              ctx.clip()
              ctx.drawImage(info.img || info.path, dx, yy, dw, dh)
              ctx.restore()
            }, blockH + 10)
          }
          if (this.photoInfos.length) y += 2 // 照片区与日期行的呼吸空隙（每张已带 10 间距）
        }
        push((yy) => {
          this.setFont(ctx, 10)
          ctx.setFillStyle(C.muted)
          ctx.fillText(m.date, innerX, yy + 10)
        }, 18)
        const titleLines = this.wrapText(ctx, m.title, 17, innerW)
        for (const line of titleLines) {
          push((yy) => {
            this.setFont(ctx, 17, { bold: true, kai: true })
            ctx.setFillStyle(C.ink)
            ctx.fillText(line, innerX, yy + 17)
          }, 17 * 1.45)
        }
        y += 6
        const textX = m.bullets ? innerX + 16 : innerX + 12
        const textW = innerW - (textX - innerX)
        const bodyTop = y
        for (const rawLine of m.lines) {
          const lines = this.wrapText(ctx, rawLine, 13, textW)
          const firstY = y
          for (const line of lines) {
            push((yy) => {
              ruleAt(yy + 17)
              this.setFont(ctx, 13, { kai: true })
              ctx.setFillStyle(C.body)
              ctx.fillText(line, textX, yy + 13)
            }, 13 * 1.9)
          }
          if (m.bullets && draw) {
            const dotY = firstY
            ops.push({
              fn: () => {
                ctx.setFillStyle(C.leaf)
                ctx.beginPath()
                ctx.arc(innerX + 4, dotY + 8, 3.2, 0, Math.PI * 2)
                ctx.fill()
              },
              y: dotY,
            })
          }
          if (m.bullets) y += 4
        }
        if (!m.bullets && draw) {
          const ruleTop = bodyTop
          const ruleBottom = y - 8
          ops.push({
            fn: () => {
              ctx.setStrokeStyle(C.rule)
              ctx.setLineWidth(2)
              ctx.beginPath()
              ctx.moveTo(innerX + 1, ruleTop + 2)
              ctx.lineTo(innerX + 1, ruleBottom)
              ctx.stroke()
            },
            y: ruleTop,
          })
        }
      }

      // -- 页脚：分隔线 + slogan + 太阳码 --
      y += 10
      const footTop = y
      const footH = 44
      y += footH
      const cardH = y - cardY + 4
      const total = cardY + cardH + DESK

      if (draw) {
        // 桌面 → 卡片阴影 → 纸面（纸样底色+图案）→ 正文指令 → 胶带。
        // 胶带在内容之后：照片开窗版式的首图顶到卡沿，胶带须压在照片上（物理隐喻本来如此）；
        // 其余版式内容与胶带区不重叠，层序调整无视觉差异。
        ctx.setFillStyle(C.desk)
        ctx.fillRect(0, 0, CARD_W, total)
        try {
          ctx.setShadow(0, 4, 14, C.shadow)
        } catch (e) { /* 阴影不可用就平铺 */ }
        const paperDef = PAPERS.find((p) => p.id === this.paper) || PAPERS[0]
        ctx.setFillStyle(paperDef.base)
        roundRectPath(ctx, cardX, cardY, cardW, cardH, 4)
        ctx.fill()
        try {
          ctx.setShadow(0, 0, 0, 'rgba(0,0,0,0)')
        } catch (e) { /* 同上 */ }
        this.paintPaperPattern(ctx, cardX, cardY, cardW, cardH)

        for (const op of ops) op.fn(op.y)

        // 纸胶带（顶端居中，略压卡沿）
        ctx.setFillStyle('rgba(214, 196, 150, 0.62)')
        ctx.fillRect(CARD_W / 2 - 40, cardY - 10, 80, 20)

        // 页脚
        ctx.setStrokeStyle(C.line)
        ctx.setLineWidth(1)
        ctx.beginPath()
        ctx.moveTo(innerX, footTop)
        ctx.lineTo(innerX + innerW, footTop)
        ctx.stroke()
        this.setFont(ctx, 10)
        ctx.setFillStyle(C.gold)
        ctx.fillText(m.slogan.split('').join(' '), innerX, footTop + 26)
        const codeCx = innerX + innerW - 17
        const codeCy = footTop + 24
        if (SUNCODE_IMAGE) {
          ctx.drawImage(this.suncodeImg || SUNCODE_IMAGE, codeCx - 15, codeCy - 15, 30, 30)
        } else {
          // 占位环：真码 PNG 落库前的降级（不发请求）
          ctx.setStrokeStyle(C.muted)
          ctx.setLineWidth(2)
          try {
            ctx.setLineDash([2, 3], 0)
          } catch (e) { /* 无虚线能力就实线 */ }
          ctx.beginPath()
          ctx.arc(codeCx, codeCy, 14, 0, Math.PI * 2)
          ctx.stroke()
          try {
            ctx.setLineDash([], 0)
          } catch (e) { /* 同上 */ }
          ctx.beginPath()
          ctx.arc(codeCx, codeCy, 6, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      return total
    },

    // ---- 纸样图案（信笺线除外：随正文逐行画）；全部裁剪在卡面圆角内，一次性绘制非动画路径 ----
    paintPaperPattern(ctx, cardX, cardY, cardW, cardH) {
      const p = this.paper
      if (p === 'ruled') return
      ctx.save()
      roundRectPath(ctx, cardX, cardY, cardW, cardH, 4)
      ctx.clip()
      if (p === 'rice') {
        ctx.setFillStyle('rgba(120, 100, 60, 0.07)')
        for (let yy = cardY + 3; yy < cardY + cardH; yy += 7) {
          for (let xx = cardX + 3; xx < cardX + cardW; xx += 7) ctx.fillRect(xx, yy, 1, 1)
        }
      } else if (p === 'moss') {
        ctx.setFillStyle('rgba(18, 71, 3, 0.11)')
        for (let yy = cardY + 8; yy < cardY + cardH; yy += 17) {
          for (let xx = cardX + 8; xx < cardX + cardW; xx += 17) {
            ctx.beginPath()
            ctx.arc(xx, yy, 1.2, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      } else if (p === 'leaf') {
        // 与完成一拍同一片压花叶，每 120px 瓦片两片、各倾斜 -24°/+31°（自然感=不排整齐）
        const stroke = 'rgba(18, 71, 3, 0.10)'
        for (let ty = cardY - 20; ty < cardY + cardH; ty += 120) {
          for (let tx = cardX - 20; tx < cardX + cardW; tx += 120) {
            drawLeaf(ctx, { x: tx + 14, y: ty + 12, scale: 0.56, angle: -24, stroke })
            drawLeaf(ctx, { x: tx + 86, y: ty + 58, scale: 0.56, angle: 31, stroke })
          }
        }
      } else if (p === 'wash') {
        // 两团极淡的径向晕：左上绿、右下金；端上没有渐变能力就保持素底（可接受的退化）
        this.radialFill(ctx, cardX + cardW * 0.08, cardY + 8, cardW * 1.05, 'rgba(18,71,3,0.075)', 'rgba(18,71,3,0)', cardX, cardY, cardW, cardH)
        this.radialFill(ctx, cardX + cardW, cardY + cardH, cardW, 'rgba(205,145,48,0.10)', 'rgba(205,145,48,0)', cardX, cardY, cardW, cardH)
      }
      ctx.restore()
    },

    // 径向渐变跨端：旧接口是 createCircularGradient(x,y,r)，2d 标准是 createRadialGradient
    radialFill(ctx, cx, cy, r, from, to, x, y, w, h) {
      let grad = null
      try {
        if (ctx.createCircularGradient) grad = ctx.createCircularGradient(cx, cy, r)
        else if (ctx.createRadialGradient) grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
      } catch (e) {
        grad = null
      }
      if (!grad || !grad.addColorStop) return
      grad.addColorStop(0, from)
      grad.addColorStop(1, to)
      ctx.setFillStyle(grad)
      ctx.fillRect(x, y, w, h)
    },

    // ---- 保存：canvas 导出 2 倍长图 → 相册（mp）/ 下载（H5 开发环境） ----
    save() {
      if (this.saving || this.drawing) return
      this.saving = true
      this.authDenied = false
      const onFail = (err) => {
        console.error('[share-card] export failed:', err)
        this.saving = false
        this.tip = '这一页没存上，等下再试试。'
      }
      // #ifdef MP-WEIXIN
      // 同层 2d canvas 导出传 node；像素尺寸即 node.width/height（渲染时已按 dpr 采样）。
      // 必须走 wx 原生接口：uni 封装层不透传 canvas 节点参数（报 "Cannot read property
      // 'width' of undefined"），2d canvas 导出是微信专属路径，直接原生调用。
      if (!this.canvasNode) return onFail(new Error('canvas node 缺失'))
      wx.canvasToTempFilePath({
        canvas: this.canvasNode,
        fileType: 'png',
        success: (res) => this.deliver(res.tempFilePath),
        fail: onFail,
      })
      // #endif
      // #ifndef MP-WEIXIN
      uni.canvasToTempFilePath(
        {
          canvasId: 'shareCardCanvas',
          width: this.cssW,
          height: this.cssH,
          destWidth: this.cssW * 2,
          destHeight: this.cssH * 2,
          fileType: 'png',
          success: (res) => this.deliver(res.tempFilePath),
          fail: onFail,
        },
        this
      )
      // #endif
    },

    deliver(filePath) {
      // #ifdef H5
      {
        const a = document.createElement('a')
        a.href = filePath
        a.download = '丰容手记.png'
        a.click()
        this.saving = false
        this.flashSaved()
        return
      }
      // #endif
      // #ifndef H5
      uni.saveImageToPhotosAlbum({
        filePath,
        success: () => {
          this.saving = false
          this.flashSaved()
        },
        fail: (err) => {
          this.saving = false
          const msg = (err && err.errMsg) || ''
          if (msg.includes('auth') || msg.includes('authorize') || msg.includes('privacy')) {
            // 授权被拒：温婉提示 + 去设置入口，不重复索权、不阻断关闭（design.md D4）
            this.authDenied = true
          } else if (!msg.includes('cancel')) {
            console.error('[share-card] save failed:', err)
            this.tip = '这一页没存上，等下再试试。'
          }
        },
      })
      // #endif
    },

    flashSaved() {
      // 存成功后保留"存好了"作为常驻态：此后按钮即"回去"（onSaveTap 走 close），
      // 不再自动回退为"存进相册"，避免误触重复保存。
      this.saved = true
      this.savedTip = '存好了'
    },

    openSetting() {
      uni.openSetting({
        success: () => {
          this.authDenied = false
        },
      })
    },
  },
}
</script>

<style>
.share-preview {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 140;
  display: flex;
  align-items: center;
  justify-content: center;
}

.share-preview__backdrop {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(8, 16, 6, 0.62);
  animation: fade-in 0.2s ease both;
}

.share-preview__body {
  position: relative;
  width: 100%;
  max-width: 700rpx;
  max-height: 92vh;
  padding: 24rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  animation: rise-in 0.28s var(--ease-out) both;
}

@media (prefers-reduced-motion: reduce) {
  .share-preview__backdrop,
  .share-preview__body {
    animation: fade-in 0.2s ease both;
  }
}

.share-preview__close {
  font-size: 28rpx;
  color: #e8eee4;
  padding: 16rpx 24rpx 16rpx 0;
}

.share-preview__stage {
  /* scroll-view 只有拿到"确定的像素高度"才会真正启用纵向滚动：flex:1、max-height、以及
     从 max-height:92vh 祖先推导的高度在 mp-weixin 上都不算确定高度，长图会照样撑破 body、
     把下面的"存进相册"顶出可视区且无法滚动。所以高度改由 JS 算好后经 :style 直接绑（见
     stageStyle）——短卡片正好等于画布高、不留空框；长图封顶到视口可用高度、超出在卡内滚。
     不用 display:flex（会削弱部分端 scroll-y），横向居中交给 canvas 自己的 margin:auto。 */
  flex: 0 0 auto;
  min-height: 0;
}

.share-preview__canvas {
  margin: 0 auto;
  border-radius: 8rpx;
  display: block;
}

.share-preview__toggle {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-top: 20rpx;
}

/* 纸样行：五个选项，字号与内距略收一档 */
.share-preview__toggle--papers {
  margin-top: 14rpx;
  gap: 12rpx;
}

.share-preview__toggle--papers .share-preview__toggle-opt {
  font-size: 22rpx;
  padding: 8rpx 18rpx;
}

.share-preview__toggle-opt {
  font-size: 24rpx;
  color: #c9d4c2;
  padding: 8rpx 24rpx;
  border-radius: 999rpx;
  border: 1rpx solid rgba(233, 238, 228, 0.35);
}

.share-preview__toggle-opt--on {
  color: #081006;
  background: #e8eee4;
  border-color: #e8eee4;
}

.share-preview__tip {
  margin-top: 16rpx;
  text-align: center;
  font-size: 22rpx;
  color: #c9d4c2;
  line-height: 1.7;
}

.share-preview__auth {
  margin-top: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
}

.share-preview__auth-text {
  font-size: 22rpx;
  color: #c9d4c2;
}

.share-preview__auth-btn {
  font-size: 22rpx;
  color: #e8eee4;
  border-bottom: 1rpx dashed rgba(233, 238, 228, 0.6);
  padding-bottom: 2rpx;
}

.share-preview__save {
  margin-top: 24rpx;
  align-self: center;
  min-width: 320rpx;
  text-align: center;
  padding: 22rpx 48rpx;
  border-radius: 999rpx;
  background: var(--c-primary);
  color: #f3f7f0;
  font-size: 28rpx;
  letter-spacing: 0.04em;
}

.share-preview__save--busy {
  opacity: 0.55;
}
</style>
