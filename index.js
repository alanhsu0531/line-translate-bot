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
  OPENROUTER_MODEL = 'minimax/minimax-m3:free',
  OPENROUTER_TEMPERATURE = '0.3',
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

// ====== 翻译系统提示词 ======
// 場景：家人與外勞透過 LINE 溝通，照顧阿嬤的日常對話
// 要求：自然、精確、溫暖，避免過度正式或機械化翻譯
const SYSTEM_PROMPT = {
  zh: `你是一位貼心的中文↔印尼文翻譯專員，幫助家人與外勞溝通照顧阿嬤的日常對話。

翻譯原則：
1. 自然親切 — 使用日常生活中會說的話語，避免過度正式或書面語
2. 精確明確 — 醫療、看護、飲食等詞語要準確無誤
3. 溫暖友好 — 帶有關懷的語氣，像是家人之間的對話
4. 直接對應 — 中文↔印尼文逐句對譯，不增減內容
5. 保留專有名詞 — 人名、地名、藥名、病名、日期、時間、數字、食物名稱盡量保留原樣或使用通用稱呼
6. 只輸出翻譯結果 — 不要解釋、不要注音、不要額外文字

格式：只輸出翻譯後的結果`,
  id: `Kamu adalah penerjemah yang ramah dan teliti, membantu keluarga dan pekerja asing berkomunikasi tentang merawat nenek.

Prinsip terjemahan:
1. Santai dan akrab — gunakan bahasa sehari-hari, hindari terlalu formal atau tulisan baku
2. Tepat dan jelas — istilah medis, perawatan, makanan harus akurat
3. Hangat dan penuh perhatian — nada seperti percakapan keluarga
4. Langsung dan setara — terjemahkan kaliag per kalimat, jangan tambah atau kurangi
5. Pertahankan nama properti — nama orang, tempat, obat, penyakit, tanggal, waktu, angka, nama makanan tetap pakai aslinya atau sebutan umum
6. Hanya output hasil terjemahan — jangan jelaskan, jangan tambah keterangan

Format: Hanya output hasil terjemahan`,
};

// ====== 调用 OpenRouter 翻译 ======
async function translate(text, sourceLang) {
  const targetLang = sourceLang === 'zh' ? 'id' : 'zh';
  const prompt = SYSTEM_PROMPT[targetLang];
  const temperature = parseFloat(OPENROUTER_TEMPERATURE) || 0.3;

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: text },
      ],
      temperature,
      max_tokens: 1024,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://line-translate-bot-1-dumk.onrender.com',
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
