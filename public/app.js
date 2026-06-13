const state = {
  posts: [],
  selectedPostId: null
};

const postForm = document.querySelector("#postForm");
const postTitle = document.querySelector("#postTitle");
const postDescription = document.querySelector("#postDescription");
const postList = document.querySelector("#postList");
const postCount = document.querySelector("#postCount");
const postDetail = document.querySelector("#postDetail");
const emptyState = document.querySelector("#emptyState");
const detailTitle = document.querySelector("#detailTitle");
const detailDescription = document.querySelector("#detailDescription");
const detailMeta = document.querySelector("#detailMeta");
const deletePostButton = document.querySelector("#deletePostButton");
const uploadForm = document.querySelector("#uploadForm");
const imageInput = document.querySelector("#imageInput");
const imageCaption = document.querySelector("#imageCaption");
const imageGrid = document.querySelector("#imageGrid");
const refreshButton = document.querySelector("#refreshButton");
const toast = document.querySelector("#toast");
const imageDialog = document.querySelector("#imageDialog");
const dialogImage = document.querySelector("#dialogImage");
const closeDialogButton = document.querySelector("#closeDialogButton");

let toastTimer = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    let message = "请求失败";
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function currentPost() {
  return state.posts.find((post) => post.id === state.selectedPostId) || null;
}

function postIdFromLocation() {
  const match = window.location.hash.match(/^#\/posts\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function setPostHash(postId) {
  const nextHash = postId ? `#/posts/${encodeURIComponent(postId)}` : "";
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}

function renderPostList() {
  postCount.textContent = String(state.posts.length);

  if (!state.posts.length) {
    postList.innerHTML = '<p class="meta">暂无帖子</p>';
    return;
  }

  postList.innerHTML = "";
  for (const post of state.posts) {
    const link = document.createElement("a");
    link.className = `post-item${post.id === state.selectedPostId ? " active" : ""}`;
    link.href = `#/posts/${encodeURIComponent(post.id)}`;
    link.dataset.postId = post.id;

    const title = document.createElement("strong");
    title.textContent = post.title;
    const meta = document.createElement("span");
    meta.textContent = `${post.images.length} 张图片 · ${formatTime(post.updatedAt)}`;

    link.append(title, meta);
    postList.append(link);
  }
}

function renderDetail() {
  const post = currentPost();

  if (!post) {
    postDetail.hidden = true;
    emptyState.hidden = false;
    emptyState.querySelector("h2").textContent = state.posts.length ? "请选择帖子" : "还没有帖子";
    emptyState.querySelector("p").textContent = state.posts.length ? "从左侧打开一个帖子查看图片。" : "先创建一个帖子，然后上传图片。";
    return;
  }

  emptyState.hidden = true;
  postDetail.hidden = false;
  detailTitle.textContent = post.title;
  detailDescription.textContent = post.description || "无备注";
  detailMeta.textContent = `${post.images.length} 张图片 · 创建于 ${formatTime(post.createdAt)} · 更新于 ${formatTime(post.updatedAt)}`;

  imageGrid.innerHTML = "";
  if (!post.images.length) {
    imageGrid.innerHTML = '<p class="meta">这个帖子里还没有图片。</p>';
    return;
  }

  for (const image of post.images) {
    const card = document.createElement("article");
    card.className = "image-card";

    const img = document.createElement("img");
    img.src = image.url;
    img.alt = image.caption || image.originalName || "图片";
    img.loading = "lazy";
    img.addEventListener("click", () => {
      dialogImage.src = image.url;
      dialogImage.alt = image.caption || image.originalName || "图片";
      imageDialog.showModal();
    });

    if (image.caption) {
      const caption = document.createElement("p");
      caption.className = "image-caption";
      caption.textContent = image.caption;
      card.append(img, caption);
    } else {
      card.append(img);
    }

    const actions = document.createElement("div");
    actions.className = "image-actions";

    const name = document.createElement("span");
    name.className = "image-name";
    name.title = image.originalName || image.filename;
    name.textContent = image.originalName || image.filename;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "small-danger";
    deleteButton.textContent = "删除";
    deleteButton.addEventListener("click", () => deleteImage(image.id));

    actions.append(name, deleteButton);
    card.append(actions);
    imageGrid.append(card);
  }
}

function render() {
  renderPostList();
  renderDetail();
}

async function loadPosts(preferredPostId = state.selectedPostId) {
  state.posts = await requestJson("/api/posts");
  const hashPostId = postIdFromLocation();
  const requestedPostId = preferredPostId || hashPostId;

  if (requestedPostId && state.posts.some((post) => post.id === requestedPostId)) {
    state.selectedPostId = requestedPostId;
  } else {
    state.selectedPostId = state.posts[0]?.id || null;
  }

  setPostHash(state.selectedPostId);
  render();
}

async function createPost(event) {
  event.preventDefault();
  const submitButton = postForm.querySelector("button[type='submit']");
  submitButton.disabled = true;

  try {
    const post = await requestJson("/api/posts", {
      method: "POST",
      body: JSON.stringify({
        title: postTitle.value,
        description: postDescription.value
      })
    });
    postForm.reset();
    setPostHash(post.id);
    await loadPosts(post.id);
    showToast("帖子已创建");
  } catch (error) {
    showToast(error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function uploadImages(event) {
  event.preventDefault();
  const post = currentPost();

  if (!post || !imageInput.files.length) {
    return;
  }

  const submitButton = uploadForm.querySelector("button[type='submit']");
  submitButton.disabled = true;

  try {
    const formData = new FormData();
    for (const file of imageInput.files) {
      formData.append("images", file);
    }
    formData.append("caption", imageCaption.value.trim());

    const response = await fetch(`/api/posts/${post.id}/images`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "上传失败");
    }

    uploadForm.reset();
    await loadPosts(post.id);
    showToast("图片已上传");
  } catch (error) {
    showToast(error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function deletePost() {
  const post = currentPost();
  if (!post || !confirm(`确定删除帖子“${post.title}”及其中所有图片吗？`)) {
    return;
  }

  try {
    await requestJson(`/api/posts/${post.id}`, { method: "DELETE" });
    await loadPosts(null);
    showToast("帖子已删除");
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteImage(imageId) {
  const post = currentPost();
  if (!post || !confirm("确定删除这张图片吗？")) {
    return;
  }

  try {
    await requestJson(`/api/posts/${post.id}/images/${imageId}`, { method: "DELETE" });
    await loadPosts(post.id);
    showToast("图片已删除");
  } catch (error) {
    showToast(error.message);
  }
}

postForm.addEventListener("submit", createPost);
uploadForm.addEventListener("submit", uploadImages);
deletePostButton.addEventListener("click", deletePost);
refreshButton.addEventListener("click", () => loadPosts().catch((error) => showToast(error.message)));

postList.addEventListener("click", (event) => {
  const link = event.target.closest(".post-item");
  if (!link) {
    return;
  }

  state.selectedPostId = link.dataset.postId;
  render();
});

window.addEventListener("hashchange", () => {
  const postId = postIdFromLocation();
  if (postId && state.posts.some((post) => post.id === postId)) {
    state.selectedPostId = postId;
    render();
  }
});

closeDialogButton.addEventListener("click", () => imageDialog.close());
imageDialog.addEventListener("click", (event) => {
  if (event.target === imageDialog) {
    imageDialog.close();
  }
});

loadPosts().catch((error) => showToast(error.message));
