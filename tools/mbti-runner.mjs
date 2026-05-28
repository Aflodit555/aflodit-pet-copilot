const port = 9223;

async function json(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`Timeout: ${method}`));
      }, 30000);
    });
  }

  close() {
    this.ws.close();
  }
}

async function getPage() {
  const targets = await json(`http://127.0.0.1:${port}/json`);
  let page = targets.find(t => t.type === "page" && /16personalities\.com/.test(t.url));
  if (!page) {
    page = await json(`http://127.0.0.1:${port}/json/new?${encodeURIComponent("https://www.16personalities.com/ch")}`, {
      method: "PUT",
    });
  }
  return page;
}

async function evaluate(client, expression, awaitPromise = true) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails, null, 2));
  }
  return result.result.value;
}

async function evaluateJson(client, expression) {
  const text = await evaluate(client, `JSON.stringify(${expression})`);
  return JSON.parse(text);
}

async function waitFor(client, expression, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await evaluate(client, expression).catch(() => null);
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function main() {
  const page = await getPage();
  const client = new Cdp(page.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  await evaluate(client, `location.href`, true);
  if (!decodeURIComponent(page.url).includes("人格测试")) {
    await client.send("Page.navigate", { url: "https://www.16personalities.com/ch/%E4%BA%BA%E6%A0%BC%E6%B5%8B%E8%AF%95" });
  }
  await waitFor(client, `document.readyState === "complete" || document.readyState === "interactive"`, 30000);
  await new Promise(resolve => setTimeout(resolve, 3000));

  if (process.argv.includes("--complete")) {
    const result = await completeQuiz(client);
    console.log(JSON.stringify(result, null, 2));
    client.close();
    return;
  }

  const summary = await evaluateJson(client, `(() => ({
    url: location.href,
    title: document.title,
    text: document.body.innerText.slice(0, 4000),
    controls: [...document.querySelectorAll('input,button,a,[role=button],label')].slice(0, 250).map((el, i) => ({
      i,
      tag: el.tagName,
      text: (el.innerText || el.textContent || el.value || '').trim(),
      type: el.type || '',
      name: el.name || '',
      id: el.id || '',
      cls: String(el.className || ''),
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    })),
    buttons: [...document.querySelectorAll('button,a')].slice(0, 30).map(el => ({
      text: (el.innerText || el.textContent || '').trim(),
      href: el.href || '',
      cls: String(el.className || ''),
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    })),
    headings: [...document.querySelectorAll('h1,h2,h3')].slice(0, 10).map(el => (el.innerText || '').trim()),
  }))()`);
  console.log(JSON.stringify(summary, null, 2));
  client.close();
}

async function completeQuiz(client) {
  const answers = ["-2", "2", "-1", "1", "-3", "3"];
  for (let pageIndex = 0; pageIndex < 20; pageIndex += 1) {
    const state = await evaluateJson(client, `(() => {
      const groups = [...new Set([...document.querySelectorAll('input[type="radio"]')]
        .filter(input => input.offsetParent !== null)
        .map(input => input.name))];
      const questionText = document.body.innerText.match(/问题\\d+ 共60 个[^\\n]+/)?.[0] || '';
      return {
        url: location.href,
        questionText,
        groups,
        nextText: [...document.querySelectorAll('button')]
          .filter(button => button.offsetParent !== null)
          .map(button => (button.innerText || button.textContent || '').trim())
          .find(text => /下一个|提交|查看|结果|完成/.test(text)) || ''
      };
    })()`);

    if (!state.groups.length || /result|结果|profiles|personality-types/i.test(state.url)) {
      break;
    }

    await evaluate(client, `(() => {
      const answers = ${JSON.stringify(answers)};
      const groups = [...new Set([...document.querySelectorAll('input[type="radio"]')]
        .filter(input => input.offsetParent !== null)
        .map(input => input.name))];
      groups.forEach((name, index) => {
        const value = answers[index % answers.length];
        const options = [...document.querySelectorAll('input[type="radio"][name="' + CSS.escape(name) + '"]')];
        const chosen = options.find(input => input.value === value) || options[Math.floor(options.length / 2)];
        chosen.scrollIntoView({ block: 'center' });
        chosen.click();
        chosen.checked = true;
        chosen.dispatchEvent(new Event('input', { bubbles: true }));
        chosen.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return groups.length;
    })()`);

    await new Promise(resolve => setTimeout(resolve, 500));
    const clicked = await evaluate(client, `(() => {
      const buttons = [...document.querySelectorAll('button')]
        .filter(button => button.offsetParent !== null && !button.disabled);
      const button = buttons.find(button => /下一个|提交|查看|结果|完成/.test((button.innerText || button.textContent || '').trim()));
      if (!button) return false;
      button.scrollIntoView({ block: 'center' });
      button.click();
      return true;
    })()`);
    if (!clicked) {
      throw new Error(`No next/submit button found on page ${pageIndex + 1}`);
    }
    await new Promise(resolve => setTimeout(resolve, 2500));
  }

  await new Promise(resolve => setTimeout(resolve, 8000));
  return evaluateJson(client, `(() => ({
    url: location.href,
    title: document.title,
    headings: [...document.querySelectorAll('h1,h2,h3')].slice(0, 20).map(el => (el.innerText || '').trim()).filter(Boolean),
    text: document.body.innerText.slice(0, 3000),
  }))()`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
