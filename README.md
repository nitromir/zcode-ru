# Русификатор ZCode (Z.ai / ChatGLM Desktop) 🇷🇺

[![Windows](https://img.shields.io/badge/Platform-Windows%20x64-blue.svg)](https://github.com/nitromir/zcode-ru)
[![ZCode Version](https://img.shields.io/badge/ZCode-3.14.x-green.svg)](https://github.com/nitromir/zcode-ru/releases)
[![Download Latest](https://img.shields.io/badge/Скачать-ZCode--RU--Setup.exe-brightgreen?logo=windows&style=for-the-badge)](https://github.com/nitromir/zcode-ru/releases/latest/download/ZCode-RU-Setup.exe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![YouTube Demo](https://img.shields.io/badge/YouTube-Демонстрация%20работы-red?logo=youtube)](https://youtu.be/TYX-9iIvH2U)

Русификатор для IDE/ассистента **ZCode** с графическим инсталлятором и чистой базой английского языка. Настройки пользователя не переписываются, фоновые задачи не создаются.

Протестировано и стабильно работает на **Windows 10 / 11 x64**.

---

## ⚡ Быстрое скачивание (1-Click Installer)

<div align="center">

# 👉 [📥 СКАЧАТЬ ИНСТАЛЛЯТОР: ZCode-RU-Setup.exe](https://github.com/nitromir/zcode-ru/releases/latest/download/ZCode-RU-Setup.exe) 👈

*Установщик (.exe) для Windows x64 • Размер: ~1.6 МБ • Требуется Node.js 22.12+*

</div>

---

## 📺 Видео демонстрации работы

Посмотрите краткое видео с демонстрацией установки и работы русифицированного ZCode:

[![Демонстрация работы русификатора ZCode](https://img.youtube.com/vi/TYX-9iIvH2U/maxresdefault.jpg)](https://youtu.be/TYX-9iIvH2U)

> 🔗 **Ссылка на видео:** [https://youtu.be/TYX-9iIvH2U](https://youtu.be/TYX-9iIvH2U)

---

## ✨ Ключевые особенности

- 🎯 **База перевода `en-US` без китайского:** Русификатор внедряется в английскую локаль. Словарь содержит 5036+ переводов; новые ключи ZCode 3.14, которых ещё нет в словаре, безопасно остаются на английском.
- 🔁 **Безопасное обновление:** после обновления ZCode патчер запускается вручную и отказывается работать, если структура новой версии неизвестна.
- 🖥️ **Автономный графический инсталлятор (EXE):** Простой и понятный интерфейс с автоопределением папки ZCode и кнопкой «Обзор...» для выбора нестандартного пути установки.
- ⚡ **Полная обратимость:** Возможность в один клик восстановить оригинальный файл `app.asar.original` и вернуть стандартный интерфейс.
- ⚙️ **Готовая интеграция провайдеров:** В комплект входит справочный конфиг `providers.config.example.json` для подключения кастомных OpenAI-compatible API (tokenrouter, Z.ai, BigModel).

---

## 📥 Быстрая установка

### Вариант 1: Через графический инсталлятор (Рекомендуется)

1. Перейдите в раздел **[Releases](https://github.com/nitromir/zcode-ru/releases)** и скачайте **`ZCode-RU-Setup.exe`**.
2. Запустите инсталлятор от имени Администратора.
3. Инсталлятор автоматически определит путь к ZCode (например, `C:\Program Files\ZCode` или `%LOCALAPPDATA%\Programs\ZCode`). Если программа установлена в другую папку — нажмите **«Обзор...»**.
4. Полностью закройте ZCode до запуска установки.
5. Нажмите кнопку **«✔ Установить русификатор»**.
6. Запустите ZCode и в **Settings → Language** выберите **English** — его подпись станет «Русский».

---

### Вариант 2: Через PowerShell (Консольный режим)

1. Клонируйте репозиторий или скачайте архив из раздела Releases:
   ```powershell
   git clone https://github.com/nitromir/zcode-ru.git
   cd zcode-ru
   ```
2. Запустите скрипт установки от имени Администратора:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\patch-zcode-language.ps1
   ```
3. Для указания нестандартной папки:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\patch-zcode-language.ps1 -InstallDir "D:\Apps\ZCode"
   ```

---

## 🔁 После обновления ZCode

Обновление заменяет `resources\app.asar`, поэтому перевод нужно применить заново:

1. Полностью закройте ZCode.
2. Запустите установщик или `patch-zcode-language.ps1` ещё раз.
3. Если новая версия изменила структуру локализации, патчер остановится с понятной ошибкой и не заменит архив.

Патчер не создаёт планировщик, скрытые фоновые процессы и не меняет `setting.json`.

---

## 🛠️ Команды управления и тихий режим

Инсталлятор поддерживает ключи командной строки для автоматизации:

```cmd
:: Тихая установка с автоматическим обнаружением
ZCode-RU-Setup.exe /silent

:: Тихая установка в заданный каталог
ZCode-RU-Setup.exe /silent /dir="D:\Custom\ZCode"

:: Проверка текущего статуса русификации (код возврата 0 = установлен)
ZCode-RU-Setup.exe /check

:: Откат к оригинальной версии программы
ZCode-RU-Setup.exe /revert
```

Через PowerShell:
```powershell
.\patch-zcode-language.ps1 -Check                 # Проверить статус
.\patch-zcode-language.ps1 -Revert                # Откатить app.asar
```

---

## 🔨 Сборка инсталлятора из исходников

Для самостоятельной сборки `ZCode-RU-Setup.exe` на Windows требуются Node.js 22.12+ и 7-Zip:

```powershell
cd src
powershell.exe -ExecutionPolicy Bypass -File .\build.ps1
```

Скрипт упакует словарь, зависимость `@electron/asar` и скрипты, затем скомпилирует `bin\ZCode-RU-Setup.exe` встроенным компилятором `csc.exe` (.NET Framework 4.5+). Установщик не подписан сертификатом; для прозрачности релиз содержит исходники и SHA-256.

---

## 📄 Лицензия

Распространяется под лицензией [MIT](LICENSE).
