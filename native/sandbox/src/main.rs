use serde::Deserialize;
use std::{fs, path::PathBuf};
#[derive(Deserialize)]
struct Policy { executable: String, args: Vec<String>, read_only: Vec<String>, writable: Vec<String>, cwd: String, container: String, #[serde(default)] profile: String }
// JS uses camelCase resource names; deny unknown or malformed launch policies.
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct WirePolicy { executable: String, args: Vec<String>, read_only: Vec<String>, writable: Vec<String>, cwd: String, container: String, #[serde(default)] profile: String }
fn run() -> Result<i32, Box<dyn std::error::Error>> {
    let filename = std::env::args().nth(1).ok_or("policy required")?;
    if filename == "--credential" { return credentials::run(); }
    let cleanup = filename == "--cleanup";
    let file = if cleanup { std::env::args().nth(2).ok_or("cleanup policy required")? } else { filename };
    let p: WirePolicy = serde_json::from_slice(&fs::read(file)?)?;
    let policy = Policy { executable: p.executable, args: p.args, read_only: p.read_only, writable: p.writable, cwd: p.cwd, container: p.container, profile: p.profile };
    if !policy.container.starts_with("Commerce.Plugin.") || !policy.container.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') { return Err("invalid container identity".into()); }
    #[cfg(windows)] if cleanup { return windows::cleanup(&policy); }
    #[cfg(not(windows))] if cleanup { return Ok(0); }
    for value in policy.read_only.iter().chain(policy.writable.iter()).chain([&policy.executable, &policy.cwd]) {
        if !PathBuf::from(value).is_absolute() { return Err("non-absolute sandbox path".into()); }
        let canonical = fs::canonicalize(value)?;
        #[cfg(not(windows))]
        if canonical != PathBuf::from(value) { return Err("non-canonical sandbox path".into()); }
        #[cfg(windows)]
        if !canonical.to_string_lossy().trim_start_matches("\\\\?\\").eq_ignore_ascii_case(value) { return Err("non-canonical sandbox path".into()); }
    }
    #[cfg(target_os = "macos")]
    {
        use std::os::unix::process::CommandExt;
        if policy.profile.is_empty() { return Err("sandbox profile required".into()); }
        let error = std::process::Command::new("/usr/bin/sandbox-exec").args(["-p", &policy.profile]).arg(&policy.executable).args(&policy.args).current_dir(&policy.cwd).exec();
        return Err(error.into());
    }
    #[cfg(windows)] { return windows::launch(&policy); }
    #[cfg(not(any(windows, target_os = "macos")))] { Err("SANDBOX_UNAVAILABLE".into()) }
}
fn main() { match run() { Ok(code) => std::process::exit(code), Err(error) => { eprintln!("SANDBOX_UNAVAILABLE: {error}"); std::process::exit(126); } } }
#[cfg(windows)] mod windows;
mod credentials;
