#!/usr/bin/env python3
"""
testEnvironment4Pbiviz.py

This script tests, repairs, and prepares the environment for building and packaging a Power BI custom visual.
It ensures Node.js, npm, and `powerbi-visuals-tools` are correctly installed and functional.
"""

import subprocess
import sys
import os
from pathlib import Path

# Constants
NODE_MIN_VERSION = 16
NODE_MAX_VERSION = 20
PBIVIZ_GLOBAL_PACKAGE = "powerbi-visuals-tools"
PACKAGE_JSON = Path("package.json")


def run_command(command, check=True, capture_output=False, text=True):
    """Run a shell command and return the result."""
    try:
        return subprocess.run(
            command,
            shell=True,
            check=check,
            capture_output=capture_output,
            text=text,
        )
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Command failed: {command}\n{e}", file=sys.stderr)
        sys.exit(1)


def check_node_version():
    """Check if Node.js is installed and within the required version range."""
    try:
        result = run_command("node -v", capture_output=True)
        version = result.stdout.strip().lstrip("v")
        major_version = int(version.split(".")[0])
        if NODE_MIN_VERSION <= major_version < NODE_MAX_VERSION:
            print(f"Node.js version {version} is compatible.")
        else:
            print(
                f"ERROR: Node.js version {version} is not compatible. "
                f"Please install a version >= {NODE_MIN_VERSION} and < {NODE_MAX_VERSION}."
            )
            prompt_user_to_fix_node()
    except FileNotFoundError:
        print("ERROR: Node.js is not installed. Please install Node.js.")
        prompt_user_to_fix_node()


def prompt_user_to_fix_node():
    """Prompt the user to fix Node.js installation."""
    response = input("Would you like to install Node.js 18 using nvm? (yes/no): ").strip().lower()
    if response in ["yes", "y"]:
        install_node_with_nvm()
    else:
        print("Node.js must be installed and compatible to proceed. Exiting.")
        sys.exit(1)


def install_node_with_nvm():
    """Install Node.js 18 using nvm."""
    print("Installing Node.js 18 using nvm...")
    nvm_dir = "/usr/local/share/nvm"
    nvm_script = f"{nvm_dir}/nvm.sh"

    if not Path(nvm_script).exists():
        print("ERROR: nvm is not installed. Please install nvm manually and re-run the script.")
        sys.exit(1)

    try:
        # Load nvm and install Node.js 18
        run_command(f". {nvm_script} && nvm install 18 && nvm use 18")
        print("Node.js 18 has been installed and activated.")
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Failed to install Node.js 18 using nvm. {e}")
        sys.exit(1)


def check_npm():
    """Check if npm is installed."""
    try:
        result = run_command("npm -v", capture_output=True)
        print(f"npm version {result.stdout.strip()} is installed.")
    except FileNotFoundError:
        print("ERROR: npm is not installed. Please install npm.")
        sys.exit(1)


def check_pbiviz():
    """Check if `powerbi-visuals-tools` is installed globally."""
    try:
        result = run_command("pbiviz --version", capture_output=True)
        print(f"`powerbi-visuals-tools` (pbiviz) version {result.stdout.strip()} is installed.")
    except FileNotFoundError:
        print("`powerbi-visuals-tools` is not installed globally. Installing it now...")
        run_command("npm install -g powerbi-visuals-tools")
        print("`powerbi-visuals-tools` has been installed globally.")


def check_dependencies():
    """Check if all dependencies in package.json are installed."""
    if not PACKAGE_JSON.exists():
        print("ERROR: package.json not found in the current directory.")
        sys.exit(1)

    print("Checking dependencies in package.json...")
    try:
        run_command("npm install")
        print("All dependencies are installed.")
    except subprocess.CalledProcessError:
        print("ERROR: Failed to install dependencies. Please check your package.json file.")
        sys.exit(1)


def package_visual():
    """Attempt to package the Power BI visual."""
    print("Packaging the Power BI visual...")
    try:
        run_command("npx pbiviz package --verbose")
        print("The Power BI visual has been successfully packaged.")
    except subprocess.CalledProcessError:
        print("ERROR: Failed to package the Power BI visual. Please check for errors above.")
        sys.exit(1)


def main():
    """Main function to test and repair the environment."""
    print("Testing and repairing the environment for Power BI custom visuals...\n")

    # Step 1: Check Node.js version
    check_node_version()

    # Step 2: Check npm installation
    check_npm()

    # Step 3: Check `powerbi-visuals-tools` (pbiviz)
    check_pbiviz()

    # Step 4: Check and install dependencies
    check_dependencies()

    # Step 5: Package the visual
    package_visual()

    print("\nEnvironment is ready, and the visual has been packaged successfully.")


if __name__ == "__main__":
    main()

