use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, CheckMenuItemBuilder},
    tray::TrayIconBuilder,
    Manager, Runtime,
};
use tauri_plugin_autostart::ManagerExt;
use std::collections::{HashMap, HashSet};
use std::sync::{OnceLock, Mutex};

// ── Icon cache ────────────────────────────────────────────────────────────────
fn icon_cache() -> &'static Mutex<HashMap<String, String>> {
    static C: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

// ── Our window HWNDs (for the WinEvent hook) ─────────────────────────────────
#[cfg(target_os = "windows")]
fn our_hwnds() -> &'static Mutex<HashSet<isize>> {
    static H: OnceLock<Mutex<HashSet<isize>>> = OnceLock::new();
    H.get_or_init(|| Mutex::new(HashSet::new()))
}

// ── WinEvent callback ──────────────────────────────────────────────────────────
#[cfg(target_os = "windows")]
unsafe extern "system" fn on_minimize_start(
    _hook: windows_sys::Win32::UI::Accessibility::HWINEVENTHOOK,
    event: u32,
    hwnd:  windows_sys::Win32::Foundation::HWND,
    _id_object: i32, _id_child: i32, _thread: u32, _time: u32,
) {
    // EVENT_SYSTEM_MINIMIZESTART is a WinEvent constant in WindowsAndMessaging
    use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_RESTORE};
    const EVENT_MINIMIZE: u32 = 0x0016; // EVENT_SYSTEM_MINIMIZESTART
    if event == EVENT_MINIMIZE {
        let is_ours = our_hwnds()
            .lock()
            .map(|s| s.contains(&(hwnd as isize)))
            .unwrap_or(false);
        if is_ours {
            ShowWindow(hwnd, SW_RESTORE);
        }
    }
}

// ── Install process-wide WinEvent hook ─────────────────────────────────────────
#[cfg(target_os = "windows")]
fn start_win_event_hook() {
    std::thread::spawn(|| unsafe {
        // SetWinEventHook / HWINEVENTHOOK live in Accessibility
        use windows_sys::Win32::UI::Accessibility::{
            SetWinEventHook, HWINEVENTHOOK,
        };
        // Message loop functions in WindowsAndMessaging
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetMessageW, TranslateMessage, DispatchMessageW, MSG,
        };
        const WINEVENT_OUTOFCONTEXT:  u32 = 0x0000;
        const EVENT_SYSTEM_MINIMIZE:  u32 = 0x0016; // EVENT_SYSTEM_MINIMIZESTART

        let _h: HWINEVENTHOOK = SetWinEventHook(
            EVENT_SYSTEM_MINIMIZE,
            EVENT_SYSTEM_MINIMIZE,
            std::ptr::null_mut(),
            Some(on_minimize_start),
            0, 0,
            WINEVENT_OUTOFCONTEXT,
        );

        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) != 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}

// ── Commands ──────────────────────────────────────────────────────────────────
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Err("Only supported on Windows".into())
}

#[tauri::command]
async fn get_file_icon(path: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(cache) = icon_cache().lock() {
            if let Some(hit) = cache.get(&path) {
                return Ok(hit.clone());
            }
        }

        use std::process::Command;
        use std::os::windows::process::CommandExt;

        let safe = path.replace('\'', "''");

        // Use SHGetImageList(SHIL_JUMBO=4) to get the same 256×256 icon that
        // Windows shows on the desktop.  Falls back to ExtractAssociatedIcon.
        let script = format!(r#"$p='{safe}';
Add-Type -AssemblyName System.Drawing;
Add-Type @'
using System;using System.Drawing;using System.Runtime.InteropServices;
public class NI {{
  [DllImport("shell32.dll",CharSet=CharSet.Auto)]
  public static extern IntPtr SHGetFileInfo(string p,uint a,ref SHFI fi,uint sz,uint fl);
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Auto)]
  public struct SHFI{{public IntPtr hIcon;public int iIcon;public uint Attr;
    [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string Name;
    [MarshalAs(UnmanagedType.ByValTStr,SizeConst=80)]public string Type;}}
  [DllImport("shell32.dll")]
  public static extern int SHGetImageList(int il,ref Guid riid,out IntPtr ppv);
  [DllImport("comctl32.dll")]
  public static extern IntPtr ImageList_GetIcon(IntPtr hIml,int i,int fl);
  [DllImport("user32.dll")]
  public static extern bool DestroyIcon(IntPtr h);
}}
'@
try {{
  $fi=New-Object NI+SHFI;
  NI::SHGetFileInfo($p,0,[ref]$fi,[Runtime.InteropServices.Marshal]::SizeOf($fi),0x4000)|Out-Null;
  $idx=$fi.iIcon;
  $riid=[Guid]"46EB5926-582E-4017-9FDF-E8998DAA0950";
  $ppv=[IntPtr]::Zero;
  [NI]::SHGetImageList(4,[ref]$riid,[ref]$ppv)|Out-Null;
  $h=[NI]::ImageList_GetIcon($ppv,$idx,1);
  if($h -eq [IntPtr]::Zero){{throw "no jumbo"}};
  $ico=[System.Drawing.Icon]::FromHandle($h);
  $bmp=$ico.ToBitmap();
  $ms=New-Object System.IO.MemoryStream;
  $bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png);
  $r=[Convert]::ToBase64String($ms.ToArray());
  [NI]::DestroyIcon($h);
  $r
}} catch {{
  $src=[System.Drawing.Icon]::ExtractAssociatedIcon($p);
  $bmp=$src.ToBitmap();
  $ms=New-Object System.IO.MemoryStream;
  $bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png);
  [Convert]::ToBase64String($ms.ToArray())
}}"#);

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
    .inner_size(400.0, 400.0)
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
        // Register HWND for the WinEvent hook
        if let Ok(hwnd) = win.hwnd() {
            if let Ok(mut set) = our_hwnds().lock() {
                set.insert(hwnd.0 as isize);
            }
        }
        // Re-apply after 600 ms to override any WebView2 style reset
        let win2 = win.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(600));
            apply_desktop_widget_style(&win2);
        });
    }
}

// ── Desktop widget style ──────────────────────────────────────────────────────
#[cfg(target_os = "windows")]
fn apply_desktop_widget_style<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    if let Ok(hwnd) = window.hwnd() {
        let hwnd = hwnd.0 as windows_sys::Win32::Foundation::HWND;
        unsafe {
            let ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
            // Add TOOLWINDOW + NOACTIVATE, remove APPWINDOW
            // TOOLWINDOW → excluded from Win+D "show desktop" sweep
            // removing APPWINDOW → not treated as a normal app window
            let new_ex = (ex | WS_EX_TOOLWINDOW as i32 | WS_EX_NOACTIVATE as i32)
                & !(WS_EX_APPWINDOW as i32);
            SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex);
            SetWindowPos(
                hwnd, HWND_BOTTOM, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );
        }
    }
}

// ── Polling fallback (catches any slip-through minimization) ──────────────────
fn start_anti_minimize_guard(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(25));
        for (_, win) in app.webview_windows() {
            let minimized = win.is_minimized().unwrap_or(false);
            let visible   = win.is_visible().unwrap_or(true);
            if minimized || !visible {
                #[cfg(target_os = "windows")]
                if let Ok(hwnd) = win.hwnd() {
                    let hwnd = hwnd.0 as windows_sys::Win32::Foundation::HWND;
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
                // Register main window HWND
                if let Ok(hwnd) = win.hwnd() {
                    if let Ok(mut set) = our_hwnds().lock() {
                        set.insert(hwnd.0 as isize);
                    }
                }
                // Re-apply after WebView2 finishes initialising
                let win2 = win.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(600));
                    apply_desktop_widget_style(&win2);
                });
            }

            // Install the WinEvent hook (intercepts minimize before it happens)
            #[cfg(target_os = "windows")]
            start_win_event_hook();

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
