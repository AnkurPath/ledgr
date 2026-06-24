use clap::Parser;

#[derive(Parser)]
struct Cli {
    username: String,
    password: String,
}

fn main() {
    let cli = Cli::parse();

    println!("Hello, {}!", cli.username);
    print!("Password: {}", cli.password);
}
