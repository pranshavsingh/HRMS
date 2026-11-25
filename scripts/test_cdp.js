const http = require("http");

async function run() {
  const tabs = await new Promise((resolve, reject) => {
    http.get("http://localhost:9222/json", (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });

  const pageTab = tabs.find((t) => t.type === "page" && t.url.includes("new-tab"));
  const target = pageTab || tabs.find((t) => t.type === "page");
  if (!target) {
    console.log("No page tab found");
    return;
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let msgId = 1;
  const send = (method, params = {}) => {
    const id = msgId++;
    ws.send(JSON.stringify({ id, method, params }));
    return id;
  };

  ws.onopen = () => {
    send("Runtime.enable");
    send("Page.enable");
    send("Log.enable");
    send("Page.navigate", { url: "http://localhost:5173/" });
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === "Runtime.consoleAPICalled") {
      console.log(`[CONSOLE ${msg.params.type}]`, msg.params.args.map((a) => a.value || a.description || JSON.stringify(a)).join(" "));
    } else if (msg.method === "Runtime.exceptionThrown") {
      console.error("[EXCEPTION]", msg.params.exceptionDetails);
    } else if (msg.method === "Page.loadEventFired") {
      console.log("[PAGE LOADED]");
      setTimeout(async () => {
        send("Runtime.evaluate", {
          expression: "document.body.innerText",
          returnByValue: true
        });
      }, 1500);
    } else if (msg.result?.result?.value) {
      console.log("[BODY TEXT]:\n", msg.result.result.value);
      setTimeout(() => process.exit(0), 500);
    }
  };

  setTimeout(() => {
    console.log("Timeout reached");
    process.exit(0);
  }, 10000);
}

run().catch(console.error);
