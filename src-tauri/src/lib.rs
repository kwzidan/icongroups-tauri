use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, CheckMenuItemBuilder},
    tray::TrayIconBuilder,
    Manager, Runtime,
};
use tauri_plugin_autostart::ManagerExt;

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
        let script = format!(
            "Add-Type -AssemblyName System.Drawing; \
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

    let _window = tauri::WebviewWindowBuilder::new(
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
            // Check current autostart state
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
                    "quit" => {
                        app.exit(0);
                    }
                    "add_circle" => {
                        create_group_window(app.clone(), "circle".into());
                    }
                    "add_line" => {
                        create_group_window(app.clone(), "line".into());
                    }
                    "add_vertical" => {
                        create_group_window(app.clone(), "vertical".into());
                    }
                    "autostart" => {
                        let autolaunch = app.autolaunch();
                        let enabled = autolaunch.is_enabled().unwrap_or(false);
                        if enabled {
                            let _ = autolaunch.disable();
                        } else {
                            let _ = autolaunch.enable();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![open_path, create_group_window, get_file_icon])
        .on_window_event(|window, event| {
            // Prevent Win+D from minimizing the group windows
            if let tauri::WindowEvent::Focused(false) = event {
                // Small delay to let Windows finish the minimize action, then restore
                let win = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(80));
                    if win.is_minimized().unwrap_or(false) {
                        let _ = win.unminimize();
                    }
                });
            }
        })
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
