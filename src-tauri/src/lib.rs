use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, CheckMenuItemBuilder},
    tray::TrayIconBuilder,
    Manager, Runtime,
};
use tauri_plugin_autostart::ManagerExt;
use std::collections::HashMap;
use std::sync::{OnceLock, Mutex};

fn icon_cache() -> &'static Mutex<HashMap<String, String>> {
    static C: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

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
        // Return cached value immediately if available
        {
            if let Ok(cache) = icon_cache().lock() {
                if let Some(hit) = cache.get(&path) {
                    return Ok(hit.clone());
                }
            }
        }

        use std::process::Command;
        use std::os::windows::process::CommandExt;

        // Use single-quoted PS string; escape embedded single-quotes by doubling them
        let safe = path.replace('\'', "''");

        // Extract a crisp 256×256 icon via ExtractAssociatedIcon.
        // Windows stores .exe/.lnk icons at up to 256px natively; drawing into
        // a 256px bitmap and saving as PNG gives pixel-perfect results.
        let script = format!(
            r#"$p='{safe}';
Add-Type -AssemblyName System.Drawing;
try {{
  $src = [System.Drawing.Icon]::ExtractAssociatedIcon($p);
  $bmp = New-Object System.Drawing.Bitmap(256,256);
  $g   = [System.Drawing.Graphics]::FromImage($bmp);
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality;
  $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;
  $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias;
  $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality;
  $g.DrawImage($src.ToBitmap(), 0, 0, 256, 256);
  $g.Dispose();
  $ms = New-Object System.IO.MemoryStream;
  $bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png);
  [Convert]::ToBase64String($ms.ToArray())
}} catch {{ '' }}"#
        );

        let out = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
            .map_err(|e| e.to_string())?;

        let b64 = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if b64.is_empty() {
            return Err("No icon".into());
        }

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
    .title("IconGroup")
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
    apply_desktop_widget_style(&win);
}

/// Set WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE on the window.
///
/// WS_EX_TOOLWINDOW is the key flag: Windows' "Show Desktop" (Win+D) command
/// does NOT minimize windows that carry this style, which is exactly what we want
/// for desktop widgets. Tauri's skip_taskbar() hides the taskbar button via the
/// ITaskbarList3 COM API instead, so it does NOT set WS_EX_TOOLWINDOW — we must
/// set it ourselves here.
#[cfg(target_os = "windows")]
fn apply_desktop_widget_style<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    if let Ok(hwnd) = window.hwnd() {
        // tauri::WebviewWindow::hwnd() returns windows::Win32::Foundation::HWND
        // whose .0 field (isize) is identical in representation to windows_sys HWND (isize).
        let hwnd = hwnd.0 as windows_sys::Win32::Foundation::HWND;
        unsafe {
            let ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
            SetWindowLongW(
                hwnd,
                GWL_EXSTYLE,
                ex | WS_EX_TOOLWINDOW as i32 | WS_EX_NOACTIVATE as i32,
            );
            // Keep pinned at the bottom of the Z-order without activating
            SetWindowPos(
                hwnd,
                HWND_BOTTOM,
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
    }
}

/// Belt-and-suspenders fallback: poll every 30 ms and restore any window that
/// somehow got minimized or hidden (e.g. Win+D on some Windows builds).
fn start_anti_minimize_guard(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(30));
        for (_, win) in app.webview_windows() {
            let minimized = win.is_minimized().unwrap_or(false);
            let visible   = win.is_visible().unwrap_or(true);
            if minimized || !visible {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_always_on_bottom(true);
                #[cfg(target_os = "windows")]
                apply_desktop_widget_style(&win);
            }
        }
    });
}

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
            // Apply desktop widget style to the main window as soon as it exists
            #[cfg(target_os = "windows")]
            if let Some(win) = app.get_webview_window("main") {
                apply_desktop_widget_style(&win);
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
                .tooltip("IconGroups")
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
            assert_eq!(result.unwrap_err(), "Only supported on Windows");
        }
    }
}
