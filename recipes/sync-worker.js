// 奕静QQ家庭菜谱 · 云端同步后端（Cloudflare Workers，模块格式）
// 部署方法见说明：令牌 GH_TOKEN 只存在 Worker 的加密环境变量里，绝不下发到网页。
//
// 环境变量（Settings → Variables → Add variable，勾选 Encrypt）：
//   GH_TOKEN  = 你的 GitHub PAT（ghp_...，需 repo 权限）
//   SYNC_KEY  = 与网页中一致的写入口令（防止陌生人随意写，非 GitHub 令牌）
//
// 文件：仓库 123QPlus/workbench 的 recipes/user_recipes.json（与 data.json 分开，互不影响）

const REPO = "123QPlus/workbench";
const PATH = "recipes/user_recipes.json";
const BRANCH = "main";
const SYNC_KEY = "yijingqq2026";
const ALLOW_ORIGIN = "https://123qplus.github.io";

function ghHeaders(env) {
  return {
    Authorization: "Bearer " + env.GH_TOKEN,
    Accept: "application/vnd.github+json",
    "User-Agent": "recipes-sync",
    "Content-Type": "application/json"
  };
}
function cors(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": ALLOW_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Recipes-Key"
    }
  });
}
// GitHub 用 UTF-8 的 base64；Worker 原生 atob/btoa 只认 Latin1，需转码
function b64e(s) { return btoa(unescape(encodeURIComponent(s))); }
function b64d(s) { return decodeURIComponent(escape(atob(s))); }

export default {
  async fetch(req, env) {
    const api = "https://api.github.com/repos/" + REPO + "/contents/" + PATH;

    if (req.method === "OPTIONS") return cors("", 204);

    // GET：公开读取（任何人打开页面都能读，安全）
    if (req.method === "GET") {
      const r = await fetch(api + "?ref=" + BRANCH, { headers: ghHeaders(env) });
      if (r.status === 404) return cors(JSON.stringify([]));        // 文件还没创建
      if (!r.ok) return cors(JSON.stringify({ error: "github " + r.status }), 502);
      const j = await r.json();
      let list = [];
      try { list = JSON.parse(b64d(j.content)); } catch (e) {}
      return cors(JSON.stringify(list));
    }

    // POST：需 SYNC_KEY，支持 add / delete
    if (req.method === "POST") {
      const key = req.headers.get("Recipes-Key");
      if (key !== SYNC_KEY) return cors(JSON.stringify({ error: "bad key" }), 403);

      const body = await req.json().catch(() => ({}));

      // 取当前文件（拿到 sha 才能 PUT 更新）
      const gr = await fetch(api + "?ref=" + BRANCH, { headers: ghHeaders(env) });
      let list = [], sha = null;
      if (gr.status !== 404) {
        const gj = await gr.json();
        try { list = JSON.parse(b64d(gj.content)); } catch (e) {}
        sha = gj.sha;
      }

      if (body.action === "add" && body.recipe) {
        list = list.filter(x => String(x.id) !== String(body.recipe.id)); // 同 id 覆盖
        list.push(body.recipe);
      } else if (body.action === "delete" && body.id) {
        list = list.filter(x => String(x.id) !== String(body.id));
      } else {
        return cors(JSON.stringify({ error: "bad action" }), 400);
      }

      const put = await fetch(api, {
        method: "PUT",
        headers: ghHeaders(env),
        body: JSON.stringify({
          message: "sync: recipe update",
          content: b64e(JSON.stringify(list, null, 2)),
          sha, branch: BRANCH
        })
      });
      if (!put.ok) return cors(JSON.stringify({ error: "github " + put.status }), 502);
      return cors(JSON.stringify(list));
    }

    return cors(JSON.stringify({ error: "method" }), 405);
  }
};
