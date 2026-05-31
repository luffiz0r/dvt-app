const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let isQuittingForUpdate = false;

const APP_NAME = "DVT";
const APP_ID = "com.dvt.app";
const isDev = !app.isPackaged;

app.setName(APP_NAME);

if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}

Menu.setApplicationMenu(null);

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function blockDevTools(win) {
  if (!win || win.isDestroyed()) return;

  win.webContents.on("before-input-event", (event, input) => {
    const key = String(input.key || "").toLowerCase();

    if (key === "f12") {
      event.preventDefault();
      return;
    }

    if (input.control && input.shift && (key === "i" || key === "j" || key === "c")) {
      event.preventDefault();
      return;
    }

    if (input.control && key === "u") {
      event.preventDefault();
    }
  });

  win.webContents.on("devtools-opened", () => {
    win.webContents.closeDevTools();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0f1117",
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });

  blockDevTools(mainWindow);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function setupAutoUpdater() {
  if (isDev) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendToRenderer("update-status", {
      type: "checking",
      message: "Проверка обновлений..."
    });
  });

  autoUpdater.on("update-available", (info) => {
    sendToRenderer("update-status", {
      type: "available",
      version: info && info.version ? info.version : "",
      message: info && info.version
        ? `Доступно обновление ${info.version}. Идёт скачивание...`
        : "Доступно обновление. Идёт скачивание..."
    });
  });

  autoUpdater.on("update-not-available", () => {
    sendToRenderer("update-status", {
      type: "not-available",
      message: "Обновлений не найдено."
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress && progress.percent ? progress.percent : 0);

    if (mainWindow && !mainWindow.isDestroyed() && process.platform === "win32") {
      mainWindow.setProgressBar(percent / 100);
    }

    sendToRenderer("update-status", {
      type: "progress",
      percent,
      message: `Скачивание обновления: ${percent}%`
    });
  });

  autoUpdater.on("update-downloaded", async (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1);
    }

    sendToRenderer("update-status", {
      type: "downloaded",
      version: info && info.version ? info.version : "",
      message: "Обновление скачано. Нужен перезапуск приложения."
    });

    const result = await dialog.showMessageBox(mainWindow || undefined, {
      type: "info",
      title: "Обновление готово",
      message: "Новая версия DVT скачана",
      detail: "Нажми «Перезапустить сейчас», чтобы установить обновление.",
      buttons: ["Перезапустить сейчас", "Позже"],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });

    if (result.response === 0) {
      isQuittingForUpdate = true;
      autoUpdater.quitAndInstall(false, true);
    }
  });

  autoUpdater.on("error", (error) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1);
    }

    sendToRenderer("update-status", {
      type: "error",
      message: `Ошибка обновления: ${error && error.message ? error.message : "unknown"}`
    });
  });
}

function registerIpc() {
  ipcMain.handle("app:get-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("app:check-for-updates", async () => {
    if (isDev) {
      return {
        ok: false,
        dev: true,
        message: "В dev-режиме автообновление отключено."
      };
    }

    try {
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error && error.message ? error.message : "Ошибка проверки обновлений."
      };
    }
  });

  ipcMain.handle("app:install-update-now", async () => {
    if (isDev) {
      return {
        ok: false,
        dev: true
      };
    }

    isQuittingForUpdate = true;
    autoUpdater.quitAndInstall(false, true);

    return { ok: true };
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  setupAutoUpdater();

  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((error) => {
        sendToRenderer("update-status", {
          type: "error",
          message: `Ошибка проверки обновлений: ${error && error.message ? error.message : "unknown"}`
        });
      });
    }, 3000);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  if (!isQuittingForUpdate && mainWindow && !mainWindow.isDestroyed() && process.platform === "win32") {
    mainWindow.setProgressBar(-1);
  }
});

app.on("browser-window-created", (_event, win) => {
  blockDevTools(win);
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("devtools-opened", () => {
    contents.closeDevTools();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});