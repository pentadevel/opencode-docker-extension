#!/usr/bin/env nu

# Interactive NuShell Script
# This demonstrates interactive prompts in the VSCode extension

print "🚀 Welcome to Interactive NuShell!\n"

# Get user's name
print "What is your name?"
let name = input

print $"\nHello, ($name)! Nice to meet you.\n"

# Ask a question
print "What would you like to do today?"
print "1. Check system info"
print "2. List files"
print "3. Exit"
print "\nEnter your choice (1-3):"

let choice = input

match $choice {
    "1" => {
        print "\n📊 System Information:"
        print $"  - User: (whoami)"
        print $"  - Date: (date now | format date '%Y-%m-%d %H:%M:%S')"
        print $"  - PWD: (pwd)"
    }
    "2" => {
        print "\n📁 Files in current directory:"
        ls | select name type size | first 10
    }
    "3" => {
        print "\n👋 Goodbye!"
    }
    _ => {
        print "\n❌ Invalid choice"
    }
}

print "\n✅ Script completed!"