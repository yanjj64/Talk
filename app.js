const $ = (id) => document.getElementById(id);

const state = {
  mode: localStorage.getItem("mode") || "general",
  apiBase: localStorage.getItem("apiBase") || "",
  voice: localStorage.getItem("voice") || "female",
  languageStyle: localStorage.getItem("languageStyle") || "bilingual",
  recognizing: false,
  audioContext: null,
  analyser: null,
  dataArray: null,
  recognition: null,
};

const modeNames = {
  general: "综合",
  grammar: "语法",
  vocab: "单词",
  reading: "阅读",
  writing: "作文",
};

function setStatus(text) { $("statusText").textContent = text; }
function setLive(text) { $("liveText").textContent = text || ""; }

function addBubble(role, text) {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  $("chatLog").appendChild(div);
  div.scrollIntoView({ behavior: "smooth", block: "end" });
}

function currentChatUrl() {
  const base = state.apiBase.trim().replace(/\/$/, "");
  if (!base) return "";
  if (base.endsWith("/chat")) return base;
  return `${base}/chat`;
}

async function callChat(message) {
  const url = currentChatUrl();
  if (!url) throw new Error("请先在设置中填写云函数 Chat 地址。可先用本地 mock 或部署 cloud-functions/chat。 ");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      mode: state.mode,
      languageStyle: state.languageStyle,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败：${res.status}`);
  return data.reply || data.message || "没有收到回复。";
}

function pickBrowserVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const zhOrEn = voices.filter(v => /zh|en/i.test(v.lang));
  const preferred = zhOrEn.find(v => state.voice === "female" ? /female|xia|hui|ting|woman|girl/i.test(v.name) : /male|yun|man|boy/i.test(v.name));
  return preferred || zhOrEn[0] || voices[0] || null;
}

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text.replace(/[*#`_>\-]/g, ""));
  utter.lang = state.languageStyle === "en" ? "en-US" : "zh-CN";
  utter.rate = 0.95;
  utter.pitch = state.voice === "female" ? 1.08 : 0.88;
  const voice = pickBrowserVoice();
  if (voice) utter.voice = voice;
  utter.onstart = () => $("sphere").classList.add("speaking");
  utter.onend = () => $("sphere").classList.remove("speaking");
  window.speechSynthesis.speak(utter);
}

async function sendMessage(message) {
  const text = message.trim();
  if (!text) return;
  addBubble("user", text);
  setLive("");
  setStatus(`${modeNames[state.mode]}模块：AI 正在分析...`);
  $("sendBtn").disabled = true;
  try {
    const reply = await callChat(text);
    addBubble("ai", reply);
    setStatus("回复完成。你可以继续追问、朗读句子或让它出题。 ");
    speak(reply);
  } catch (err) {
    addBubble("ai", `出现问题：${err.message}`);
    setStatus("请检查云函数地址、CORS 和 DeepSeek API Key。 ");
  } finally {
    $("sendBtn").disabled = false;
  }
}

function setupModes() {
  document.querySelectorAll(".mode").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === state.mode);
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      localStorage.setItem("mode", state.mode);
      document.querySelectorAll(".mode").forEach(b => b.classList.toggle("active", b === btn));
      setStatus(`已切换到${modeNames[state.mode]}模块。`);
    });
  });
}

function setupSettings() {
  $("apiBaseInput").value = state.apiBase;
  $("voiceSelect").value = state.voice;
  $("languageStyle").value = state.languageStyle;
  $("settingsBtn").addEventListener("click", () => $("settingsDialog").showModal());
  $("saveSettings").addEventListener("click", (e) => {
    e.preventDefault();
    state.apiBase = $("apiBaseInput").value.trim();
    state.voice = $("voiceSelect").value;
    state.languageStyle = $("languageStyle").value;
    localStorage.setItem("apiBase", state.apiBase);
    localStorage.setItem("voice", state.voice);
    localStorage.setItem("languageStyle", state.languageStyle);
    $("settingsDialog").close();
    setStatus("设置已保存。 ");
  });
}

function setupInput() {
  $("sendBtn").addEventListener("click", () => {
    const input = $("textInput");
    const text = input.value;
    input.value = "";
    sendMessage(text);
  });
  $("textInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("sendBtn").click();
  });
}

async function setupAudioPulse() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = state.audioContext.createMediaStreamSource(stream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 128;
    state.dataArray = new Uint8Array(state.analyser.frequencyBinCount);
    source.connect(state.analyser);
    animateWave();
  } catch (_) {
    animateWave(true);
  }
}

function animateWave(noMic = false) {
  const canvas = $("waveCanvas");
  const ctx = canvas.getContext("2d");
  let t = 0;
  function frame() {
    t += 0.04;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(69,214,255,.85)";
    ctx.beginPath();

    let avg = 18;
    if (!noMic && state.analyser && state.dataArray) {
      state.analyser.getByteFrequencyData(state.dataArray);
      avg = state.dataArray.reduce((a, b) => a + b, 0) / state.dataArray.length;
    }
    const scale = 1 + Math.min(avg / 180, 0.42);
    $("sphere").style.transform = `scale(${scale})`;

    for (let x = 0; x < canvas.width; x++) {
      const y = canvas.height / 2 + Math.sin(x * 0.035 + t * 2.4) * (8 + avg / 8) + Math.sin(x * 0.012 - t) * 10;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    requestAnimationFrame(frame);
  }
  frame();
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    $("micBtn").title = "当前浏览器不支持 Web Speech API，请使用 Chrome/Edge 或接入腾讯云 ASR。";
    return;
  }
  const rec = new SpeechRecognition();
  rec.lang = "zh-CN";
  rec.interimResults = true;
  rec.continuous = false;
  state.recognition = rec;

  rec.onstart = () => {
    state.recognizing = true;
    $("sphere").classList.add("listening");
    setStatus("正在听你说话... 手机浏览器需授权麦克风。 ");
  };
  rec.onresult = (event) => {
    let finalText = "";
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const s = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += s; else interim += s;
    }
    setLive(finalText || interim);
    if (finalText) sendMessage(finalText);
  };
  rec.onerror = (e) => setStatus(`语音识别错误：${e.error}`);
  rec.onend = () => {
    state.recognizing = false;
    $("sphere").classList.remove("listening");
  };

  $("micBtn").addEventListener("click", () => {
    if (state.recognizing) rec.stop(); else rec.start();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  setupModes();
  setupSettings();
  setupInput();
  setupSpeechRecognition();
  setupAudioPulse();
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = pickBrowserVoice;
  addBubble("ai", "你好！我是你的理工科考研英语 AI 教练。你可以让我讲语法、背单词、拆阅读长难句或批改作文。\n\nTry: Please analyze this sentence: Although technology advances rapidly, its impact on education remains controversial.");
});
