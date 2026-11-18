//! Dependency-free native operations for PLOT Studio workflow nodes.
use std::env;
use std::io::{self, Read, Write};
use std::process::ExitCode;

const LIMIT: u64 = 256_000;

fn fnv1a(bytes: &[u8]) -> String {
    let fingerprint = bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    });
    format!("{fingerprint:016x}")
}

fn crc32(bytes: &[u8]) -> String {
    let checksum = bytes.iter().fold(!0_u32, |state, byte| {
        let mut current = state ^ u32::from(*byte);
        for _ in 0..8 {
            current = (current >> 1) ^ if current & 1 == 1 { 0xedb88320 } else { 0 };
        }
        current
    });
    format!("{:08x}", !checksum)
}

fn slug(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut separated = false;
    for character in text.chars() {
        if character.is_ascii_alphanumeric() {
            if separated && !result.is_empty() {
                result.push('-');
            }
            result.push(character.to_ascii_lowercase());
            separated = false;
        } else {
            separated = true;
        }
    }
    result
}

fn operate(action: &str, text: &str) -> Option<String> {
    match action {
        "fnv1a" => Some(fnv1a(text.as_bytes())),
        "crc32" => Some(crc32(text.as_bytes())),
        "unicode-count" => Some(text.chars().count().to_string()),
        "word-count" => Some(text.split_whitespace().count().to_string()),
        "line-count" => Some(text.lines().count().to_string()),
        "unicode-reverse" => Some(text.chars().rev().collect()),
        "slug" => Some(slug(text)),
        _ => None,
    }
}

fn main() -> ExitCode {
    let mut args = env::args().skip(1);
    let Some(action) = args.next() else {
        return ExitCode::FAILURE;
    };
    if args.next().is_some() {
        return ExitCode::FAILURE;
    }
    let mut text = String::new();
    if io::stdin().take(LIMIT + 1).read_to_string(&mut text).is_err() || text.len() as u64 > LIMIT {
        return ExitCode::FAILURE;
    }
    let Some(output) = operate(&action, &text) else {
        return ExitCode::FAILURE;
    };
    match io::stdout().write_all(output.as_bytes()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(_) => ExitCode::FAILURE,
    }
}

#[cfg(test)]
mod tests {
    use super::operate;

    #[test]
    fn known_checksums() {
        assert_eq!(operate("fnv1a", "hello").unwrap(), "a430d84680aabd0b");
        assert_eq!(operate("crc32", "123456789").unwrap(), "cbf43926");
    }

    #[test]
    fn unicode_and_slug() {
        assert_eq!(operate("unicode-count", "Aż🦀").unwrap(), "3");
        assert_eq!(operate("unicode-reverse", "Aż🦀").unwrap(), "🦀żA");
        assert_eq!(operate("slug", "  Hello + Rust 42 ! ").unwrap(), "hello-rust-42");
        assert_eq!(operate("word-count", "Hello\tRust\n42").unwrap(), "3");
    }
}
