import os
import subprocess

def create_shortcut():
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    bat_path = os.path.abspath("VERCHON_Terminal.bat")
    lnk_path = os.path.join(desktop, "VERCHON Vector Terminal.lnk")

    cmd_exe = os.path.join(os.environ.get("SystemRoot", "C:\\Windows"), "System32", "cmd.exe")
    ps_script = f'''
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("{lnk_path}")
$Shortcut.TargetPath = "{cmd_exe}"
$Shortcut.Arguments = '/c "{bat_path}"'
$Shortcut.WorkingDirectory = "{os.path.abspath('.')}"
$Shortcut.Description = "VERCHON Vector Swing Trading Terminal"
$Shortcut.Save()
'''
    result = subprocess.run(["powershell", "-Command", ps_script], capture_output=True, text=True)
    if os.path.exists(lnk_path):
        print(f"[OK] Created Desktop Shortcut: {lnk_path}")
    else:
        print(f"[!] Shortcut creation failed: {result.stderr}")

if __name__ == "__main__":
    create_shortcut()
