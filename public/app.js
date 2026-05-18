const state = {
  history: [],
  lastOrders: []
};

const questionInput = document.querySelector("#questionInput");
const askBtn = document.querySelector("#askBtn");
const reloadBtn = document.querySelector("#reloadBtn");
const newChatBtn = document.querySelector("#newChatBtn");
const chatList = document.querySelector("#chatList");
const orderList = document.querySelector("#orderList");
const resultCount = document.querySelector("#resultCount");
const resultMode = document.querySelector("#resultMode");
const apiStatus = document.querySelector("#apiStatus");
const summaryBox = document.querySelector("#summaryBox");
const orderTemplate = document.querySelector("#orderItemTemplate");
const chatTemplate = document.querySelector("#chatMessageTemplate");

document.querySelectorAll(".prompt-chip").forEach((button) => {
  button.addEventListener("click", () => {
    questionInput.value = button.dataset.prompt || "";
    runQuery();
  });
});

askBtn.addEventListener("click", runQuery);
reloadBtn.addEventListener("click", loadHealth);
newChatBtn.addEventListener("click", resetChat);
questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    runQuery();
  }
});

loadHealth();
resetChat();

async function loadHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    apiStatus.textContent = data.hasApiKey
      ? `已连接 DeepSeek（${data.model}），支持真实连续对话。`
      : "未配置 DeepSeek Key，当前使用本地规则分析。";
  } catch (error) {
    apiStatus.textContent = "服务连接失败，请确认本地服务已经启动。";
  }
}

function resetChat() {
  state.history = [];
  state.lastOrders = [];
  chatList.innerHTML = "";
  resultMode.textContent = "新对话";
  renderSummary({ total: 0, totalAmount: 0, highPriority: 0 });
  renderOrders([]);
  addMessage("assistant", [
    "你好，我是你的 AI 订单对话助手。",
    "",
    "你可以直接问我：",
    "- 哪些订单今天需要重点跟进？",
    "- 苏州智源科技为什么异常？",
    "- 帮我写一段发给客户的回复话术。"
  ].join("\n"));
  questionInput.value = "帮我找出所有异常预警和待发货订单，并告诉我优先跟进哪几笔。";
}

async function runQuery() {
  const question = questionInput.value.trim();
  if (!question) {
    questionInput.focus();
    return;
  }

  addMessage("user", question);
  state.history.push({ role: "user", content: question });
  questionInput.value = "";
  askBtn.disabled = true;
  askBtn.textContent = "发送中...";
  resultMode.textContent = "分析中";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question,
        history: state.history
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "查询失败");
    }

    state.history.push({ role: "assistant", content: data.answer });
    state.lastOrders = data.orders || [];
    addMessage("assistant", data.answer);
    renderSummary(data.summary);
    renderOrders(data.orders || []);
    resultMode.textContent = data.mode === "deepseek" ? "DeepSeek 对话" : "本地分析";
  } catch (error) {
    addMessage("assistant", `这次查询失败了：${error.message}`);
    resultMode.textContent = "失败";
  } finally {
    askBtn.disabled = false;
    askBtn.textContent = "发送";
  }
}

function addMessage(role, content) {
  const fragment = chatTemplate.content.cloneNode(true);
  const root = fragment.querySelector(".chat-message");
  root.dataset.role = role;
  fragment.querySelector(".chat-role").textContent = role === "user" ? "我" : "AI";
  fragment.querySelector(".chat-bubble").textContent = content;
  chatList.appendChild(fragment);
  chatList.scrollTop = chatList.scrollHeight;
}

function renderSummary(summary) {
  summaryBox.innerHTML = [
    `命中订单：${summary.total || 0}`,
    `订单金额：${Number(summary.totalAmount || 0).toLocaleString()} 元`,
    `高优先级：${summary.highPriority || 0}`
  ].map((item) => `<div>${item}</div>`).join("");
}

function renderOrders(orders) {
  orderList.innerHTML = "";
  resultCount.textContent = `${orders.length} 条`;

  if (!orders.length) {
    const empty = document.createElement("div");
    empty.className = "answer-box empty-state";
    empty.style.minHeight = "180px";
    empty.textContent = "当前没有命中订单，继续换个角度问我也可以。";
    orderList.appendChild(empty);
    return;
  }

  orders.forEach((order) => {
    const fragment = orderTemplate.content.cloneNode(true);
    fragment.querySelector(".order-id").textContent = order.id;
    fragment.querySelector(".order-customer").textContent = `${order.customerName} | ${order.productName}`;
    const badge = fragment.querySelector(".status-badge");
    badge.textContent = order.status;
    badge.dataset.status = order.status;
    fragment.querySelector(".order-meta").innerHTML = [
      `负责人：${order.salesOwner}`,
      `数量：${order.quantity} | 金额：${order.amount.toLocaleString()} 元`,
      `优先级：${order.priority} | 交期：${order.deliveryDate}`,
      `来源：${order.source} | 更新时间：${order.updatedAt}`
    ].map((item) => `<div>${item}</div>`).join("");
    fragment.querySelector(".order-remark").textContent = order.remark;

    const timeline = fragment.querySelector(".timeline");
    order.timeline.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      timeline.appendChild(li);
    });

    orderList.appendChild(fragment);
  });
}
