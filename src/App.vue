<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

type Ad = {
  id: number;
  title: string;
  category: string;
  city: string;
  price: number;
  seller: string;
  contact: string;
  description: string;
  status?: "pending" | "approved" | "rejected";
  createdAt: string;
};

const categories = ["Все", "Автомобили", "Недвижимость", "Работа", "Услуги", "Бизнесы", "Другое"];
const search = ref("");
const activeCategory = ref("Все");
const ads = ref<Ad[]>([]);
const loading = ref(true);
const apiOnline = ref(false);

const showCreate = ref(false);
const showMediaLogin = ref(false);
const showMediaPanel = ref(false);
const mediaError = ref("");
const mediaUser = ref("");
const mediaAds = ref<Ad[]>([]);

const form = ref({
  title: "",
  category: "Автомобили",
  city: "Los Santos",
  price: "",
  seller: "",
  contact: "",
  description: ""
});

const login = ref({
  username: "",
  password: ""
});

const filteredAds = computed(() => {
  const q = search.value.trim().toLowerCase();

  return ads.value.filter((ad) => {
    const categoryMatch = activeCategory.value === "Все" || ad.category === activeCategory.value;
    const text = `${ad.title} ${ad.category} ${ad.city} ${ad.seller} ${ad.description}`.toLowerCase();
    return categoryMatch && (!q || text.includes(q)) && ad.status !== "rejected";
  });
});

const pendingAds = computed(() =>
  mediaAds.value.filter((ad) => ad.status === "pending")
);

function money(value: number) {
  if (!value) return "Договорная";
  return `${new Intl.NumberFormat("ru-RU").format(value)} $`;
}

async function loadAds() {
  loading.value = true;

  try {
    const response = await fetch("/api/ads");
    const data = await response.json();
    ads.value = data.ads ?? [];
    apiOnline.value = response.ok;
  } catch {
    apiOnline.value = false;
    ads.value = [];
  } finally {
    loading.value = false;
  }
}

async function createAd() {
  if (!form.value.title || !form.value.seller || !form.value.contact) return;

  const response = await fetch("/api/ads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...form.value,
      price: Number(form.value.price || 0)
    })
  });

  if (response.ok) {
    // The API stores a new ad as `pending`. Do not add it to the
    // public `ads` list here: that list contains only approved ads.
    // The ad will appear publicly only after media moderation.
    await response.json();

    showCreate.value = false;

    // Keep the public list in sync with D1. Pending ads are intentionally
    // excluded by GET /api/ads until a moderator approves them.
    await loadAds();

    form.value = {
      title: "",
      category: "Автомобили",
      city: "Los Santos",
      price: "",
      seller: "",
      contact: "",
      description: ""
    };

    alert("Объявление отправлено на проверку СМИ.");
  }
}

function openMediaLogin() {
  mediaError.value = "";
  showMediaLogin.value = true;
}

async function loadMediaAds() {
  const response = await fetch("/api/media/ads?status=pending");

  if (!response.ok) {
    throw new Error("Не удалось загрузить очередь модерации.");
  }

  const data = await response.json();

  mediaAds.value = (data.ads ?? []).map((ad: Ad) => ({
    ...ad,
    status: "pending"
  }));
}

async function mediaLogin() {
  mediaError.value = "";

  try {
    const response = await fetch("/api/media/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(login.value)
    });

    if (!response.ok) {
      mediaError.value = "Неверный логин или пароль.";
      return;
    }

    const data = await response.json();

    mediaUser.value = data.user.nickname;
    showMediaLogin.value = false;
    showMediaPanel.value = true;
    login.value = { username: "", password: "" };

    await loadMediaAds();
  } catch {
    mediaError.value = "Не удалось подключиться к серверу.";
  }
}

async function moderateAd(ad: Ad, action: "approve" | "reject") {
  try {
    const response = await fetch(`/api/media/ads/${ad.id}/${action}`, {
      method: "POST"
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      alert(data?.error ?? "Не удалось изменить статус объявления.");
      return;
    }

    // Сначала обновляем очередь из D1.
    await loadMediaAds();

    // Затем обновляем публичный список.
    await loadAds();
  } catch {
    alert("Не удалось подключиться к серверу.");
  }
}

async function approveAd(ad: Ad) {
  await moderateAd(ad, "approve");
}

async function rejectAd(ad: Ad) {
  await moderateAd(ad, "reject");
}

async function logoutMedia() {
  try { await fetch("/api/media/logout", { method: "POST" }); } catch {}
  showMediaPanel.value = false;
  mediaUser.value = "";
  mediaAds.value = [];
}

onMounted(loadAds);
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">SM</div>
        <div>
          <div class="brand-title">TITANIUM MARKET</div>
          <div class="brand-subtitle">Официальный маркетплейс штата</div>
        </div>
      </div>

      <div class="top-actions">
        <span class="status">
          <span :class="['status-dot', { online: apiOnline }]"></span>
          {{ apiOnline ? "Сервис работает" : "Демо-режим" }}
        </span>

        <button class="media-link" @click="showMediaPanel ? showMediaPanel = false : openMediaLogin()">
          Панель СМИ
        </button>

        <button class="btn btn-primary" @click="showCreate = true">
          + Подать объявление
        </button>
      </div>
    </header>

    <main>
      <section class="hero">
        <div>
          <div class="eyebrow">ЭЛЕКТРОННАЯ ПЛОЩАДКА ШТАТА</div>
          <h1>Найди. Купи.<br /><span>Продай.</span></h1>
          <p>
            Автомобили, недвижимость, работа, услуги и бизнес —
            всё в одном месте.
          </p>
        </div>

        <div class="hero-stat">
          <strong>{{ filteredAds.length }}</strong>
          <span>доступных объявлений</span>
        </div>
      </section>

      <section class="controls">
        <div class="search">
          <span>⌕</span>
          <input
            v-model="search"
            placeholder="Поиск по объявлениям..."
          />
        </div>

        <div class="categories">
          <button
            v-for="category in categories"
            :key="category"
            :class="{ active: activeCategory === category }"
            @click="activeCategory = category"
          >
            {{ category }}
          </button>
        </div>
      </section>

      <section class="section-head">
        <div>
          <div class="section-kicker">АКТУАЛЬНЫЕ ПРЕДЛОЖЕНИЯ</div>
          <h2>Объявления</h2>
        </div>

        <span class="result-count">
          {{ filteredAds.length }} найдено
        </span>
      </section>

      <section v-if="loading" class="empty">
        Загружаем объявления...
      </section>

      <section
        v-else-if="filteredAds.length"
        class="grid"
      >
        <article
          v-for="ad in filteredAds"
          :key="ad.id"
          class="card"
        >
          <div class="card-top">
            <span class="tag">{{ ad.category }}</span>
            <span class="date">{{ ad.createdAt }}</span>
          </div>

          <h3>{{ ad.title }}</h3>

          <div class="price">
            {{ money(ad.price) }}
          </div>

          <p>{{ ad.description }}</p>

          <div class="card-bottom">
            <div>
              <div class="seller">{{ ad.seller }}</div>
              <div class="city">
                {{ ad.city }} · {{ ad.contact }}
              </div>
            </div>

            <button class="more">→</button>
          </div>
        </article>
      </section>

      <section v-else class="empty">
        По вашему запросу ничего не найдено.
      </section>
    </main>

    <footer>
      <span>TITANIUM MARKET</span>
      <span>
        Официальный маркетплейс штата
      </span>
    </footer>

    <!-- CREATE AD -->
    <div
      v-if="showCreate"
      class="modal-backdrop"
      @click.self="showCreate = false"
    >
      <form class="modal" @submit.prevent="createAd">
        <div class="modal-head">
          <div>
            <div class="section-kicker">
              НОВОЕ ОБЪЯВЛЕНИЕ
            </div>
            <h2>Подать объявление</h2>
          </div>

          <button
            type="button"
            class="close"
            @click="showCreate = false"
          >
            ×
          </button>
        </div>

        <div class="notice">
          После отправки объявление будет проверено сотрудником СМИ.
        </div>

        <label>
          Название
          <input
            v-model="form.title"
            required
            maxlength="80"
            placeholder="Например: Sultan"
          />
        </label>

        <div class="form-row">
          <label>
            Категория
            <select v-model="form.category">
              <option
                v-for="category in categories.slice(1)"
                :key="category"
              >
                {{ category }}
              </option>
            </select>
          </label>

          <label>
            Город
            <select v-model="form.city">
              <option>Los Santos</option>
              <option>San Fierro</option>
              <option>Las Venturas</option>
            </select>
          </label>
        </div>

        <div class="form-row">
          <label>
            Цена
            <input
              v-model="form.price"
              type="number"
              min="0"
              placeholder="1500000"
            />
          </label>

          <label>
            Игровой ник
            <input
              v-model="form.seller"
              required
              maxlength="32"
              placeholder="Nick_Name"
            />
          </label>
        </div>

        <label>
          Контакт
          <input
            v-model="form.contact"
            required
            maxlength="40"
            placeholder="555-1234 или игровой ник"
          />
        </label>

        <label>
          Описание
          <textarea
            v-model="form.description"
            rows="4"
            maxlength="500"
            placeholder="Расскажите подробнее..."
          ></textarea>
        </label>

        <button class="btn btn-primary submit" type="submit">
          Отправить на проверку
        </button>
      </form>
    </div>

    <!-- MEDIA LOGIN -->
    <div
      v-if="showMediaLogin"
      class="modal-backdrop"
      @click.self="showMediaLogin = false"
    >
      <form
        class="modal media-modal"
        @submit.prevent="mediaLogin"
      >
        <div class="modal-head">
          <div>
            <div class="section-kicker">
              ЗАКРЫТЫЙ РАЗДЕЛ
            </div>
            <h2>Панель СМИ</h2>
          </div>

          <button
            type="button"
            class="close"
            @click="showMediaLogin = false"
          >
            ×
          </button>
        </div>

        <p class="modal-description">
          Доступ предназначен только для сотрудников,
          ответственных за модерацию объявлений.
        </p>

        <label>
          Логин
          <input
            v-model="login.username"
            autocomplete="username"
            placeholder="Введите логин"
          />
        </label>

        <label>
          Пароль
          <input
            v-model="login.password"
            type="password"
            autocomplete="current-password"
            placeholder="Введите пароль"
          />
        </label>

        <div v-if="mediaError" class="login-error">
          {{ mediaError }}
        </div>

        <button class="btn btn-primary submit" type="submit">
          Войти в панель
        </button>

        <div class="dev-hint">
          Тестовый доступ: <b>admin</b> / <b>123456</b>
        </div>
      </form>
    </div>

    <!-- MEDIA PANEL -->
    <div
      v-if="showMediaPanel"
      class="modal-backdrop panel-backdrop"
    >
      <section class="media-panel">
        <div class="panel-header">
          <div>
            <div class="section-kicker">
              MEDIA CONTROL
            </div>
            <h2>Панель модерации</h2>
          </div>

          <div class="panel-actions">
            <span class="logged-user">
              {{ mediaUser }}
            </span>

            <button
              class="btn btn-secondary"
              @click="logoutMedia"
            >
              Выйти
            </button>
          </div>
        </div>

        <div class="stats">
          <div class="stat-box">
            <strong>{{ ads.length }}</strong>
            <span>Всего</span>
          </div>

          <div class="stat-box orange">
            <strong>{{ pendingAds.length }}</strong>
            <span>На проверке</span>
          </div>

          <div class="stat-box green">
            <strong>
              {{ ads.filter(a => a.status === "approved").length }}
            </strong>
            <span>Одобрено</span>
          </div>

          <div class="stat-box red">
            <strong>
              {{ ads.filter(a => a.status === "rejected").length }}
            </strong>
            <span>Отклонено</span>
          </div>
        </div>

        <div class="panel-section">
          <div class="panel-section-head">
            <div>
              <div class="section-kicker">
                MODERATION QUEUE
              </div>
              <h3>Объявления на проверке</h3>
            </div>

            <span class="result-count">
              {{ pendingAds.length }} ожидает
            </span>
          </div>

          <div
            v-if="pendingAds.length"
            class="moderation-list"
          >
            <article
              v-for="ad in pendingAds"
              :key="ad.id"
              class="moderation-card"
            >
              <div class="moderation-main">
                <div class="card-top">
                  <span class="tag">{{ ad.category }}</span>
                  <span class="date">{{ ad.createdAt }}</span>
                </div>

                <h3>{{ ad.title }}</h3>

                <div class="moderation-price">
                  {{ money(ad.price) }}
                </div>

                <p>{{ ad.description }}</p>

                <div class="moderation-meta">
                  <span>👤 {{ ad.seller }}</span>
                  <span>📍 {{ ad.city }}</span>
                  <span>☎ {{ ad.contact }}</span>
                </div>
              </div>

              <div class="moderation-actions">
                <button
                  class="action-approve"
                  @click="approveAd(ad)"
                >
                  ✓ Одобрить
                </button>

                <button
                  class="action-reject"
                  @click="rejectAd(ad)"
                >
                  × Отклонить
                </button>
              </div>
            </article>
          </div>

          <div v-else class="empty panel-empty">
            Новых объявлений на проверке нет.
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
