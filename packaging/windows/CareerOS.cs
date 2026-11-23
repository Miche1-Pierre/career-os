// Career OS launcher (Microsoft Store package): starts the app without a console window and opens it in the browser.
// Compiled by scripts/package-msix.mjs with the C# compiler that ships with Windows (.NET Framework 4):
//   csc /target:winexe /win32icon:career-os.ico /out:CareerOS.exe CareerOS.cs
//
// Package layout: CareerOS.exe, node\node.exe, app\ (prebuilt server, scripts\start-local.mjs…).
// The user's data and settings live in Documents\CareerOS (CAREER_OS_HOME): the package folder is read-only.
// start-local.mjs stops the app once no Career OS page has been open for a while (--idle-exit).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

static class Launcher
{
    static readonly object Gate = new object();
    static readonly Queue<string> Tail = new Queue<string>();

    [STAThread]
    static int Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string node = Path.Combine(root, "node", "node.exe");
        string app = Path.Combine(root, "app");
        string script = Path.Combine(app, "scripts", "start-local.mjs");
        string home = Environment.GetEnvironmentVariable("CAREER_OS_HOME"); // tests only
        if (string.IsNullOrEmpty(home)) home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "CareerOS");
        string logDir = Path.Combine(home, "data", "app");
        string logPath = Path.Combine(logDir, "career-os.log");

        StreamWriter log = null;
        try
        {
            Directory.CreateDirectory(logDir);
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

        if (!File.Exists(node) || !File.Exists(script))
        {
            Fail("Des fichiers de Career OS manquent. Réinstalle l'application depuis le Microsoft Store.");
            return 1;
        }

        ProcessStartInfo start = new ProcessStartInfo(node, "\"" + script + "\" --open --idle-exit")
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

        DataReceivedEventHandler write = (sender, e) =>
        {
            if (e.Data == null) return;
            lock (Gate)
            {
                Tail.Enqueue(e.Data);
                while (Tail.Count > 12) Tail.Dequeue();
                if (log != null)
                {
                    try { log.WriteLine(e.Data); } catch (Exception) { }
                }
            }
        };
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

    static void Fail(string message)
    {
        MessageBox.Show(message, "Career OS", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
