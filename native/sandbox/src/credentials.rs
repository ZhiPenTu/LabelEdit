use serde::Deserialize;
use std::io::{self, Read};
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request { op: String, account: String, value: Option<String> }
pub fn run() -> Result<i32, Box<dyn std::error::Error>> {
    let mut input = String::new(); io::stdin().take(16384).read_to_string(&mut input)?;
    let request: Request = serde_json::from_str(&input)?;
    if !["set", "get", "clear"].contains(&request.op.as_str()) || request.account.len() > 256 || !request.account.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || ".:-".contains(c)) { return Err("invalid credential request".into()); }
    #[cfg(target_os = "macos")] let result = mac::execute(&request)?;
    #[cfg(windows)] let result = windows::execute(&request)?;
    #[cfg(not(any(target_os = "macos", windows)))] let result: Option<String> = return Err("credentials unavailable".into());
    println!("{}", serde_json::json!({"value": result})); Ok(0)
}
#[cfg(target_os = "macos")]
mod mac {
    use super::Request;
    use core_foundation_sys::{base::*, dictionary::*, string::*, data::*, number::*};
    use std::{ptr::null, ffi::{CString, c_void}};
    #[link(name = "Security", kind = "framework")]
    extern "C" {
        static kSecClass: CFStringRef; static kSecClassGenericPassword: CFStringRef;
        static kSecAttrService: CFStringRef; static kSecAttrAccount: CFStringRef;
        static kSecValueData: CFStringRef; static kSecReturnData: CFStringRef;
        fn SecItemAdd(query: CFDictionaryRef, result: *mut CFTypeRef) -> i32;
        fn SecItemCopyMatching(query: CFDictionaryRef, result: *mut CFTypeRef) -> i32;
        fn SecItemUpdate(query: CFDictionaryRef, attributes: CFDictionaryRef) -> i32;
        fn SecItemDelete(query: CFDictionaryRef) -> i32;
    }
    struct Owned(CFTypeRef); impl Drop for Owned { fn drop(&mut self) { if !self.0.is_null() { unsafe { CFRelease(self.0); } } } }
    unsafe fn string(value: &str) -> Owned { let text = CString::new(value).unwrap(); Owned(CFStringCreateWithCString(null(), text.as_ptr(), kCFStringEncodingUTF8) as CFTypeRef) }
    unsafe fn dictionary() -> Owned { Owned(CFDictionaryCreateMutable(null(), 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks) as CFTypeRef) }
    unsafe fn insert(dict: &Owned, key: CFStringRef, value: CFTypeRef) { CFDictionarySetValue(dict.0 as CFMutableDictionaryRef, key as *const c_void, value); }
    pub fn execute(r: &Request) -> Result<Option<String>, Box<dyn std::error::Error>> { unsafe {
        let query = dictionary(); let service = string("com.commerce.plugins"); let account = string(&r.account);
        insert(&query, kSecClass, kSecClassGenericPassword as CFTypeRef); insert(&query, kSecAttrService, service.0); insert(&query, kSecAttrAccount, account.0);
        let status;
        if r.op == "get" {
            insert(&query, kSecReturnData, kCFBooleanTrue as CFTypeRef); let mut value = null(); status = SecItemCopyMatching(query.0 as CFDictionaryRef, &mut value);
            let owned = Owned(value); if status == -25300 { return Ok(None); }
            if status != 0 { return Err(format!("keychain status {status}").into()); }
            let data = owned.0 as CFDataRef; let bytes = std::slice::from_raw_parts(CFDataGetBytePtr(data), CFDataGetLength(data) as usize); return Ok(Some(String::from_utf8(bytes.to_vec())?));
        } else if r.op == "clear" { status = SecItemDelete(query.0 as CFDictionaryRef); }
        else {
            let value = r.value.as_ref().ok_or("missing secret")?; if value.len() > 4096 { return Err("secret too large".into()); }
            let data = Owned(CFDataCreate(null(), value.as_ptr(), value.len() as isize) as CFTypeRef);
            let attributes = dictionary(); insert(&attributes, kSecValueData, data.0);
            let updated = SecItemUpdate(query.0 as CFDictionaryRef, attributes.0 as CFDictionaryRef);
            if updated == -25300 { insert(&query, kSecValueData, data.0); status = SecItemAdd(query.0 as CFDictionaryRef, std::ptr::null_mut()); } else { status = updated; }
        }
        if status != 0 && status != -25300 { return Err(format!("keychain status {status}").into()); } Ok(None)
    } }
}
#[cfg(windows)]
mod windows {
    use super::Request;
    use windows_sys::Win32::{Foundation::*, Security::Credentials::*};
    use std::{ptr::null_mut, mem::zeroed};
    pub fn execute(r: &Request) -> Result<Option<String>, Box<dyn std::error::Error>> { unsafe {
        let mut target: Vec<u16> = ("Commerce.Plugins/".to_string() + &r.account).encode_utf16().chain([0]).collect();
        if r.op == "get" { let mut credential = null_mut(); if CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) == 0 { if GetLastError() == ERROR_NOT_FOUND { return Ok(None); } return Err(std::io::Error::last_os_error().into()); }
            let bytes = std::slice::from_raw_parts((*credential).CredentialBlob, (*credential).CredentialBlobSize as usize).to_vec(); CredFree(credential as *const _); return Ok(Some(String::from_utf8(bytes)?)); }
        if r.op == "clear" { if CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) == 0 && GetLastError() != ERROR_NOT_FOUND { return Err(std::io::Error::last_os_error().into()); } return Ok(None); }
        let value = r.value.as_ref().ok_or("missing secret")?; if value.len() > 4096 { return Err("secret too large".into()); }
        let mut credential: CREDENTIALW = zeroed(); credential.Type = CRED_TYPE_GENERIC; credential.TargetName = target.as_mut_ptr(); credential.CredentialBlobSize = value.len() as u32; credential.CredentialBlob = value.as_ptr() as *mut u8; credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
        if CredWriteW(&credential, 0) == 0 { return Err(std::io::Error::last_os_error().into()); } Ok(None)
    } }
}
