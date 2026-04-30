use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, CheckMenuItemBuilder},
    tray::TrayIconBuilder,
    Manager, Runtime,
};
use tauri_plugin_autostart::ManagerExt;
use std::collections::HashMap;
use std::sync::{OnceLock, Mutex};

// ── Caches ────────────────────────────────────────────────────────────────────
fn icon_cache() -> &'static Mutex<HashMap<String, String>> {
    static C: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

// Store original WndProc per HWND so we can chain calls
fn old_procs() -> &'static Mutex<HashMap<isize, isize>> {
    static P: OnceLock<Mutex<HashMap<isize, isize>>> = OnceLock::new();
    P.get_or_init(|| Mutex::new(HashMap::new()))
}

// ── Window subclass — blocks SC_MINIMIZE and SIZE_MINIMIZED ──────────────────
#[cfg(target_os = "windows")]
unsafe extern "system" fn widget_wnd_proc(
    hwnd: windows_sys::Win32::Foundation::HWND,
    msg:  u32,
    wp:   usize,
    lp:   isize,
) -> isize {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    // Block minimize command (Win+D, taskbar click, etc.)
    if msg == WM_SYSCOMMAND && (wp & 0xFFF0) == SC_MINIMIZE as usize {
        return 0;
    }
    // If we somehow get minimised, restore immediately
    if msg == WM_SIZE && wp == SIZE_MINIMIZED as usize {
        ShowWindow(hwnd, SW_RESTORE);
        return 0;
    }

    // Chain to original proc
    let old = old_procs()
        .lock()
        .ok()
        .and_then(|m| m.get(&(hwnd as isize)).copied())
        .unwrap_or(0);

    if old != 0 {
        CallWindowProcW(
            Some(std::mem::transmute::<isize, unsafe extern "system" fn(*mut std::ffi::c_void, u32, usize, isize) -> isize>(old)),
            hwnd, msg, wp, lp,
        )
    } else {
        DefWindowProcW(hwnd, msg, wp, lp)
    }
}

// ── Apply desktop-widget window style ────────────────────────────────────────
#[cfg(target_os = "windows")]
fn apply_desktop_widget_style<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    if let Ok(hwnd_raw) = window.hwnd() {
        let hwnd = hwnd_raw.0 as windows_sys::Win32::Foundation::HWND;
        unsafe {
            // ① Style: TOOLWINDOW (excluded from Win+D) + NOACTIVATE, remove APPWINDOW
            let ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
            let new_ex = (ex | WS_EX_TOOLWINDOW as i32 | WS_EX_NOACTIVATE as i32)
                & !(WS_EX_APPWINDOW as i32);
            SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex);
            SetWindowPos(
                hwnd, HWND_BOTTOM, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );

            // ② Subclass WndProc so SC_MINIMIZE is blocked at message level
            let already = old_procs()
                .lock()
                .ok()
                .map(|m| m.contains_key(&(hwnd as isize)))
                .unwrap_or(false);
            if !already {
                let old = SetWindowLongPtrW(hwnd, GWLP_WNDPROC, widget_wnd_proc as isize);
                if let Ok(mut procs) = old_procs().lock() {
                    procs.insert(hwnd as isize, old);
                }
            }
        }
    }
}

// ── Polling fallback ──────────────────────────────────────────────────────────
fn start_anti_minimize_guard(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(50));
        for (_, win) in app.webview_windows() {
            let minimized = win.is_minimized().unwrap_or(false);
            let visible   = win.is_visible().unwrap_or(true);
            if minimized || !visible {
                #[cfg(target_os = "windows")]
                if let Ok(h) = win.hwnd() {
                    let hwnd = h.0 as windows_sys::Win32::Foundation::HWND;
                    unsafe {
                        windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(
                            hwnd,
                            windows_sys::Win32::UI::WindowsAndMessaging::SW_RESTORE,
                        );
                    }
                }
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_always_on_bottom(true);
                #[cfg(target_os = "windows")]
                apply_desktop_widget_style(&win);
            }
        }
    });
}

// ── Commands ──────────────────────────────────────────────────────────────────
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Err("Only supported on Windows".into())
}

#[tauri::command]
async fn get_file_icon(path: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        // Check Rust-side cache first (fast path, no PowerShell spawn)
        if let Ok(cache) = icon_cache().lock() {
            if let Some(hit) = cache.get(&path) {
                return Ok(hit.clone());
            }
        }

        use std::process::Command;
        use std::os::windows::process::CommandExt;

        let safe = path.replace('\'', "''");

        // Try SHGetImageList(SHIL_JUMBO=4) for 256×256 first.
        // Falls back to new Icon(path, 256, 256) for direct .ico loading,
        // then to ExtractAssociatedIcon for .exe/.lnk.
        let script = format!(r#"$p='{safe}';
Add-Type -AssemblyName System.Drawing;
Add-Type @'
using System;using System.Drawing;using System.Runtime.InteropServices;
public class WI{{
  [DllImport("shell32.dll",CharSet=CharSet.Auto)]
  public static extern IntPtr SHGetFileInfo(string p,uint a,ref SHI fi,uint sz,uint fl);
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Auto)]
  public struct SHI{{public IntPtr hIcon;public int iIcon;public uint Attr;
    [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string Name;
    [MarshalAs(UnmanagedType.ByValTStr,SizeConst=80)]public string Type;}}
  [DllImport("shell32.dll")]
  public static extern int SHGetImageList(int il,ref Guid g,out IntPtr ppv);
  [DllImport("comctl32.dll")]
  public static extern IntPtr ImageList_GetIcon(IntPtr hIml,int i,uint fl);
  [DllImport("user32.dll")]public static extern bool DestroyIcon(IntPtr h);
}}
'@
function Get-Base64([System.Drawing.Bitmap]$bmp){{
  $ms=New-Object System.IO.MemoryStream;
  $bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png);
  [Convert]::ToBase64String($ms.ToArray())
}}
$result=''
try{{
  $fi=New-Object WI+SHI;
  [WI]::SHGetFileInfo($p,0,[ref]$fi,[Runtime.InteropServices.Marshal]::SizeOf($fi),0x4100)|Out-Null;
  $idx=$fi.iIcon;
  $riid=[Guid]'46EB5926-582E-4017-9FDF-E8998DAA0950';
  $ppv=[IntPtr]::Zero;
  [WI]::SHGetImageList(4,[ref]$riid,[ref]$ppv)|Out-Null;
  if($ppv -ne [IntPtr]::Zero){{
    $h=[WI]::ImageList_GetIcon($ppv,$idx,1);
    if($h -ne [IntPtr]::Zero){{
      $ico=[System.Drawing.Icon]::FromHandle($h);
      $result=Get-Base64($ico.ToBitmap());
      [WI]::DestroyIcon($h);
    }}
  }}
}}catch{{}}
if($result -eq ''){{
  try{{
    $src=[System.Drawing.Icon]::ExtractAssociatedIcon($p);
    $result=Get-Base64($src.ToBitmap())
  }}catch{{}}
}}
$result"#);

        let out = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?;

        let b64 = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if b64.is_empty() { return Err("No icon".into()); }

        let data_url = format!("data:image/png;base64,{}", b64);
        if let Ok(mut cache) = icon_cache().lock() {
            cache.insert(path, data_url.clone());
        }
        Ok(data_url)
    }
    #[cfg(not(target_os = "windows"))]
    Err("Windows only".into())
}

#[tauri::command]
fn create_group_window<R: Runtime>(app: tauri::AppHandle<R>, layout: String) {
    let id    = uuid::Uuid::new_v4().to_string();
    let label = format!("group_{}", id);

    let win = tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(format!("index.html?layout={}", layout).into()),
    )
    .title("IconGroup- Kareem")
    .inner_size(260.0, 200.0)   // Small initial size — no giant invisible frame
    .transparent(true)
    .decorations(false)
    .shadow(false)
    .resizable(true)
    .skip_taskbar(true)
    .always_on_bottom(true)
    .build()
    .unwrap();

    #[cfg(target_os = "windows")]
    {
        apply_desktop_widget_style(&win);
        // Re-apply after WebView2 finishes initialising (may reset styles)
        let win2 = win.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(800));
            apply_desktop_widget_style(&win2);
        });
    }
}

// ── Entry point ───────────────────────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            #[cfg(target_os = "windows")]
            if let Some(win) = app.get_webview_window("main") {
                apply_desktop_widget_style(&win);
                let win2 = win.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(800));
                    apply_desktop_widget_style(&win2);
                });
            }

            let autostart_manager    = app.autolaunch();
            let is_autostart_enabled = autostart_manager.is_enabled().unwrap_or(false);

            let quit_i         = MenuItemBuilder::with_id("quit",        "إغلاق البرنامج").build(app)?;
            let add_circle_i   = MenuItemBuilder::with_id("add_circle",  "➕ مجموعة دائرية").build(app)?;
            let add_line_i     = MenuItemBuilder::with_id("add_line",    "➕ مجموعة أفقية").build(app)?;
            let add_vertical_i = MenuItemBuilder::with_id("add_vertical","➕ مجموعة عمودية").build(app)?;
            let add_dock_i     = MenuItemBuilder::with_id("add_dock",    "➕ مجموعة Dock").build(app)?;
            let autostart_i    = CheckMenuItemBuilder::with_id("autostart", "🚀 تشغيل مع بدء الويندوز")
                .checked(is_autostart_enabled)
                .build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&add_circle_i)
                .item(&add_line_i)
                .item(&add_vertical_i)
                .item(&add_dock_i)
                .separator()
                .item(&autostart_i)
                .separator()
                .item(&quit_i)
                .build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("IconGroup- Kareem")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit"         => app.exit(0),
                    "add_circle"   => create_group_window(app.clone(), "circle".into()),
                    "add_line"     => create_group_window(app.clone(), "line".into()),
                    "add_vertical" => create_group_window(app.clone(), "vertical".into()),
                    "add_dock"     => create_group_window(app.clone(), "dock".into()),
                    "autostart"    => {
                        let al = app.autolaunch();
                        if al.is_enabled().unwrap_or(false) { let _ = al.disable(); }
                        else { let _ = al.enable(); }
                    }
                    _ => {}
                })
                .build(app)?;

            start_anti_minimize_guard(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![open_path, create_group_window, get_file_icon])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_open_path_non_windows() {
        #[cfg(not(target_os = "windows"))]
        {
            let result = open_path("/tmp".into());
            assert!(result.is_err());
        }
    }
}
