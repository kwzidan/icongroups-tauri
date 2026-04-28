use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, CheckMenuItemBuilder},
    tray::TrayIconBuilder,
    Manager, Runtime,
};
use tauri_plugin_autostart::ManagerExt;
use std::sync::OnceLock;

#[cfg(target_os = "windows")]
use windows::{
    core::w,
    Win32::Foundation::{HWND, LPARAM, BOOL},
    Win32::UI::WindowsAndMessaging::{
        FindWindowW, FindWindowExW, SendMessageW, SetParent, 
        GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_TOOLWINDOW,
        EnumWindows, GetClassNameW
    },
};

static WORKERW_HWND: OnceLock<Option<usize>> = OnceLock::new();

#[cfg(target_os = "windows")]
unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let mut class_name = [0u16; 256];
    let len = GetClassNameW(hwnd, &mut class_name);
    let name = String::from_utf16_lossy(&class_name[..len as usize]);
    
    if name == "WorkerW" {
        let shell_view = FindWindowExW(hwnd, HWND(0), w!("SHELLDLL_DefView"), None);
        if shell_view.0 != 0 {
            // This is the WorkerW we want - the one behind the desktop icons
            let next_workerw = FindWindowExW(HWND(0), hwnd, w!("WorkerW"), None);
            if next_workerw.0 != 0 {
                *(lparam.0 as *mut HWND) = next_workerw;
                return BOOL(0); // Stop enumerating
            }
        }
    }
    BOOL(1) // Continue
}

#[cfg(target_os = "windows")]
fn find_desktop_workerw() -> Option<HWND> {
    unsafe {
        let progman = FindWindowW(w!("Progman"), None);
        // Send message to spawn WorkerW
        SendMessageW(progman, 0x052C, None, None);
        
        let mut workerw = HWND(0);
        let _ = EnumWindows(Some(enum_windows_proc), LPARAM(&mut workerw as *mut HWND as isize));
        
        if workerw.0 == 0 {
            // Fallback to progman if WorkerW not found
            Some(progman)
        } else {
            Some(workerw)
        }
    }
}

#[tauri::command]
fn glue_to_desktop<R: Runtime>(window: tauri::WebviewWindow<R>) {
    #[cfg(target_os = "windows")]
    {
        use tauri::Window;
        if let Ok(hwnd_ptr) = window.hwnd() {
            let hwnd = HWND(hwnd_ptr.0 as _);
            if let Some(desktop_hwnd) = find_desktop_workerw() {
                unsafe {
                    // Set as child of desktop
                    SetParent(hwnd, desktop_hwnd);
                    
                    // Hide from taskbar and switcher
                    let mut ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
                    ex_style |= WS_EX_TOOLWINDOW.0 as i32;
                    SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style);
                }
            }
        }
    }
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
    {
        Err("Only supported on Windows".into())
    }
}

#[tauri::command]
async fn get_file_icon(path: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        let safe_path = path.replace("'", "''");
        
        // Use PowerShell for now but with higher quality extraction if possible
        // To get 256x256 natively in Rust is a lot of GDI+ code.
        // Let's try to improve the PowerShell script to be sharper.
        let script = format!(
            "Add-Type -AssemblyName System.Drawing, System.Windows.Forms; \
$ico = [System.Drawing.Icon]::ExtractAssociatedIcon('{}'); \
$bmp = $ico.ToBitmap(); \
$ms = New-Object System.IO.MemoryStream; \
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); \
[Convert]::ToBase64String($ms.ToArray())",
            safe_path
        );
        let output = Command::new("powershell")
            .args(&["-NoProfile", "-NonInteractive", "-Command", &script])
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?;
        let b64 = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if b64.is_empty() {
            return Err("No icon".into());
        }
        Ok(format!("data:image/png;base64,{}", b64))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Windows only".into())
    }
}

#[tauri::command]
fn create_group_window<R: Runtime>(app: tauri::AppHandle<R>, layout: String) {
    let id = uuid::Uuid::new_v4().to_string();
    let label = format!("group_{}", id);

    let window = tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(format!("index.html?layout={}", layout).into()),
    )
    .title("IconGroup")
    .inner_size(800.0, 600.0)
    .transparent(true)
    .decorations(false)
    .shadow(false)
    .resizable(true)
    .skip_taskbar(true)
    .always_on_bottom(true)
    .build()
    .unwrap();

    // Glue it immediately
    glue_to_desktop(window);
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
            let autostart_manager = app.autolaunch();
            let is_autostart_enabled = autostart_manager.is_enabled().unwrap_or(false);

            let quit_i = MenuItemBuilder::with_id("quit", "إغلاق البرنامج").build(app)?;
            let add_circle_i = MenuItemBuilder::with_id("add_circle", "➕ مجموعة دائرية").build(app)?;
            let add_line_i = MenuItemBuilder::with_id("add_line", "➕ مجموعة أفقية").build(app)?;
            let add_vertical_i = MenuItemBuilder::with_id("add_vertical", "➕ مجموعة عمودية").build(app)?;
            let autostart_i = CheckMenuItemBuilder::with_id("autostart", "🚀 تشغيل مع بدء الويندوز")
                .checked(is_autostart_enabled)
                .build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&add_circle_i)
                .item(&add_line_i)
                .item(&add_vertical_i)
                .separator()
                .item(&autostart_i)
                .separator()
                .item(&quit_i)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("IconGroups")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => { app.exit(0); }
                    "add_circle" => { create_group_window(app.clone(), "circle".into()); }
                    "add_line" => { create_group_window(app.clone(), "line".into()); }
                    "add_vertical" => { create_group_window(app.clone(), "vertical".into()); }
                    "autostart" => {
                        let autolaunch = app.autolaunch();
                        if autolaunch.is_enabled().unwrap_or(false) {
                            let _ = autolaunch.disable();
                        } else {
                            let _ = autolaunch.enable();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            // Glue existing main window if it exists
            if let Some(main_win) = app.get_webview_window("main") {
                glue_to_desktop(main_win);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![open_path, create_group_window, get_file_icon, glue_to_desktop])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
