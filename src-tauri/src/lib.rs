use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Manager, Runtime,
};
use std::sync::Arc;

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
fn create_group_window<R: Runtime>(app: tauri::AppHandle<R>, layout: String) {
    let id = uuid::Uuid::new_v4().to_string();
    let label = format!("group_{}", id);
    
    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(format!("index.html#layout={}", layout).into()),
    )
    .title("IconGroup")
    .inner_size(380.0, 380.0)
    .transparent(true)
    .decorations(false)
    .skip_taskbar(true)
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
            let quit_i = MenuItemBuilder::with_id("quit", "إغلاق البرنامج").build(app)?;
            let add_circle_i = MenuItemBuilder::with_id("add_circle", "إضافة مجموعة دائرية").build(app)?;
            let add_line_i = MenuItemBuilder::with_id("add_line", "إضافة مجموعة أفقية").build(app)?;
            let add_vertical_i = MenuItemBuilder::with_id("add_vertical", "إضافة مجموعة عمودية").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&add_circle_i)
                .item(&add_line_i)
                .item(&add_vertical_i)
                .separator()
                .item(&quit_i)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
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
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![open_path, create_group_window])
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

    // Note: Integration tests for commands usually require a mock app handle.
    // For now we just test that the logic compiles and basic unit tests work.
}
