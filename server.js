const http = require("http");
const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const dataFile = path.join(rootDir, "data", "orders.json");
const envFile = path.join(rootDir, ".env");

const env = loadEnv(envFile);
const port = Number(process.env.PORT || env.PORT || 3000);
const deepseekBaseUrl = (process.env.DEEPSEEK_BASE_URL || env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
const deepseekModel = process.env.DEEPSEEK_MODEL || env.DEEPSEEK_MODEL || "deepseek-chat";
const deepseekApiKey = process.env.DEEPSEEK_API_KEY || env.DEEPSEEK_API_KEY || "";
const orders = JSON.parse(fs.readFileSync(dataFile, "utf8"));

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      return sendEmpty(res, 204);
    }

    if (req.method === "GET" && req.url === "/api/health") {
      return sendJson(res, 200, {
        ok: true,
        hasApiKey: Boolean(deepseekApiKey),
        model: deepseekModel
      });
    }

    if (req.method === "POST" && (req.url === "/api/chat" || req.url === "/api/query")) {
      const body = await readJson(req);
      const question = String(body.question || "").trim();
      const history = Array.isArray(body.history) ? body.history : [];

      if (!question) {
        return sendJson(res, 400, { error: "question is required" });
      }

      const matchedOrders = findOrders(question, orders, history);
      const summary = buildSummary(matchedOrders);

      let mode = "local";
      let answer = buildLocalChatAnswer(question, matchedOrders, summary, history);

      if (deepseekApiKey) {
        try {
          answer = await askDeepSeek(question, matchedOrders, summary, history);
          mode = "deepseek";
        } catch (error) {
          answer = `${buildLocalChatAnswer(question, matchedOrders, summary, history)}\n\n提示：DeepSeek 调用失败，已切回本地分析。原因：${error.message}`;
        }
      }

      return sendJson(res, 200, {
        mode,
        summary,
        orders: matchedOrders,
        answer
      });
    }

    if (req.method === "GET") {
      return serveStatic(req, res);
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(port, () => {
  console.log(`AI order demo running at http://localhost:${port}`);
});

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const result = {};
  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const index = trimmed.indexOf("=");
    if (index <= 0) {
      return;
    }
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    result[key] = value;
  });
  return result;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function sendEmpty(res, statusCode) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  res.end();
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  res.end(JSON.stringify(data));
}

function serveStatic(req, res) {
  const cleanUrl = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(publicDir, cleanUrl);

  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const typeMap = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  };

  res.writeHead(200, {
    "Content-Type": typeMap[ext] || "application/octet-stream"
  });
  fs.createReadStream(filePath).pipe(res);
}

function findOrders(question, allOrders, history) {
  const historyText = history.slice(-6).map((item) => String(item.content || "")).join(" ");
  const q = `${question} ${historyText}`.toLowerCase();

  let filtered = allOrders.filter((order) => {
    const source = [
      order.id,
      order.customerName,
      order.productName,
      order.status,
      order.priority,
      order.salesOwner,
      order.remark,
      order.source
    ].join(" ").toLowerCase();
    return source.includes(q);
  });

  const rules = [
    { keywords: ["异常"], pick: (item) => item.status === "异常预警" },
    { keywords: ["待发货", "发货"], pick: (item) => item.status === "待发货" },
    { keywords: ["待付款", "付款"], pick: (item) => item.status === "待付款" },
    { keywords: ["生产"], pick: (item) => item.status === "生产中" },
    { keywords: ["取消"], pick: (item) => item.status === "已取消" },
    { keywords: ["签收"], pick: (item) => item.status === "已签收" },
    { keywords: ["高优先级", "重点", "优先"], pick: (item) => item.priority === "高" },
    { keywords: ["今天", "跟进"], pick: (item) => item.priority === "高" || item.status === "异常预警" || item.status === "待发货" }
  ];

  rules.forEach((rule) => {
    if (rule.keywords.some((item) => q.includes(item))) {
      filtered = mergeFiltered(filtered, allOrders.filter(rule.pick));
    }
  });

  allOrders.forEach((order) => {
    if (
      q.includes(order.salesOwner.toLowerCase()) ||
      q.includes(order.customerName.toLowerCase()) ||
      q.includes(order.productName.toLowerCase())
    ) {
      filtered = mergeFiltered(filtered, [order]);
    }
  });

  if (!filtered.length) {
    filtered = allOrders
      .slice()
      .sort((a, b) => scoreOrder(q, b) - scoreOrder(q, a))
      .slice(0, 4);
  }

  return filtered.slice().sort((a, b) => scoreOrder(q, b) - scoreOrder(q, a));
}

function mergeFiltered(base, extra) {
  const map = new Map(base.map((item) => [item.id, item]));
  extra.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

function scoreOrder(question, order) {
  let score = 0;
  if (question.includes(order.customerName.toLowerCase())) score += 10;
  if (question.includes(order.salesOwner.toLowerCase())) score += 8;
  if (question.includes(order.status.toLowerCase())) score += 8;
  if (question.includes(order.productName.toLowerCase())) score += 6;
  if (order.priority === "高") score += 4;
  if (order.status === "异常预警") score += 5;
  if (order.status === "待发货") score += 3;
  return score;
}

function buildSummary(matchedOrders) {
  return matchedOrders.reduce((acc, order) => {
    acc.total += 1;
    acc.totalAmount += Number(order.amount || 0);
    if (order.priority === "高") acc.highPriority += 1;
    acc.statusMap[order.status] = (acc.statusMap[order.status] || 0) + 1;
    return acc;
  }, {
    total: 0,
    totalAmount: 0,
    highPriority: 0,
    statusMap: {}
  });
}

function buildLocalChatAnswer(question, matchedOrders, summary, history) {
  if (!matchedOrders.length) {
    return `我暂时没有找到和“${question}”直接相关的订单。你可以换成客户名、负责人、订单号或状态继续问我。`;
  }

  const opening = history.length
    ? "结合你刚刚的追问，我继续往下看。"
    : "我先根据当前订单数据给你一个结论。";

  const topOrders = matchedOrders.slice(0, 3).map((order, index) =>
    `${index + 1}. ${order.id} | ${order.customerName} | ${order.status} | 金额 ${order.amount.toLocaleString()} 元 | 负责人 ${order.salesOwner}`
  );

  const risks = matchedOrders
    .filter((order) => ["异常预警", "待付款", "待发货"].includes(order.status))
    .map((order) => `- ${order.id}：${order.remark}`);

  const actions = matchedOrders.slice(0, 3).map((order) => {
    if (order.status === "异常预警") {
      return `优先联系 ${order.salesOwner} 和采购，推进 ${order.customerName} 的缺料处理，并准备对客户的解释口径。`;
    }
    if (order.status === "待发货") {
      return `联系仓库确认 ${order.id} 的最终发货时间，然后主动通知客户。`;
    }
    if (order.status === "待付款") {
      return "提醒销售跟进合同审批和首付款，避免影响排产。";
    }
    return `持续跟进 ${order.id} 当前节点，围绕交期 ${order.deliveryDate} 做回访。`;
  });

  return [
    opening,
    "",
    `你的问题是：${question}`,
    "",
    "当前最值得关注的订单：",
    ...topOrders,
    "",
    `本次共匹配 ${summary.total} 条订单，累计金额 ${summary.totalAmount.toLocaleString()} 元，其中高优先级 ${summary.highPriority} 条。`,
    "",
    "风险提示：",
    ...(risks.length ? risks : ["- 当前匹配订单没有明显异常，可以重点关注交期承诺。"]),
    "",
    "建议动作：",
    ...actions.map((item) => `- ${item}`),
    "",
    "你可以继续追问我，比如：",
    "- 哪两笔最需要今天先处理？",
    "- 帮我生成给客户的回复话术。",
    "- 这几笔订单的共同风险是什么？"
  ].join("\n");
}

async function askDeepSeek(question, matchedOrders, summary, history) {
  const messages = [
    {
      role: "system",
      content: [
        "你是企业订单运营助手，擅长订单履约、销售跟进、交期风险识别。",
        "请用中文回答，风格简洁、专业、适合销售或客服直接查看。",
        "如果用户在追问，需要结合最近对话继续回答。",
        "不要编造订单数据，只能基于给定订单。"
      ].join("\n")
    }
  ];

  history.slice(-6).forEach((item) => {
    if (!item || !item.role || !item.content) {
      return;
    }
    messages.push({
      role: item.role === "assistant" ? "assistant" : "user",
      content: String(item.content)
    });
  });

  const prompt = [
    `用户问题：${question}`,
    `汇总数据：${JSON.stringify(summary, null, 2)}`,
    `订单数据：${JSON.stringify(matchedOrders, null, 2)}`,
    "请按这个结构输出：",
    "1. 结论",
    "2. 风险",
    "3. 建议动作",
    "4. 如适合，补一句可直接发给客户的话术"
  ].join("\n");

  messages.push({
    role: "user",
    content: prompt
  });

  const response = await fetch(`${deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${deepseekApiKey}`
    },
    body: JSON.stringify({
      model: deepseekModel,
      temperature: 0.3,
      messages
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "DeepSeek 未返回有效内容。";
}
