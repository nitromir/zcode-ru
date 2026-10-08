# Обслуживание русификатора ZCode

Эта инструкция предназначена для человека или ИИ-агента, который обновляет перевод после выхода новой версии ZCode и собирает новый установщик.

## Если ZCode обновился

1. Полностью закройте ZCode. При включённом сворачивании в трей проверьте, что процесс действительно завершён:

~~~powershell
Get-Process -Name ZCode -ErrorAction SilentlyContinue
~~~

Если процесс остался, закройте приложение через меню трея или завершите только процессы ZCode перед патчингом.

2. Узнайте новую версию и путь установки. Обычно используются:

~~~text
C:\Program Files\ZCode
C:\Users\<пользователь>\AppData\Local\Programs\ZCode
~~~

Внутри каталога должен находиться resources\app.asar. Рядом после первого применения патча появляется app.asar.original — это чистый архив, от которого нужно начинать повторное патчирование.

3. Получите свежий словарь из новой версии. Извлеките из app.asar.original файл вида:

~~~text
out/renderer/assets/IntlProvider-<хэш>.js
~~~

В нём ищите карту локалей с ключами zh-CN и en-US и объект английского словаря. Новые ключи добавьте в ru.json. Если русского перевода пока нет, оставьте английский оригинал как временный фолбэк.

4. Проверьте патчер на новой структуре:

~~~powershell
cd C:\путь\к\zcode-ru
node .\patch.mjs "C:\Program Files\ZCode" --check
~~~

Если проверка не проходит, не заменяйте рабочий app.asar вслепую. Сначала исправьте поиск файла и объекта в patch.mjs, затем проверьте копию app.asar в отдельном временном каталоге.

5. После успешной проверки примените патч, запустите ZCode и проверьте оба сценария: открыть старый тред и создать новую задачу. При белом экране, ошибке P is not defined или невозможности подключиться немедленно откатите app.asar из app.asar.original и разберите новую сборку отдельно.

## Куда смотреть ИИ-агенту

| Что проверять | Файл или место | Зачем |
| --- | --- | --- |
| Словарь | ru.json | Переводы по ключам en-US. Не менять имена ключей. |
| Патчинг | patch.mjs | Поиск IntlProvider, замена английского объекта, упаковка ASAR. |
| Ручной запуск | patch-zcode-language.ps1 | Остановка/проверка процессов и запуск patch.mjs. |
| Графический установщик | src/ZCodeRUSetup.cs | Извлечение payload и вызов патчера. |
| Состав EXE | src/build.ps1 | Список файлов, попадающих в payload и Portable.zip. |
| Провайдеры | providers.config.example.json | Только справочный пример API-провайдеров; пользовательский конфиг не переписывать. |
| Документация | README.md | Ссылка на последний релиз и базовая установка. |

В новой версии ZCode первым делом сравнивайте следующие признаки:

~~~text
out/renderer/assets/IntlProvider-*.js
zh-CN
en-US
app.asar.unpacked
node-pty
conpty
winpty
~~~

Нельзя терять содержимое app.asar.unpacked. В ZCode 3.14 там находятся нативные файлы, и упаковка их внутрь app.asar может сделать приложение незапускаемым.

Быстрый поиск по исходникам русификатора:

~~~powershell
rg -n "IntlProvider|zh-CN|en-US|app.asar.unpacked|createPackageFromStreams|node --check" patch.mjs src README.md
rg -n "placeholder|settings.locale|sidebar.settings.locale" ru.json patch.mjs
~~~

## Правила исправления перевода

Сначала найдите английский оригинал в app.asar.original, затем исправляйте русскую строку. Не переводите технические части строки:

- {version}, {name} и другие плейсхолдеры должны остаться с теми же именами;
- конструкции ${value}, %s, %d и похожие параметры должны сохраниться;
- HTML, Markdown, ссылки, backticks и имена команд должны остаться валидными;
- скобки, кавычки и двоеточия должны быть сбалансированы;
- не смешивайте английский текст и русский плейсхолдер в одной технической конструкции.

Правильно:

~~~json
"update.toast.upToDate": "У вас последняя версия (v{version})"
~~~

Неправильно:

~~~text
You're on the latest версия (v{версия})
~~~

После правок проверьте JSON и плейсхолдеры до сборки:

~~~powershell
node --check .\patch.mjs
Get-Content .\ru.json -Raw | ConvertFrom-Json | Out-Null
rg -n "\{[а-яА-ЯЁё]" .\ru.json
git diff --check
~~~

Последняя команда поиска не должна вывести строки. Если вывод есть, имя плейсхолдера было переведено и приложение может упасть или показать неверное значение.

## Что установить для сборки EXE

На Windows x64 нужны:

- Node.js 22.12 или новее;
- npm из поставки Node.js;
- PowerShell;
- C# compiler csc.exe из .NET Framework 4.x или доступный в PATH;
- 7-Zip с 7z.exe в PATH либо в C:\Program Files\7-Zip;
- права записи в каталог репозитория и права администратора для установки патча;
- закрытый ZCode только на время патчинга.

Зависимости Node уже лежат в node_modules. Если их нет, build.ps1 выполнит npm install и использует package-lock.json.

Сборка:

~~~powershell
cd C:\путь\к\zcode-ru\src
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
~~~

Результат:

~~~text
bin/ZCode-RU-Setup.exe
bin/ZCode-RU-Portable.zip
~~~

Файл TRANSLATION_MAINTENANCE.md включается в payload установщика и в Portable.zip. Поэтому получатель EXE имеет инструкцию для следующего обновления без клонирования репозитория.

Перед публикацией релиза проверьте наличие инструкции в архиве:

~~~powershell
7z l .\bin\ZCode-RU-Portable.zip | rg "TRANSLATION_MAINTENANCE.md"
Get-FileHash .\bin\ZCode-RU-Setup.exe -Algorithm SHA256
Get-FileHash .\bin\ZCode-RU-Portable.zip -Algorithm SHA256
~~~

Не включайте в релиз credentials.json, API-ключи, логи, пользовательский каталог .zcode или рабочий app.asar. providers.config.example.json — только пример с фиктивными значениями.

## Выпуск новой версии

1. Обновите ru.json, patch.mjs и документацию.
2. Запустите проверки из этой инструкции.
3. Соберите EXE и Portable.zip.
4. Проверьте установку на чистом app.asar.original.
5. Закоммитьте исходники и бинарники, затем создайте новый тег релиза.
6. В описании релиза укажите версию ZCode, список исправлений и SHA256 обоих файлов.

Ссылка в README ведёт на latest/download, поэтому после публикации нового релиза она автоматически указывает на самый свежий установщик.
