# LINE 繁體中文↔印尼文翻译机器人

在 LINE 上发送繁體中文自动翻译为印尼文，发送印尼文自动翻译为繁體中文。

## 架构

```
使用者 → LINE Bot → Render (Webhook) → OpenRouter API → 回传翻译结果
                                    ↑
                              UptimeRobot 每5分钟心跳
                              (防止 Render 休眠)
```

## 设置步骤

### 1. LINE Developers 创建 Messaging API

1. 登录 [LINE Developers](https://developers.line.biz/)
2. 创建 Provider → 创建 Messaging API Channel
3. 在「基本设置」页面获取：
   - **Channel Secret** → 你的 `CHANNEL_SECRET`
4. 在「Messaging API」页面获取：
   - **Channel access token**（长期）→ 你的 `CHANNEL_ACCESS_TOKEN`
5. 关闭「Auto-reply messages」（自动回复消息设为关）
6. 设置 Webhook URL（部署 Render 后填入）：
   `https://line-translate-bot-1-dumk.onrender.com/webhook`
7. 开启「Use webhook」→ 关闭「Greeting messages」

### 2. OpenRouter 获取 API Key

1. 注册 [OpenRouter](https://openrouter.ai/)
2. 进入 [Keys](https://openrouter.ai/keys) 创建 API Key
3. OpenRouter 提供多种模型，免费额度充足：
   - `google/gemini-2.0-flash-001`（推荐，便宜快速）
   - `openai/gpt-4o-mini`
   - `anthropic/claude-3-haiku`
4. 复制 API Key → 你的 `OPENROUTER_API_KEY`

### 3. 部署到 Render

1. 在 GitHub 创建仓库并上传此项目代码
2. 登录 [Render](https://render.com/)
3. New → Web Service → 连接 GitHub 仓库
4. 设置环境变量（Settings → Environment）：
   ```
   CHANNEL_ACCESS_TOKEN = <你的LINE Channel Access Token>
   CHANNEL_SECRET       = <你的LINE Channel Secret>
   OPENROUTER_API_KEY   = <你的OpenRouter API Key>
   OPENROUTER_MODEL     = google/gemini-2.0-flash-001
   ```
5. Render 会自动 `npm install && node index.js`
6. 部署完成后复制 Render URL（如 `https://line-translate-bot.onrender.com`）

### 4. LINE 设置 Webhook URL

回到 LINE Developers → Messaging API → Webhook URL 填入：

```
https://line-translate-bot.onrender.com/webhook
```

点击 Verify → 显示「Connection successful」即可。

### 5. UptimeRobot 防止 Render 休眠

Render 免费版 15 分钟无请求会休眠，用 UptimeRobot 每 5 分钟心跳保持活跃：

1. 注册 [UptimeRobot](https://uptimerobot.com/)
2. New Monitor → Monitor Type: **HTTP(s)**
3. 填入：
   - Friendly Name: `LINE Translate Bot`
   - URL: `https://line-translate-bot.onrender.com/`
   - Monitoring Interval: **5 minutes**
4. Create Monitor

### 6. 本地开发（可选）

```bash
cp .env.example .env
# 编辑 .env 填入真实的密钥
npm install
npm run dev
```

测试 Webhook 可用 [ngrok](https://ngrok.com/)：

```bash
ngrok http 3000
# 将 ngrok URL + /webhook 填入 LINE Webhook URL
```

## 翻译场景

本机器人专为**家人与外劳沟通照顾阿嬤**的日常对话设计，翻译原则：

- **自然亲切** — 使用日常口语，不机械、不生硬
- **精确明确** — 医疗、看护、饮食等专有名词准确无误
- **温暖友好** — 带有关怀的语气，像是家人之间的对话
- **保留专有名词** — 人名、地名、药名、病名、日期、时间、数字、食物名称保留原样

### 温度设置

`OPENROUTER_TEMPERATURE` 控制翻译的自然程度：

| 值 | 效果 | 适用场景 |
|---|---|---|
| 0.1–0.3 | 精确稳定 | 医疗看护用药 |
| 0.3–0.5 | 平衡推荐 | 日常对话 |
| 0.5–0.8 | 自然灵活 | 闲聊情感 |

## 测试

| 发送内容 | 自动识别语言 | 返回翻译 |
|---|---|---|
| `你好` | 繁體中文 → 印尼文 | 印尼文：`Halo` |
| `Selamat pagi` | 印尼文 → 繁體中文 | 繁體中文：`早上好` |
| `今天天气怎么样` | 繁體中文 → 印尼文 | 印尼文：`Bagaimana cuaca hari ini` |
| `Terima kasih banyak` | 印尼文 → 繁體中文 | 繁體中文：`非常高興` |

| 发送内容                | 自动识别语言 | 返回翻译                             |
| ----------------------- | ------------ | ------------------------------------ |
| `你好`                | 中文 →      | 印尼文：`Halo`                     |
| `Selamat pagi`        | 印尼文 →    | 中文：`早上好`                     |
| `今天天气怎么样`      | 中文 →      | 印尼文：`Bagaimana cuaca hari ini` |
| `Terima kasih banyak` | 印尼文 →    | 中文：`非常感谢`                   |

## 费用说明

| 服务               | 费用                      |
| ------------------ | ------------------------- |
| LINE Messaging API | 免费                      |
| OpenRouter         | 极低（每次翻译 < $0.001） |
| Render Free        | 免费                      |
| UptimeRobot Free   | 免费                      |
| **总计**     | **约等于免费**      |
