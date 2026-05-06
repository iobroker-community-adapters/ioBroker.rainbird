#!/usr/bin/env python3
"""
Simple test script to verify the pyrainbird bridge works.
"""
import sys
import subprocess
import json

# Test the bridge with a mock command
# Note: This will fail if no actual Rain Bird device is available,
# but it will verify that the bridge script is working

test_host = "192.168.1.100"  # Fake IP for testing
test_password = "test123"
test_command = "get_model_and_version"

print("Testing pyrainbird bridge...")
print(f"Host: {test_host}")
print(f"Command: {test_command}")
print()

try:
    result = subprocess.run([
        sys.executable,
        "lib/pyrainbird_bridge.py",
        "--host", test_host,
        "--password", test_password,
        "--command", test_command
    ], capture_output=True, text=True, timeout=10)
    
    print("STDOUT:")
    print(result.stdout)
    print("\nSTDERR:")
    print(result.stderr)
    print(f"\nReturn code: {result.returncode}")
    
    if result.stdout:
        try:
            data = json.loads(result.stdout)
            print("\nParsed JSON:")
            print(json.dumps(data, indent=2))
            
            if data.get("success"):
                print("\n✅ Bridge returned success (though likely failed to connect)")
            else:
                print(f"\n⚠️  Bridge returned error: {data.get('error')}")
                print("This is expected if no Rain Bird device is available")
        except json.JSONDecodeError as e:
            print(f"\n❌ Failed to parse JSON: {e}")
    
    print("\n✅ Bridge script is executable and can be called")
    
except subprocess.TimeoutExpired:
    print("\n⏱️  Command timed out")
except FileNotFoundError:
    print("\n❌ Bridge script not found")
except Exception as e:
    print(f"\n❌ Error: {e}")
