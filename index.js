require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ====== 环境变量 ======
const {
  CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET,
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL = 'google/gemini-2.0-flash-001',
  PORT = 3000,
} = process.env;

// ====== LINE Signature 验证 ======
function verifySignature(req) {
  const body = JSON.stringify(req.body);
  const signature = crypto
    .createHmac('SHA256', CHANNEL_SECRET)
    .update(body)
    .digest('base64');
  return req.headers['x-line-signature'] === signature;
}

// ====== 调用 OpenRouter 翻译 ======
async function translate(text, targetLang) {
  const langHint = targetLang === 'id'
    ? '将以下中文翻译成印尼文（Bahasa Indonesia），只输出翻译结果，不要解释。'
    : '将以下印尼文翻译成中文，只输出翻译结果，不要解释。';

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: langHint },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://line-translate-bot.onrender.com',
        'X-Title': 'LINE Translate Bot',
      },
    }
  );

  return response.data.choices[0].message.content.trim();
}

// ====== 语言检测（简单启发式） ======
function detectLanguage(text) {
  // 印尼文特征词
  const idKeywords = [
    'yang', 'dan', 'ini', 'itu', 'untuk', 'dengan', 'pada', 'dari',
    'adalah', 'akan', 'juga', 'saya', 'kamu', 'dia', 'mereka', 'kami',
    'tidak', 'bisa', 'mau', 'sudah', 'belum', 'lagi', 'sedang',
    'bagus', 'baik', 'terima', 'kasih', 'selamat', 'apa', 'siapa',
    'kenapa', 'bagaimana', 'kapan', 'dimana', 'ada', 'bukan',
    'halo', 'hai', 'terserah', 'gak', 'dong', 'sih', 'nih',
    'memang', 'tentu', 'tentunya', 'pasti', 'mungkin', 'hanya',
    'seperti', 'kalau', 'karena', 'jika', 'atau', 'tapi', 'namun',
    'sangat', 'sekali', 'lebih', 'paling', 'agak', 'cukup',
  ];

  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/);

  let idScore = 0;
  for (const word of words) {
    if (idKeywords.includes(word)) idScore++;
  }

  // 印尼文拉丁字母为主 + 命中关键词多 → 印尼文
  const hasLatinChars = /^[a-zA-Z\s\d.,!?]+$/.test(lower);
  const ratio = words.length > 0 ? idScore / words.length : 0;

  if (hasLatinChars && ratio > 0.15) return 'id';
  if (hasLatinChars && idScore >= 2) return 'id';

  // 默认为中文
  return 'zh';
}

// ====== 发送 LINE 回复消息 ======
async function replyMessage(replyToken, text) {
  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    {
      replyToken,
      messages: [{ type: 'text', text }],
    },
    {
      headers: {
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

// ====== Webhook 路由 ======
app.post('/webhook', async (req, res) => {
  // 验证签名
  if (!verifySignature(req)) {
    console.error('Signature verification failed');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  // LINE 要求 1 秒内回应，先返回 200
  res.status(200).json({ message: 'OK' });

  // 异步处理消息
  for (const event of req.body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userText = event.message.text;
    const replyToken = event.replyToken;

    try {
      const detected = detectLanguage(userText);
      const targetLang = detected === 'zh' ? 'id' : 'zh';
      const translated = await translate(userText, targetLang);
      await replyMessage(replyToken, translated);
    } catch (err) {
      console.error('Translation error:', err.message);
      try {
        await replyMessage(replyToken, '❌ 翻译出错，请稍后再试。\nTerjemahan error, coba lagi nanti。');
      } catch (e) {
        console.error('Reply error:', e.message);
      }
    }
  }
});

// ====== 健康检查 + UptimeRobot 心跳 ======
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'LINE Chinese ↔ Indonesian Translate Bot',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// ====== 启动服务器 ======
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Webhook URL: https://<your-render-url>/webhook`);
});
