use idontfuckingbelieveit_proof_kernel::{evaluate, ProofInput};
use std::{env, fs, io::{self, Read}, process};

fn main() {
    let source = match env::args().nth(1) {
        Some(path) => fs::read_to_string(path).unwrap_or_else(|error| {
            eprintln!("failed to read input: {error}");
            process::exit(2);
        }),
        None => {
            let mut input = String::new();
            io::stdin().read_to_string(&mut input).unwrap_or_else(|error| {
                eprintln!("failed to read stdin: {error}");
                process::exit(2);
            });
            input
        }
    };

    let input: ProofInput = serde_json::from_str(&source).unwrap_or_else(|error| {
        eprintln!("invalid proof input: {error}");
        process::exit(2);
    });

    match evaluate(&input) {
        Ok(journal) => println!("{}", serde_json::to_string_pretty(&journal).expect("serialize")),
        Err(error) => {
            eprintln!("policy rejected: {error}");
            process::exit(1);
        }
    }
}
