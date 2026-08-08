use std::path::Path;

fn main() {
    for value in [
        "../bin",
        r"..\bin",
        "/usr/bin",
        r"\tool\bin",
        r"C:\tool\bin",
        r"C:tool\bin",
        r"\\server\share",
        "//server/share",
        "bin/tool",
        r"bin\tool.exe",
        "tools/v1/bin",
    ] {
        let path = Path::new(value);
        println!(
            "{value}|absolute={}|root={}",
            path.is_absolute(),
            path.has_root()
        );
    }
}
