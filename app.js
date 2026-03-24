const DEFAULT_SETTINGS = {
  backgroundColor: "#f5efe5",
  backgroundImage: "",
  fontFamily: "'Outfit', sans-serif",
  fontSize: 16,
  fontColor: "#2a1f1a",
};

const state = {
  user: null,
  authMode: "login",
  editingPostId: null,
  filter: "all",
  previewBackgroundImage: "",
  siteUrl: "",
  backupPath: "",
  publicPost: null,
};

const elements = {
  publicPostView: document.getElementById("public-post-view"),
  publicPostTitle: document.getElementById("public-post-title"),
  publicPostMeta: document.getElementById("public-post-meta"),
  publicPostSummary: document.getElementById("public-post-summary"),
  publicPostContent: document.getElementById("public-post-content"),
  publicPostLink: document.getElementById("public-post-link"),
  publicPostQrImage: document.getElementById("public-post-qr-image"),
  copyPublicLinkBtn: document.getElementById("copy-public-link-btn"),
  downloadPublicQrBtn: document.getElementById("download-public-qr-btn"),
  authView: document.getElementById("auth-view"),
  appView: document.getElementById("app-view"),
  postsContainer: document.getElementById("posts-container"),
  postCountPill: document.getElementById("post-count-pill"),
  welcomeText: document.getElementById("welcome-text"),
  toast: document.getElementById("toast"),
  storageCopy: document.getElementById("storage-copy"),
  editorModal: document.getElementById("editor-modal"),
  detailModal: document.getElementById("detail-modal"),
  settingsModal: document.getElementById("settings-modal"),
  editorTitle: document.getElementById("editor-title"),
  postTitleInput: document.getElementById("post-title-input"),
  postSummaryInput: document.getElementById("post-summary-input"),
  postContentInput: document.getElementById("post-content-input"),
  detailTitle: document.getElementById("detail-title"),
  detailMeta: document.getElementById("detail-meta"),
  detailSummary: document.getElementById("detail-summary"),
  detailContent: document.getElementById("detail-content"),
  detailActions: document.getElementById("detail-actions"),
  backgroundColorInput: document.getElementById("background-color-input"),
  backgroundImageInput: document.getElementById("background-image-input"),
  clearBackgroundImageBtn: document.getElementById("clear-background-image-btn"),
  fontFamilySelect: document.getElementById("font-family-select"),
  fontSizeInput: document.getElementById("font-size-input"),
  fontSizeValue: document.getElementById("font-size-value"),
  fontColorInput: document.getElementById("font-color-input"),
  oldPasswordInput: document.getElementById("old-password-input"),
  newPasswordInput: document.getElementById("new-password-input"),
  confirmNewPasswordInput: document.getElementById("confirm-new-password-input"),
  siteUrlInput: document.getElementById("site-url-input"),
  saveSiteUrlBtn: document.getElementById("save-site-url-btn"),
  resetSiteUrlBtn: document.getElementById("reset-site-url-btn"),
  downloadQrBtn: document.getElementById("download-qr-btn"),
  siteUrlLink: document.getElementById("site-url-link"),
  siteQrImage: document.getElementById("site-qr-image"),
};

document.addEventListener("DOMContentLoaded", async () => {
  bindGlobalEvents();
  renderAuthView();
  await bootstrap();
});

async function bootstrap() {
  const sharedPostId = new URLSearchParams(window.location.search).get("post");
  if (sharedPostId) {
    await loadPublicPost(sharedPostId);
    return;
  }

  try {
    const response = await fetch("/api/me", { credentials: "same-origin" });
    if (response.status === 401) {
      applySettings(DEFAULT_SETTINGS);
      renderAccessInfo();
      return;
    }
    const data = await response.json();
    state.user = data.user;
    state.siteUrl = data.siteUrl || "";
    state.backupPath = data.backupPath || "";
  } catch (error) {
    console.error(error);
  }

  syncApp();
}

function bindGlobalEvents() {
  elements.copyPublicLinkBtn.addEventListener("click", copyCurrentPublicPostLink);
  elements.downloadPublicQrBtn.addEventListener("click", downloadCurrentPublicPostQr);
  document.getElementById("logout-btn").addEventListener("click", logout);
  document.getElementById("open-settings-btn").addEventListener("click", openSettingsModal);
  document.getElementById("close-settings-btn").addEventListener("click", closeSettingsModal);
  document.getElementById("cancel-settings-btn").addEventListener("click", closeSettingsModal);
  document.getElementById("save-settings-btn").addEventListener("click", saveSettings);
  document.getElementById("new-post-btn").addEventListener("click", () => openEditorModal());
  document.getElementById("view-drafts-btn").addEventListener("click", toggleDraftFilter);
  document.getElementById("close-editor-btn").addEventListener("click", closeEditorModal);
  document.getElementById("save-draft-btn").addEventListener("click", () => savePost("draft"));
  document.getElementById("publish-post-btn").addEventListener("click", () => savePost("published"));
  document.getElementById("close-detail-btn").addEventListener("click", closeDetailModal);
  document.querySelectorAll(".toolbar-btn").forEach((button) => {
    button.addEventListener("click", () => applyEditorCommand(button.dataset.command, button.dataset.value));
  });
  document.getElementById("insert-link-btn").addEventListener("click", insertLink);
  document.getElementById("insert-image-input").addEventListener("change", insertInlineImage);
  elements.backgroundColorInput.addEventListener("input", previewSettings);
  elements.fontFamilySelect.addEventListener("change", previewSettings);
  elements.fontSizeInput.addEventListener("input", previewSettings);
  elements.fontColorInput.addEventListener("input", previewSettings);
  elements.backgroundImageInput.addEventListener("change", previewBackgroundImage);
  elements.clearBackgroundImageBtn.addEventListener("click", clearBackgroundImage);
  elements.saveSiteUrlBtn.addEventListener("click", saveSiteUrl);
  elements.resetSiteUrlBtn.addEventListener("click", resetSiteUrl);
  elements.downloadQrBtn.addEventListener("click", downloadSiteQrCode);

  elements.editorModal.addEventListener("click", (event) => {
    if (event.target === elements.editorModal) {
      closeEditorModal();
    }
  });
  elements.detailModal.addEventListener("click", (event) => {
    if (event.target === elements.detailModal) {
      closeDetailModal();
    }
  });
  elements.settingsModal.addEventListener("click", (event) => {
    if (event.target === elements.settingsModal) {
      closeSettingsModal();
    }
  });
}

function renderAuthView() {
  elements.authView.innerHTML = `
    <section class="auth-card">
      <div class="brand-mark">MB</div>
      <p class="eyebrow">Memory Enabled Blog</p>
      <h1>发布后的博客可以直接生成分享链接和二维码</h1>
      <p class="auth-helper">登录后发布你的文章，然后复制文章链接或下载文章二维码，就可以把这一篇博客单独分享出去。</p>
      <div class="auth-tabs">
        <button class="tab-btn ${state.authMode === "login" ? "active" : ""}" data-mode="login" type="button">登录</button>
        <button class="tab-btn ${state.authMode === "register" ? "active" : ""}" data-mode="register" type="button">注册</button>
      </div>
      <form id="auth-form">
        <label class="field">
          <span>用户名</span>
          <input name="username" type="text" maxlength="20" placeholder="输入用户名" required>
        </label>
        <label class="field">
          <span>密码</span>
          <input name="password" type="password" placeholder="${state.authMode === "login" ? "输入密码" : "至少 6 位"}" required>
        </label>
        ${state.authMode === "register" ? `
          <label class="field">
            <span>确认密码</span>
            <input name="confirmPassword" type="password" placeholder="再次输入密码" required>
          </label>
        ` : ""}
        <button class="primary-btn" type="submit">${state.authMode === "login" ? "登录进入博客" : "创建账号"}</button>
      </form>
    </section>
  `;

  elements.authView.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.mode;
      renderAuthView();
    });
  });

  elements.authView.querySelector("#auth-form").addEventListener("submit", handleAuthSubmit);
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const endpoint = state.authMode === "login" ? "/api/login" : "/api/register";

  const data = await request(endpoint, {
    method: "POST",
    body: JSON.stringify({ username, password, confirmPassword }),
  });
  if (!data) {
    return;
  }

  state.user = data.user;
  state.siteUrl = data.siteUrl || "";
  state.backupPath = data.backupPath || "";
  syncApp();
  showToast(state.authMode === "login" ? `欢迎回来，${state.user.username}` : "注册成功，已自动登录");
}

function syncApp() {
  const isLoggedIn = Boolean(state.user);
  elements.publicPostView.classList.remove("active");
  elements.authView.classList.toggle("active", !isLoggedIn);
  elements.appView.classList.toggle("active", isLoggedIn);

  if (!isLoggedIn) {
    applySettings(DEFAULT_SETTINGS);
    renderAccessInfo();
    return;
  }

  applySettings(state.user.settings || DEFAULT_SETTINGS);
  elements.welcomeText.textContent = `${state.user.username}，开始写下今天的想法`;
  renderAccessInfo();
  renderPosts();
}

function renderAccessInfo() {
  const siteUrl = buildBaseUrl();
  elements.siteUrlInput.value = state.siteUrl;
  elements.siteUrlLink.href = siteUrl;
  elements.siteUrlLink.textContent = siteUrl;
  elements.siteQrImage.src = buildQrCodeUrl(siteUrl);
  elements.storageCopy.textContent = state.backupPath
    ? `主存储：SQLite 数据库。额外本地备份：${state.backupPath}`
    : "登录后会显示本地备份文件位置。";
}

function renderPosts() {
  const posts = [...(state.user?.posts || [])].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const visiblePosts = state.filter === "draft" ? posts.filter((post) => post.status === "draft") : posts;
  elements.postCountPill.textContent = `${posts.length} 篇文章`;

  if (!visiblePosts.length) {
    elements.postsContainer.innerHTML = `<p class="empty-state">${state.filter === "draft" ? "还没有草稿，点击“写文章”开始创作。" : "还没有文章，点击“写文章”创建第一篇内容。"}</p>`;
    return;
  }

  elements.postsContainer.innerHTML = visiblePosts.map((post) => `
    <article class="post-card">
      <span class="status-badge ${post.status === "draft" ? "status-draft" : ""}">${post.status === "draft" ? "草稿" : "已发布"}</span>
      <h4>${escapeHtml(post.title)}</h4>
      <p class="post-meta">发布时间：${formatDate(post.publishedAt || post.updatedAt)}</p>
      <p class="post-summary">${escapeHtml(post.summary || "这篇文章还没有摘要。")}</p>
      <div class="post-actions">
        <button class="ghost-btn" type="button" data-action="view" data-id="${post.id}">查看详情</button>
        <button class="ghost-btn" type="button" data-action="edit" data-id="${post.id}">编辑</button>
        ${post.status === "published" ? `<button class="ghost-btn" type="button" data-action="share" data-id="${post.id}">复制链接</button>` : ""}
        <button class="ghost-btn danger-text" type="button" data-action="delete" data-id="${post.id}">删除</button>
      </div>
    </article>
  `).join("");

  elements.postsContainer.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => handlePostAction(button.dataset.action, button.dataset.id));
  });
}

function toggleDraftFilter() {
  state.filter = state.filter === "draft" ? "all" : "draft";
  document.getElementById("view-drafts-btn").textContent = state.filter === "draft" ? "查看全部" : "查看草稿";
  renderPosts();
}

function handlePostAction(action, postId) {
  const post = state.user?.posts?.find((item) => item.id === postId);
  if (!post) {
    return;
  }

  if (action === "view") {
    openDetailModal(post);
    return;
  }

  if (action === "edit") {
    openEditorModal(post);
    return;
  }

  if (action === "share") {
    copyPostLink(post);
    return;
  }

  if (action === "delete") {
    if (!window.confirm(`确认删除《${post.title}》吗？删除后无法恢复。`)) {
      return;
    }
    deletePost(postId);
  }
}

function openEditorModal(post) {
  state.editingPostId = post?.id || null;
  elements.editorTitle.textContent = post ? "编辑文章" : "创作文章";
  elements.postTitleInput.value = post?.title || "";
  elements.postSummaryInput.value = post?.summary || "";
  elements.postContentInput.innerHTML = post?.content || "";
  elements.editorModal.classList.add("open");
}

function closeEditorModal() {
  elements.editorModal.classList.remove("open");
  state.editingPostId = null;
  elements.postTitleInput.value = "";
  elements.postSummaryInput.value = "";
  elements.postContentInput.innerHTML = "";
}

function openDetailModal(post) {
  elements.detailTitle.textContent = post.title;
  elements.detailMeta.textContent = `作者：${state.user.username} · 发布时间：${formatDate(post.publishedAt || post.updatedAt)}`;
  elements.detailSummary.textContent = post.summary || "";
  elements.detailContent.innerHTML = post.content;
  elements.detailActions.innerHTML = `
    <button class="ghost-btn" id="detail-edit-btn" type="button">编辑文章</button>
    ${post.status === "published" ? `<button class="ghost-btn" id="detail-copy-link-btn" type="button">复制文章链接</button>` : ""}
    ${post.status === "published" ? `<button class="ghost-btn" id="detail-download-qr-btn" type="button">下载文章二维码</button>` : ""}
  `;

  document.getElementById("detail-edit-btn").addEventListener("click", () => {
    closeDetailModal();
    openEditorModal(post);
  });

  if (post.status === "published") {
    document.getElementById("detail-copy-link-btn").addEventListener("click", () => copyPostLink(post));
    document.getElementById("detail-download-qr-btn").addEventListener("click", () => downloadPostQr(post));
  }

  elements.detailModal.classList.add("open");
}

function closeDetailModal() {
  elements.detailModal.classList.remove("open");
}

function applyEditorCommand(command, value) {
  elements.postContentInput.focus();
  document.execCommand(command, false, value || null);
}

function insertLink() {
  const link = window.prompt("输入链接地址");
  if (link) {
    applyEditorCommand("createLink", link);
  }
}

function insertInlineImage(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    applyEditorCommand("insertImage", reader.result);
    event.target.value = "";
  };
  reader.readAsDataURL(file);
}

async function savePost(status) {
  const data = await request("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      id: state.editingPostId,
      title: elements.postTitleInput.value.trim(),
      summary: elements.postSummaryInput.value.trim(),
      content: elements.postContentInput.innerHTML.trim(),
      status,
    }),
  });
  if (!data) {
    return;
  }

  state.user = data.user;
  renderPosts();
  closeEditorModal();
  showToast(status === "draft" ? "草稿已保存" : "文章已发布");
}

async function deletePost(postId) {
  const data = await request(`/api/posts/${postId}`, { method: "DELETE" });
  if (!data) {
    return;
  }

  state.user = data.user;
  renderPosts();
  showToast("文章已删除");
}

function openSettingsModal() {
  const settings = state.user?.settings || DEFAULT_SETTINGS;
  state.previewBackgroundImage = settings.backgroundImage || "";
  elements.backgroundColorInput.value = settings.backgroundColor;
  elements.fontFamilySelect.value = settings.fontFamily;
  elements.fontSizeInput.value = settings.fontSize;
  elements.fontColorInput.value = settings.fontColor;
  elements.fontSizeValue.textContent = `${settings.fontSize}px`;
  clearPasswordFields();
  elements.settingsModal.classList.add("open");
}

function closeSettingsModal() {
  elements.settingsModal.classList.remove("open");
  clearPasswordFields();
  state.previewBackgroundImage = state.user?.settings?.backgroundImage || "";
  applySettings(state.user?.settings || DEFAULT_SETTINGS);
}

function previewSettings() {
  const settings = {
    backgroundColor: elements.backgroundColorInput.value,
    backgroundImage: state.previewBackgroundImage,
    fontFamily: elements.fontFamilySelect.value,
    fontSize: Number(elements.fontSizeInput.value),
    fontColor: elements.fontColorInput.value,
  };
  elements.fontSizeValue.textContent = `${settings.fontSize}px`;
  applySettings(settings);
}

function previewBackgroundImage(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    state.previewBackgroundImage = String(reader.result);
    previewSettings();
  };
  reader.readAsDataURL(file);
}

function clearBackgroundImage() {
  state.previewBackgroundImage = "";
  elements.backgroundImageInput.value = "";
  previewSettings();
}

async function saveSettings() {
  const oldPassword = elements.oldPasswordInput.value;
  const newPassword = elements.newPasswordInput.value;
  const confirmNewPassword = elements.confirmNewPasswordInput.value;

  if (newPassword && newPassword !== confirmNewPassword) {
    showToast("两次输入的新密码不一致");
    return;
  }

  const data = await request("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      settings: {
        backgroundColor: elements.backgroundColorInput.value,
        backgroundImage: state.previewBackgroundImage,
        fontFamily: elements.fontFamilySelect.value,
        fontSize: Number(elements.fontSizeInput.value),
        fontColor: elements.fontColorInput.value,
      },
      passwordChange: oldPassword || newPassword || confirmNewPassword
        ? { oldPassword, newPassword, confirmNewPassword }
        : null,
    }),
  });
  if (!data) {
    return;
  }

  state.user = data.user;
  applySettings(state.user.settings);
  closeSettingsModal();
  showToast("设置已保存");
}

async function saveSiteUrl() {
  const rawUrl = elements.siteUrlInput.value.trim();
  if (!rawUrl) {
    showToast("请先填写网站链接");
    return;
  }

  let normalized;
  try {
    normalized = new URL(rawUrl).toString();
  } catch (error) {
    showToast("请输入正确的链接地址");
    return;
  }

  const data = await request("/api/access", {
    method: "PUT",
    body: JSON.stringify({ siteUrl: normalized }),
  });
  if (!data) {
    return;
  }

  state.siteUrl = data.siteUrl || "";
  state.backupPath = data.backupPath || state.backupPath;
  renderAccessInfo();
  showToast("网站入口已保存");
}

async function resetSiteUrl() {
  const data = await request("/api/access", {
    method: "PUT",
    body: JSON.stringify({ siteUrl: "" }),
  });
  if (!data) {
    return;
  }

  state.siteUrl = "";
  state.backupPath = data.backupPath || state.backupPath;
  renderAccessInfo();
  showToast("网站入口已清空");
}

async function loadPublicPost(postId) {
  const data = await request(`/api/posts/public/${encodeURIComponent(postId)}`, {}, false);
  if (!data?.post) {
    elements.publicPostTitle.textContent = "文章不存在或未发布";
    elements.publicPostMeta.textContent = "";
    elements.publicPostSummary.textContent = "请检查当前链接是否正确。";
    elements.publicPostContent.innerHTML = "";
    elements.publicPostLink.href = window.location.href;
    elements.publicPostLink.textContent = window.location.href;
    elements.publicPostQrImage.src = buildQrCodeUrl(window.location.href);
    elements.publicPostView.classList.add("active");
    elements.authView.classList.remove("active");
    elements.appView.classList.remove("active");
    applySettings(DEFAULT_SETTINGS);
    return;
  }

  state.publicPost = data.post;
  state.siteUrl = data.siteUrl || state.siteUrl;
  renderPublicPost();
}

function renderPublicPost() {
  const post = state.publicPost;
  const postUrl = buildPostUrl(post.id);
  elements.publicPostTitle.textContent = post.title;
  elements.publicPostMeta.textContent = `作者：${post.author} · 发布时间：${formatDate(post.publishedAt || post.updatedAt)}`;
  elements.publicPostSummary.textContent = post.summary || "";
  elements.publicPostContent.innerHTML = post.content;
  elements.publicPostLink.href = postUrl;
  elements.publicPostLink.textContent = postUrl;
  elements.publicPostQrImage.src = buildQrCodeUrl(postUrl);
  elements.publicPostView.classList.add("active");
  elements.authView.classList.remove("active");
  elements.appView.classList.remove("active");
  applySettings(DEFAULT_SETTINGS);
  document.title = `${post.title} - Memory Blog`;
}

function buildBaseUrl() {
  return (state.siteUrl || window.location.origin).replace(/\/$/, "");
}

function buildPostUrl(postId) {
  return `${buildBaseUrl()}/?post=${encodeURIComponent(postId)}`;
}

function buildQrCodeUrl(value) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(value)}`;
}

function downloadQrForUrl(url, filename) {
  const link = document.createElement("a");
  link.href = buildQrCodeUrl(url).replace("size=240x240", "size=1200x1200");
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function downloadSiteQrCode() {
  downloadQrForUrl(buildBaseUrl(), "memory-blog-site-qr.png");
  showToast("网站二维码开始下载");
}

function downloadPostQr(post) {
  downloadQrForUrl(buildPostUrl(post.id), `post-${post.id}-qr.png`);
  showToast("文章二维码开始下载");
}

async function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  window.prompt("复制下面的链接", value);
}

async function copyPostLink(post) {
  await copyToClipboard(buildPostUrl(post.id));
  showToast("文章链接已复制");
}

async function copyCurrentPublicPostLink() {
  if (!state.publicPost) {
    return;
  }
  await copyToClipboard(buildPostUrl(state.publicPost.id));
  showToast("文章链接已复制");
}

function downloadCurrentPublicPostQr() {
  if (!state.publicPost) {
    return;
  }
  downloadPostQr(state.publicPost);
}

function applySettings(settings) {
  const safeSettings = { ...DEFAULT_SETTINGS, ...settings };
  document.documentElement.style.setProperty("--bg-base", safeSettings.backgroundColor);
  document.documentElement.style.setProperty("--font-family-main", safeSettings.fontFamily);
  document.documentElement.style.setProperty("--font-size-main", `${safeSettings.fontSize}px`);
  document.documentElement.style.setProperty("--user-font-color", safeSettings.fontColor);
  document.documentElement.style.setProperty(
    "--user-background-image",
    safeSettings.backgroundImage ? `url("${safeSettings.backgroundImage}")` : "none"
  );
}

async function logout() {
  await request("/api/logout", { method: "POST" }, false);
  state.user = null;
  state.filter = "all";
  document.getElementById("view-drafts-btn").textContent = "查看草稿";
  syncApp();
  showToast("已退出登录");
}

async function request(url, options = {}, showError = true) {
  try {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });

    const data = await response.json();
    if (!response.ok) {
      if (showError) {
        showToast(data.error || "请求失败");
      }
      return null;
    }
    return data;
  } catch (error) {
    console.error(error);
    if (showError) {
      showToast("网络请求失败");
    }
    return null;
  }
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2200);
}

function clearPasswordFields() {
  elements.oldPasswordInput.value = "";
  elements.newPasswordInput.value = "";
  elements.confirmNewPasswordInput.value = "";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
