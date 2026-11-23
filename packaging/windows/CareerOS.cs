// Career OS launcher (Microsoft Store package): starts the app without a console window and opens it in the browser.
// Compiled by scripts/package-msix.mjs with the C# compiler that ships with Windows (.NET Framework 4):
//   csc /target:winexe /win32icon:career-os.ico /out:CareerOS.exe CareerOS.cs
//
// Package layout: CareerOS.exe, node\node.exe, app.zip (the prebuilt app), app.version.
// The app ships as an archive because MSIX refuses file names with brackets, which the app's pages use ([id]…).
// Each new version is unpacked once into %LOCALAPPDATA%\CareerOS-Store\<version> (the package's private storage:
// Windows removes it with the app). The user's data and settings live in Documents\CareerOS (CAREER_OS_HOME).
// start-local.mjs stops the app once no Career OS page has been open for a while (--idle-exit).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

static class Launcher
{
    static readonly object Gate = new object();
    static readonly Queue<string> Tail = new Queue<string>();
    static StreamWriter log;

    [STAThread]
    static int Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string node = Path.Combine(root, "node", "node.exe");
        string archive = Path.Combine(root, "app.zip");
        string home = Environment.GetEnvironmentVariable("CAREER_OS_HOME"); // tests only
        if (string.IsNullOrEmpty(home)) home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "CareerOS");
        string runtime = Environment.GetEnvironmentVariable("CAREER_OS_RUNTIME_DIR"); // tests only
        if (string.IsNullOrEmpty(runtime)) runtime = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CareerOS-Store");
        string logPath = Path.Combine(home, "data", "app", "career-os.log");
        OpenLog(logPath);

        if (!File.Exists(node) || !File.Exists(archive) || !File.Exists(Path.Combine(root, "unpack.mjs")) || !File.Exists(Path.Combine(root, "app.version")))
        {
            Fail("Des fichiers de Career OS manquent. Réinstalle l'application depuis le Microsoft Store.");
            return 1;
        }

        string version = File.ReadAllText(Path.Combine(root, "app.version")).Trim();
        string app = Path.Combine(runtime, version);
        string error = Prepare(node, root, runtime, version, app);
        if (error != null)
        {
            Fail("Career OS n'a pas pu se préparer : " + error + Environment.NewLine + Environment.NewLine + "Journal : " + logPath);
            return 1;
        }

        ProcessStartInfo start = new ProcessStartInfo(node, "\"" + Path.Combine(app, "scripts", "start-local.mjs") + "\" --open --idle-exit")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = app,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        start.EnvironmentVariables["CAREER_OS_HOME"] = home;

        Process child;
        try
        {
            child = Process.Start(start);
        }
        catch (Exception e)
        {
            Fail("Career OS n'a pas pu démarrer : " + e.Message);
            return 1;
        }

        DataReceivedEventHandler write = (sender, e) => { if (e.Data != null) Log(e.Data); };
        child.OutputDataReceived += write;
        child.ErrorDataReceived += write;
        child.BeginOutputReadLine();
        child.BeginErrorReadLine();
        child.WaitForExit();
        child.WaitForExit(); // flushes the asynchronous readers

        int code = child.ExitCode;
        if (code != 0)
        {
            string details;
            lock (Gate) details = string.Join(Environment.NewLine, Tail.ToArray());
            Fail("Career OS s'est arrêté à cause d'une erreur." + Environment.NewLine + Environment.NewLine + details +
                 Environment.NewLine + Environment.NewLine + "Journal complet : " + logPath);
        }
        if (log != null) log.Dispose();
        return code;
    }

    /// <summary>Unpacks this version of the app once (a window shows progress); unpack.mjs also removes older versions.</summary>
    static string Prepare(string node, string root, string runtime, string version, string app)
    {
        string ready = Path.Combine(app, ".ready");
        if (File.Exists(ready)) return null;

        // Two launches at once: the second one waits for the first to finish unpacking.
        using (Mutex mutex = new Mutex(false, "Local\\CareerOS-Store-unpack"))
        {
            try { mutex.WaitOne(); } catch (AbandonedMutexException) { }
            try
            {
                if (File.Exists(ready)) return null;
                string error = null;
                Form form = Splash();
                Thread worker = new Thread(() =>
                {
                    try { error = Unpack(node, root, runtime, version); }
                    catch (Exception e) { error = e.Message; }
                    try { form.BeginInvoke((MethodInvoker)form.Close); } catch (Exception) { }
                });
                form.Shown += (s, e) => worker.Start();
                Application.Run(form);
                worker.Join();
                if (error == null && !File.Exists(ready)) error = "décompression inachevée";
                return error;
            }
            finally
            {
                mutex.ReleaseMutex();
            }
        }
    }

    // Node.js unpacks (unpack.mjs): it handles the paths longer than 260 characters that the app has once unpacked.
    static string Unpack(string node, string root, string runtime, string version)
    {
        Log("préparation de la version " + version);
        ProcessStartInfo info = new ProcessStartInfo(node, "\"" + Path.Combine(root, "unpack.mjs") + "\" \"" + Path.Combine(root, "app.zip") + "\" \"" + runtime + "\" \"" + version + "\"")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        using (Process p = Process.Start(info))
        {
            string stdout = null;
            Thread reader = new Thread(() => { stdout = p.StandardOutput.ReadToEnd(); });
            reader.Start();
            string stderr = p.StandardError.ReadToEnd();
            reader.Join();
            p.WaitForExit();
            if (!string.IsNullOrEmpty(stdout)) Log(stdout.Trim());
            if (p.ExitCode != 0)
            {
                Log(stderr.Trim());
                string[] lines = stderr.Trim().Split('\n');
                return "décompression impossible (" + p.ExitCode + ")" + (lines.Length > 0 ? " : " + lines[lines.Length - 1].Trim() : "");
            }
        }
        return null;
    }

    static Form Splash()
    {
        Form form = new Form
        {
            Text = "Career OS",
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = FormStartPosition.CenterScreen,
            ClientSize = new Size(380, 110),
            MaximizeBox = false,
            MinimizeBox = false,
            ControlBox = false,
            ShowInTaskbar = true,
            Font = new Font("Segoe UI", 10f),
        };
        try { form.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }
        Label label = new Label
        {
            Text = "Préparation de Career OS…\nUne seule fois par version, quelques secondes.",
            AutoSize = false,
            Location = new Point(20, 16),
            Size = new Size(340, 44),
        };
        ProgressBar bar = new ProgressBar
        {
            Style = ProgressBarStyle.Marquee,
            MarqueeAnimationSpeed = 30,
            Location = new Point(20, 70),
            Size = new Size(340, 18),
        };
        form.Controls.Add(label);
        form.Controls.Add(bar);
        return form;
    }

    static void OpenLog(string logPath)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(logPath));
            FileInfo previous = new FileInfo(logPath);
            bool fresh = !previous.Exists || previous.Length > 2 * 1024 * 1024;
            // One writer at a time: a second launch (the app already runs) just shows it and writes no log.
            FileStream stream = new FileStream(logPath, fresh ? FileMode.Create : FileMode.Append, FileAccess.Write, FileShare.Read);
            log = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true };
            log.WriteLine("--- " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " ---");
        }
        catch (Exception)
        {
            // Another launch is writing the log, or Documents is unavailable: run without a log.
        }
    }

    static void Log(string line)
    {
        lock (Gate)
        {
            Tail.Enqueue(line);
            while (Tail.Count > 12) Tail.Dequeue();
            if (log != null)
            {
                try { log.WriteLine(line); } catch (Exception) { }
            }
        }
    }

    static void Fail(string message)
    {
        Log(message);
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("CAREER_OS_NO_DIALOG"))) return; // automated tests
        MessageBox.Show(message, "Career OS", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
