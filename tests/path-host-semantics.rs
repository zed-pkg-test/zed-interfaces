use std::path::Path;

fn main() {
    for value in [
        "../bin",
        "/usr/bin",
        r"C:\tool\bin",
        r"\\server\share",
        "bin/tool",
    ] {
        let path = Path::new(value);
        println!(
            "{value}|absolute={}|root={}",
            path.is_absolute(),
            path.has_root()
        );
    }
}
