using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace ZCodeRUSetup
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // Command-line handling
            bool isSilent = false;
            bool isRevert = false;
            bool isCheck = false;
            string customDir = null;

            foreach (string arg in args)
            {
                string a = arg.Trim();
                if (a.Equals("/silent", StringComparison.OrdinalIgnoreCase) || a.Equals("/s", StringComparison.OrdinalIgnoreCase) || a.Equals("-s", StringComparison.OrdinalIgnoreCase))
                    isSilent = true;
                else if (a.Equals("/revert", StringComparison.OrdinalIgnoreCase) || a.Equals("-revert", StringComparison.OrdinalIgnoreCase))
                    isRevert = true;
                else if (a.Equals("/check", StringComparison.OrdinalIgnoreCase) || a.Equals("-check", StringComparison.OrdinalIgnoreCase))
                    isCheck = true;
                else if (a.StartsWith("/dir=", StringComparison.OrdinalIgnoreCase))
                    customDir = a.Substring(5).Trim('\"');
                else if (a.StartsWith("-dir=", StringComparison.OrdinalIgnoreCase))
                    customDir = a.Substring(5).Trim('\"');
            }

            if (isSilent)
            {
                RunSilent(customDir, isRevert, isCheck);
                return;
            }

            Application.Run(new MainForm(customDir));
        }

        static void RunSilent(string customDir, bool isRevert, bool isCheck)
        {
            string installDir = customDir;
            if (string.IsNullOrEmpty(installDir))
                installDir = InstallerEngine.DetectZCodeDir();

            if (string.IsNullOrEmpty(installDir) || !Directory.Exists(installDir))
            {
                Environment.Exit(1);
                return;
            }

            if (isCheck)
            {
                bool patched = InstallerEngine.CheckPatched(installDir);
                Environment.Exit(patched ? 0 : 2);
                return;
            }

            if (isRevert)
            {
                bool reverted = InstallerEngine.Revert(installDir, delegate(string s) {});
                Environment.Exit(reverted ? 0 : 1);
                return;
            }

            bool success = InstallerEngine.Install(installDir, delegate(string s) {});
            Environment.Exit(success ? 0 : 1);
        }
    }

    public class MainForm : Form
    {
        private TextBox txtPath;
        private Button btnBrowse;
        private Label lblStatusDetect;
        private CheckBox chkBackup;
        private Button btnInstall;
        private Button btnRevert;
        private Button btnCheck;
        private Button btnLaunch;
        private ProgressBar progressBar;
        private RichTextBox rtbLog;

        public MainForm(string initialDir)
        {
            InitializeComponent();
            LoadInitial(initialDir);
        }

        private void InitializeComponent()
        {
            this.Text = "Русификатор ZCode — установка";
            this.Size = new Size(720, 580);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
            this.BackColor = Color.FromArgb(246, 248, 250);

            // Header Panel
            Panel headerPanel = new Panel();
            headerPanel.Dock = DockStyle.Top;
            headerPanel.Height = 70;
            headerPanel.BackColor = Color.FromArgb(22, 27, 34);

            Label lblTitle = new Label();
            lblTitle.Text = "Русификатор для ZCode (Z.ai / ChatGLM)";
            lblTitle.Font = new Font("Segoe UI", 12.5F, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(20, 12);
            lblTitle.AutoSize = true;

            Label lblSubtitle = new Label();
            lblSubtitle.Text = "Версия 3.14.x • База en-US • Резервная копия и безопасная проверка";
            lblSubtitle.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular);
            lblSubtitle.ForeColor = Color.FromArgb(139, 148, 158);
            lblSubtitle.Location = new Point(21, 40);
            lblSubtitle.AutoSize = true;

            headerPanel.Controls.Add(lblTitle);
            headerPanel.Controls.Add(lblSubtitle);
            this.Controls.Add(headerPanel);

            // Main Container
            Panel mainPanel = new Panel();
            mainPanel.Location = new Point(18, 80);
            mainPanel.Size = new Size(668, 450);
            this.Controls.Add(mainPanel);

            // Group 1: Folder Selection
            GroupBox grpPath = new GroupBox();
            grpPath.Text = " Папка с установленной программой ZCode ";
            grpPath.Location = new Point(0, 0);
            grpPath.Size = new Size(668, 85);
            grpPath.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            grpPath.ForeColor = Color.FromArgb(36, 41, 47);

            txtPath = new TextBox();
            txtPath.Location = new Point(15, 26);
            txtPath.Size = new Size(535, 23);
            txtPath.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            txtPath.TextChanged += delegate(object s, EventArgs e) { ValidatePath(); };

            btnBrowse = new Button();
            btnBrowse.Text = "Обзор...";
            btnBrowse.Location = new Point(560, 24);
            btnBrowse.Size = new Size(92, 27);
            btnBrowse.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            btnBrowse.Click += BtnBrowse_Click;

            lblStatusDetect = new Label();
            lblStatusDetect.Location = new Point(15, 56);
            lblStatusDetect.AutoSize = true;
            lblStatusDetect.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular);

            grpPath.Controls.Add(txtPath);
            grpPath.Controls.Add(btnBrowse);
            grpPath.Controls.Add(lblStatusDetect);
            mainPanel.Controls.Add(grpPath);

            // Group 2: Options
            GroupBox grpOptions = new GroupBox();
            grpOptions.Text = " Параметры русификации ";
            grpOptions.Location = new Point(0, 95);
            grpOptions.Size = new Size(668, 52);
            grpOptions.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            grpOptions.ForeColor = Color.FromArgb(36, 41, 47);

            chkBackup = new CheckBox();
            chkBackup.Text = "Создать резервную копию оригинального пакета (app.asar.original)";
            chkBackup.Location = new Point(15, 22);
            chkBackup.AutoSize = true;
            chkBackup.Checked = true;
            chkBackup.Enabled = false;
            chkBackup.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular);

            grpOptions.Controls.Add(chkBackup);
            mainPanel.Controls.Add(grpOptions);

            // Action Buttons
            btnInstall = new Button();
            btnInstall.Text = "✔ Установить русификатор";
            btnInstall.Location = new Point(0, 192);
            btnInstall.Size = new Size(220, 36);
            btnInstall.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
            btnInstall.BackColor = Color.FromArgb(46, 160, 67);
            btnInstall.ForeColor = Color.White;
            btnInstall.FlatStyle = FlatStyle.Flat;
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Cursor = Cursors.Hand;
            btnInstall.Click += BtnInstall_Click;

            btnRevert = new Button();
            btnRevert.Text = "↺ Восстановить оригинал";
            btnRevert.Location = new Point(230, 192);
            btnRevert.Size = new Size(185, 36);
            btnRevert.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            btnRevert.BackColor = Color.FromArgb(235, 238, 242);
            btnRevert.ForeColor = Color.FromArgb(36, 41, 47);
            btnRevert.FlatStyle = FlatStyle.Flat;
            btnRevert.FlatAppearance.BorderColor = Color.FromArgb(209, 217, 224);
            btnRevert.Click += BtnRevert_Click;

            btnCheck = new Button();
            btnCheck.Text = "🔍 Проверить статус";
            btnCheck.Location = new Point(425, 192);
            btnCheck.Size = new Size(140, 36);
            btnCheck.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            btnCheck.BackColor = Color.FromArgb(235, 238, 242);
            btnCheck.ForeColor = Color.FromArgb(36, 41, 47);
            btnCheck.FlatStyle = FlatStyle.Flat;
            btnCheck.FlatAppearance.BorderColor = Color.FromArgb(209, 217, 224);
            btnCheck.Click += BtnCheck_Click;

            btnLaunch = new Button();
            btnLaunch.Text = "🚀 Запустить ZCode";
            btnLaunch.Location = new Point(575, 192);
            btnLaunch.Size = new Size(93, 36);
            btnLaunch.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular);
            btnLaunch.BackColor = Color.FromArgb(235, 238, 242);
            btnLaunch.ForeColor = Color.FromArgb(36, 41, 47);
            btnLaunch.FlatStyle = FlatStyle.Flat;
            btnLaunch.FlatAppearance.BorderColor = Color.FromArgb(209, 217, 224);
            btnLaunch.Click += delegate(object s, EventArgs e) { LaunchZCode(); };

            mainPanel.Controls.Add(btnInstall);
            mainPanel.Controls.Add(btnRevert);
            mainPanel.Controls.Add(btnCheck);
            mainPanel.Controls.Add(btnLaunch);

            // Progress bar
            progressBar = new ProgressBar();
            progressBar.Location = new Point(0, 236);
            progressBar.Size = new Size(668, 10);
            progressBar.Style = ProgressBarStyle.Continuous;
            mainPanel.Controls.Add(progressBar);

            // Log output
            rtbLog = new RichTextBox();
            rtbLog.Location = new Point(0, 252);
            rtbLog.Size = new Size(668, 195);
            rtbLog.ReadOnly = true;
            rtbLog.BackColor = Color.FromArgb(255, 255, 255);
            rtbLog.ForeColor = Color.FromArgb(36, 41, 47);
            rtbLog.Font = new Font("Consolas", 8.5F, FontStyle.Regular);
            rtbLog.BorderStyle = BorderStyle.FixedSingle;
            mainPanel.Controls.Add(rtbLog);
        }

        private void LoadInitial(string initialDir)
        {
            string dir = initialDir;
            if (string.IsNullOrEmpty(dir))
                dir = InstallerEngine.DetectZCodeDir();

            if (!string.IsNullOrEmpty(dir))
            {
                txtPath.Text = dir;
            }
            ValidatePath();
            AppendLog("Мастер русификации ZCode готов к работе.", Color.FromArgb(9, 105, 218));
            AppendLog("Укажите папку с программой (по умолчанию найдена автоматически) и нажмите 'Установить'.", Color.Gray);
        }

        private bool ValidatePath()
        {
            string path = txtPath.Text.Trim();
            if (string.IsNullOrEmpty(path))
            {
                lblStatusDetect.Text = "⚠ Путь не указан.";
                lblStatusDetect.ForeColor = Color.Red;
                btnInstall.Enabled = false;
                return false;
            }

            if (!Directory.Exists(path))
            {
                lblStatusDetect.Text = "⚠ Указанная папка не существует.";
                lblStatusDetect.ForeColor = Color.Red;
                btnInstall.Enabled = false;
                return false;
            }

            string asar = Path.Combine(path, "resources", "app.asar");
            string exe = Path.Combine(path, "ZCode.exe");

            if (File.Exists(exe) && File.Exists(asar))
            {
                lblStatusDetect.Text = "✓ ZCode найден и готов к русификации.";
                lblStatusDetect.ForeColor = Color.FromArgb(46, 160, 67);
                btnInstall.Enabled = true;
                return true;
            }
            else if (File.Exists(asar))
            {
                lblStatusDetect.Text = "✓ resources\\app.asar найден.";
                lblStatusDetect.ForeColor = Color.FromArgb(46, 160, 67);
                btnInstall.Enabled = true;
                return true;
            }
            else
            {
                lblStatusDetect.Text = "⚠ В этой папке не найден resources\\app.asar.";
                lblStatusDetect.ForeColor = Color.OrangeRed;
                btnInstall.Enabled = false;
                return false;
            }
        }

        private void BtnBrowse_Click(object sender, EventArgs e)
        {
            using (FolderBrowserDialog fbd = new FolderBrowserDialog())
            {
                fbd.Description = "Выберите папку с установленной программой ZCode:";
                fbd.ShowNewFolderButton = false;
                if (!string.IsNullOrEmpty(txtPath.Text) && Directory.Exists(txtPath.Text))
                    fbd.SelectedPath = txtPath.Text;

                if (fbd.ShowDialog() == DialogResult.OK)
                {
                    txtPath.Text = fbd.SelectedPath;
                    ValidatePath();
                }
            }
        }

        private void AppendLog(string message, Color color)
        {
            if (rtbLog.InvokeRequired)
            {
                rtbLog.Invoke(new Action(delegate { AppendLog(message, color); }));
                return;
            }
            rtbLog.SelectionStart = rtbLog.TextLength;
            rtbLog.SelectionLength = 0;
            rtbLog.SelectionColor = color;
            rtbLog.AppendText(message + "\n");
            rtbLog.SelectionColor = rtbLog.ForeColor;
            rtbLog.ScrollToCaret();
        }

        private void SetUIBusy(bool busy)
        {
            btnInstall.Enabled = !busy && ValidatePath();
            btnRevert.Enabled = !busy;
            btnCheck.Enabled = !busy;
            btnBrowse.Enabled = !busy;
            txtPath.Enabled = !busy;
            progressBar.Style = busy ? ProgressBarStyle.Marquee : ProgressBarStyle.Continuous;
            if (!busy) progressBar.Value = 0;
        }

        private void BtnInstall_Click(object sender, EventArgs e)
        {
            string targetDir = txtPath.Text.Trim();
            if (!ValidatePath()) return;

            SetUIBusy(true);
            AppendLog("\n--- Начало установки русификатора ---", Color.Black);

            Thread t = new Thread(delegate()
            {
                bool ok = InstallerEngine.Install(
                    targetDir,
                    delegate(string msg) { AppendLog(msg, Color.FromArgb(36, 41, 47)); }
                );

                this.Invoke(new Action(delegate
                {
                    SetUIBusy(false);
                    if (ok)
                    {
                        AppendLog("✔ Установка успешно завершена! ZCode готов к использованию на русском языке.", Color.FromArgb(46, 160, 67));
                        MessageBox.Show("Русификатор успешно установлен!\n\nОткройте Settings -> Language и выберите English (подпись переведена как «Русский»).", "Успешно", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    else
                    {
                        AppendLog("❌ Произошла ошибка во время установки. См. подробности в логе выше.", Color.Red);
                        MessageBox.Show("Во время установки произошла ошибка. Проверьте лог в окне программы.", "Ошибка", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }));
            });
            t.IsBackground = true;
            t.Start();
        }

        private void BtnRevert_Click(object sender, EventArgs e)
        {
            string targetDir = txtPath.Text.Trim();
            if (!ValidatePath()) return;

            if (MessageBox.Show("Восстановить оригинальный файл app.asar?", "Подтверждение", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
                return;

            SetUIBusy(true);
            AppendLog("\n--- Восстановление оригинала ---", Color.Black);

            Thread t = new Thread(delegate()
            {
                bool ok = InstallerEngine.Revert(targetDir, delegate(string msg) { AppendLog(msg, Color.FromArgb(36, 41, 47)); });
                this.Invoke(new Action(delegate
                {
                    SetUIBusy(false);
                    if (ok)
                    {
                        AppendLog("✔ Оригинальные файлы успешно восстановлены.", Color.FromArgb(46, 160, 67));
                        MessageBox.Show("Оригинальная версия восстановлена.", "Восстановление", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    else
                    {
                        AppendLog("❌ Не удалось восстановить оригинал.", Color.Red);
                    }
                }));
            });
            t.IsBackground = true;
            t.Start();
        }

        private void BtnCheck_Click(object sender, EventArgs e)
        {
            string targetDir = txtPath.Text.Trim();
            if (!ValidatePath()) return;

            AppendLog("\n--- Проверка состояния ---", Color.Black);
            bool isPatched = InstallerEngine.CheckPatched(targetDir);

            AppendLog("Папка ZCode: " + targetDir, Color.Black);
            AppendLog("Статус русификации (RU en-US): " + (isPatched ? "✔ Установлен" : "❌ Не установлен"), isPatched ? Color.FromArgb(46, 160, 67) : Color.Red);
        }

        private void LaunchZCode()
        {
            string dir = txtPath.Text.Trim();
            string exe = Path.Combine(dir, "ZCode.exe");
            if (File.Exists(exe))
            {
                try
                {
                    Process.Start(new ProcessStartInfo(exe) { WorkingDirectory = dir });
                }
                catch (Exception ex)
                {
                    MessageBox.Show("Ошибка запуска ZCode: " + ex.Message);
                }
            }
            else
            {
                MessageBox.Show("Исполняемый файл ZCode.exe не найден в " + dir);
            }
        }
    }

    public static class InstallerEngine
    {
        public static string DetectZCodeDir()
        {
            // 1. Check running process
            try
            {
                Process[] procs = Process.GetProcessesByName("ZCode");
                if (procs.Length > 0 && !string.IsNullOrEmpty(procs[0].MainModule.FileName))
                {
                    return Path.GetDirectoryName(procs[0].MainModule.FileName);
                }
            }
            catch {}

            // 2. Standard directory candidates
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);

            string[] candidates = new string[]
            {
                Path.Combine(programFiles, "ZCode"),
                Path.Combine(localAppData, "Programs", "ZCode"),
                Path.Combine(programFilesX86, "ZCode")
            };

            foreach (string c in candidates)
            {
                if (Directory.Exists(c) && File.Exists(Path.Combine(c, "ZCode.exe")))
                    return c;
            }

            foreach (string c in candidates)
            {
                if (Directory.Exists(c) && File.Exists(Path.Combine(c, "resources", "app.asar")))
                    return c;
            }

            return "";
        }

        public static bool CheckPatched(string installDir)
        {
            string toolsDir = GetToolsDir();
            string patchMjs = Path.Combine(toolsDir, "patch.mjs");
            if (!File.Exists(patchMjs)) return false;

            string stdout, stderr;
            int exitCode = RunProcess("node.exe", "\"" + patchMjs + "\" \"" + installDir + "\" --check", out stdout, out stderr);
            return exitCode == 0;
        }

        public static string GetToolsDir()
        {
            string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string dir = Path.Combine(userProfile, ".zcode", "zcode-ru");
            if (!Directory.Exists(dir))
                Directory.CreateDirectory(dir);
            return dir;
        }

        public static bool ExtractPayload(string destDir, Action<string> log)
        {
            try
            {
                log("Извлечение компонентов русификатора в " + destDir + "...");
                Assembly assembly = Assembly.GetExecutingAssembly();
                string resourceName = null;
                foreach (string name in assembly.GetManifestResourceNames())
                {
                    if (name.EndsWith("zcode-ru-payload.zip", StringComparison.OrdinalIgnoreCase))
                    {
                        resourceName = name;
                        break;
                    }
                }

                if (string.IsNullOrEmpty(resourceName))
                {
                    log("Предупреждение: Встроенный архив ресурсов не найден, проверяется текущий каталог...");
                    return true;
                }

                using (Stream stream = assembly.GetManifestResourceStream(resourceName))
                using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Read))
                {
                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        string targetPath = Path.Combine(destDir, entry.FullName);
                        if (string.IsNullOrEmpty(entry.Name))
                        {
                            Directory.CreateDirectory(targetPath);
                        }
                        else
                        {
                            Directory.CreateDirectory(Path.GetDirectoryName(targetPath));
                            entry.ExtractToFile(targetPath, true);
                        }
                    }
                }
                log("Компоненты успешно извлечены.");
                return true;
            }
            catch (Exception ex)
            {
                log("Ошибка извлечения файлов: " + ex.Message);
                return false;
            }
        }

        public static bool Install(string installDir, Action<string> log)
        {
            try
            {
                string toolsDir = GetToolsDir();

                // 1. Require the user to close ZCode; never terminate processes.
                Process[] procs = Process.GetProcessesByName("ZCode");
                if (procs.Length > 0)
                {
                    log("Закройте ZCode полностью и запустите установку снова.");
                    return false;
                }

                // 2. Extract payload
                if (!ExtractPayload(toolsDir, log))
                    return false;

                // 3. Run patch.mjs
                log("Применение языкового патча на базе en-US (с защитой от китайских остатков)...");
                string patchMjs = Path.Combine(toolsDir, "patch.mjs");
                string dictPath = Path.Combine(toolsDir, "ru.json");

                string patchOut, patchErr;
                int exitCode = RunProcess("node.exe", "\"" + patchMjs + "\" \"" + installDir + "\" \"" + dictPath + "\"", out patchOut, out patchErr);
                if (!string.IsNullOrEmpty(patchOut))
                {
                    foreach (string line in patchOut.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
                    {
                        log("  " + line);
                    }
                }

                if (exitCode != 0)
                {
                    log("Ошибка: patch.mjs завершился с кодом " + exitCode + ": " + patchErr);
                    return false;
                }

                log("Настройки ZCode не менялись. После запуска выберите Settings -> Language -> English.");

                return true;
            }
            catch (Exception ex)
            {
                log("Критическая ошибка: " + ex.Message);
                return false;
            }
        }

        public static bool Revert(string installDir, Action<string> log)
        {
            try
            {
                string toolsDir = GetToolsDir();
                string patchMjs = Path.Combine(toolsDir, "patch.mjs");
                
                log("Восстановление app.asar из резервной копии...");
                string stdout, stderr;
                int exitCode = RunProcess("node.exe", "\"" + patchMjs + "\" \"" + installDir + "\" --revert", out stdout, out stderr);
                if (exitCode != 0)
                {
                    log("Ошибка восстановления: " + stderr);
                    return false;
                }

                log("Оригинальный пакет успешно восстановлен.");
                return true;
            }
            catch (Exception ex)
            {
                log("Ошибка: " + ex.Message);
                return false;
            }
        }

        private static int RunProcess(string fileName, string arguments, out string stdout, out string stderr)
        {
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            using (Process p = Process.Start(psi))
            {
                stdout = p.StandardOutput.ReadToEnd();
                stderr = p.StandardError.ReadToEnd();
                p.WaitForExit();
                return p.ExitCode;
            }
        }
    }
}
