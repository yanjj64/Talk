const API_BASE = "https://你的云函数地址";

async function startChat() {
  const text = prompt("说点什么：");
  const res = await fetch(API_BASE + "/chat", {
    method: "POST",
    body: JSON.stringify({ message: text })
  });
  const data = await res.text();
  document.getElementById("subtitle").innerText = data;
}
