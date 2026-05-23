import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');
const sharesPath = path.join(__dirname, '..', 'shares');

// Ensure shares directory exists
if (!fs.existsSync(sharesPath)) {
  fs.mkdirSync(sharesPath, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());

// Serve built frontend
app.use(express.static(distPath));

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

function extractJsonArray(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || start >= end) {
    throw new Error('No JSON array found in response');
  }
  return text.slice(start, end + 1);
}

app.post('/api/associate', async (req, res) => {
  const { word } = req.body;
  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'word is required' });
  }

  const systemPrompt = '你是一个创意联想助手，擅长从一个词出发，沿着具体的方向（工具、场景、人物、风格、趋势等）找到生动且强相关的联想词。你的联想让人感觉"妙啊，确实是这样"，而不是"这有什么关系？"。你只返回JSON数组，不返回其他内容。';

  const userPrompt = `用户输入了"${word}"，请围绕它联想8个词。

核心原则：每个词必须和"${word}"强相关。联想可以巧妙、有趣，但不能牵强——如果别人看到这个词，应该能立刻明白"为什么从${word}想到了它"。

联想方向建议（每个方向挑一两个即可，不用全部覆盖）：
- 工具/设备：${word}常用什么工具
- 场景/空间：${word}在什么环境下工作或出现
- 上下游：${word}的上游输入或下游产出是什么
- 风格/流派：${word}领域内有什么分支或风格
- 代表人物/品牌：行业内公认的名字
- 痛点/需求：${word}面临什么困扰或用户需要什么
- 搭配/组合：${word}常和什么一起出现
- 趋势/新事物：${word}领域最近有什么新变化

要求：
1. 每个联想词必须是和"${word}"直接相关的具体事物，不能是抽象概念
2. 优先选生动、有画面感的词，让人能"看到"它
3. 网感可以有，但不能为了网感牺牲相关性
4. 每个词包含 zh 和 en，严格按JSON数组返回，不要其他文字`;

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('DeepSeek API error:', response.status, errText);
      return res.status(502).json({ error: 'DeepSeek API error', detail: errText });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonStr = extractJsonArray(content);
    const words = JSON.parse(jsonStr);

    if (!Array.isArray(words) || words.length === 0) {
      return res.status(502).json({ error: 'Invalid response format from DeepSeek' });
    }

    res.json({ words: words.slice(0, 8) });
  } catch (err) {
    console.error('Associate error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pain-points', async (req, res) => {
  const { word } = req.body;
  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'word is required' });
  }

  const systemPrompt = '你是一个用户体验研究助手，擅长从用户视角发现一个事物或场景中的痛点、爽点和高频使用场景。你只返回JSON数组，不返回其他内容。';

  const userPrompt = `用户输入了"${word}"，请从用户体验角度进行分析。返回6个条目：

- 2个痛点（type: "pain"）：用户最常遇到的困扰、不便、负面体验
- 2个爽点（type: "pleasure"）：用户感到愉悦、满足、上瘾的体验
- 2个高频场景（type: "scenario"）：用户最常使用"${word}"的具体情境

要求：
1. 每个条目必须具体、生动，让人产生共鸣
2. 痛点要真实，爽点要具体，场景要鲜活
3. 每个条目包含 zh（中文短语）、en（英文短语）、type（pain/pleasure/scenario）三个字段
4. 严格按JSON数组返回：[{"zh": "...", "en": "...", "type": "pain"}, ...]`;

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('DeepSeek API error:', response.status, errText);
      return res.status(502).json({ error: 'DeepSeek API error', detail: errText });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonStr = extractJsonArray(content);
    const words = JSON.parse(jsonStr);

    if (!Array.isArray(words) || words.length === 0) {
      return res.status(502).json({ error: 'Invalid response format from DeepSeek' });
    }

    res.json({ words: words.slice(0, 6) });
  } catch (err) {
    console.error('Pain-points error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;

app.post('/api/scenario', async (req, res) => {
  const { word } = req.body;
  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'word is required' });
  }

  const systemPrompt = '你是一个场景分析专家，擅长从一个词出发挖掘用户使用/接触该事物的真实场景。你只返回JSON数组，不返回其他内容。';

  const userPrompt = `用户输入了"${word}"，请判断这个词属于什么类型，然后根据类型发散5个强相关的真实使用场景：

分类逻辑：
- 产品/实物类（如香薰、耳机、水杯）：发散使用地点、使用时机、使用人群场景
- 职业/角色类（如设计师、程序员、运营）：发散工作场景、任务场景、职业日常场景
- 情绪/状态/行为类（如焦虑、失眠、健身）：发散发生场景、触发环境、高频场景
- 服务/平台类（如外卖、短视频、办公软件）：发散使用时机、用户场景、需求场景

要求：
1. 每个场景必须具体生动、有画面感，让人能"身临其境"
2. 优先选择高频、真实的场景，避免牵强附会
3. 每个条目包含 zh（中文短语，6-10字为宜）、en（英文短语）两个字段
4. 严格按JSON数组返回：[{"zh": "...", "en": "..."}, ...]`;

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('DeepSeek API error:', response.status, errText);
      return res.status(502).json({ error: 'DeepSeek API error', detail: errText });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonStr = extractJsonArray(content);
    const words = JSON.parse(jsonStr);

    if (!Array.isArray(words) || words.length === 0) {
      return res.status(502).json({ error: 'Invalid response format from DeepSeek' });
    }

    res.json({ words: words.slice(0, 5) });
  } catch (err) {
    console.error('Scenario error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/solution', async (req, res) => {
  const { word } = req.body;
  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'word is required' });
  }

  const systemPrompt = '你是一个问题解决专家，擅长针对具体痛点提出可落地的解决方案。你只返回JSON数组，不返回其他内容。';

  const userPrompt = `用户遇到了一个痛点："${word}"。请针对这个痛点，提供5个具体可落地的解决方案。

要求：
1. 每个方案必须具体、可操作，不能是空泛的建议
2. 优先提供低成本、高效果的方案
3. 方案之间尽量覆盖不同的解决角度（产品设计、用户行为、服务流程等）
4. 每个条目包含 zh（中文短语）、en（英文短语）两个字段
5. 严格按JSON数组返回：[{"zh": "...", "en": "..."}, ...]`;

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('DeepSeek API error:', response.status, errText);
      return res.status(502).json({ error: 'DeepSeek API error', detail: errText });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonStr = extractJsonArray(content);
    const words = JSON.parse(jsonStr);

    if (!Array.isArray(words) || words.length === 0) {
      return res.status(502).json({ error: 'Invalid response format from DeepSeek' });
    }

    res.json({ words: words.slice(0, 5) });
  } catch (err) {
    console.error('Solution error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Share endpoints
app.post('/api/share', (req, res) => {
  const { graphState, projectName } = req.body;
  if (!graphState) {
    return res.status(400).json({ error: 'graphState is required' });
  }
  try {
    const shareId = crypto.randomBytes(8).toString('hex');
    const data = {
      graphState,
      projectName: projectName || '未命名项目',
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(sharesPath, `${shareId}.json`), JSON.stringify(data));
    res.json({ shareId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/share/:id', (req, res) => {
  try {
    const filePath = path.join(sharesPath, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Share not found' });
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/view/:id', (req, res) => {
  res.sendFile(path.join(distPath, 'view.html'));
});

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Creative Muse server running on http://localhost:${PORT}`);
});
