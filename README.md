# AI 订单对话助手

这是一个适合展示的 AI 业务场景 Demo，模拟销售、客服、运营使用自然语言查询订单、识别异常、生成跟进建议和客户回复话术。

## 项目特点

- 有网页交互界面
- 支持多轮连续对话
- 支持订单筛选、汇总、异常分析
- 接入 DeepSeek API
- 未配置 API Key 时也能走本地兜底逻辑

## 技术栈

- HTML / CSS / JavaScript
- Node.js
- 本地 JSON 模拟订单数据
- DeepSeek Chat API

## 本地运行

### 方式一：直接双击

- `start.cmd`
- `start.ps1`

### 方式二：命令行启动

```powershell
cd "D:\AI咸鱼想法\ai-order-demo"
& "C:\Users\Administrator\AppData\Local\OpenAI\Codex\bin\node.exe" .\server.js
```

打开：

[http://localhost:3000](http://localhost:3000)

## DeepSeek 配置

在项目根目录新建 `.env`：

```env
DEEPSEEK_API_KEY=your_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
PORT=3000
```

## Render 部署

本项目已包含：

- `package.json`
- `render.yaml`
- `.gitignore`

部署时需要在 Render 后台配置环境变量：

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`

其中 `DEEPSEEK_API_KEY` 必填。

## 项目说明

当前版本使用本地模拟订单数据，重点展示：

- AI 和业务数据结合
- 多轮对话
- 订单分析
- 客户沟通建议生成

它不是一个真实数据库系统，而是一个面向真实业务场景的 AI Demo。
