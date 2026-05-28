import time
import requests
import sys

try:
    from stem import Signal
    from stem.control import Controller
except ImportError:
    print("Missing 'stem' library. Install it with: pip3 install stem requests PySocks")
    sys.exit(1)

# Ensure PySocks is available for the requests module
try:
    import socks
except ImportError:
    print("Missing 'PySocks' library. Install it with: pip3 install PySocks")
    sys.exit(1)

TOR_SOCKS_PORT = 9050
TOR_CONTROL_PORT = 9051

def get_current_ip():
    """Fetch the public IP using the Tor SOCKS proxy."""
    proxies = {
        'http': f'socks5h://127.0.0.1:{TOR_SOCKS_PORT}',
        'https': f'socks5h://127.0.0.1:{TOR_SOCKS_PORT}'
    }
    try:
        response = requests.get('https://api.ipify.org?format=json', proxies=proxies, timeout=10)
        return response.json()['ip']
    except Exception as e:
        return f"Failed to get IP: {e}"

def print_circuits(controller):
    """Fetch and print the active Tor circuits and the nodes they bounce through."""
    print("\n\033[96m[*] Active Tor Circuits (How your traffic is bouncing):\033[0m")
    try:
        for circ in controller.get_circuits():
            if circ.status != "BUILT":
                continue
            
            path = []
            for i, entry in enumerate(circ.path):
                fingerprint = entry[0]
                nickname = entry[1]
                
                # Try to get the node's IP address from the consensus
                try:
                    desc = controller.get_network_status(fingerprint)
                    ip = desc.address
                except:
                    ip = "Unknown"
                
                path.append(f"({ip}) [{nickname}]")
            
            print(f"    Circuit {circ.id}: " + " ➔ ".join(path))
            # Just print the first built circuit to avoid terminal clutter
            break
            
    except Exception as e:
        print(f"Could not fetch circuits: {e}")

def main():
    print("\033[95m\033[1m--- REAL TOR NETWORK CONNECTION DEMO ---\033[0m\n")
    
    try:
        # Connect to the Tor Control Port
        # Note: This requires Tor to be running locally (e.g., `brew services start tor`)
        # and the ControlPort to be enabled in the torrc file.
        with Controller.from_port(port=TOR_CONTROL_PORT) as controller:
            controller.authenticate()  # Authenticate with Tor (assumes no password or cookie auth)
            
            print("\033[92m[+] Successfully authenticated with the local Tor service.\033[0m")
            print(f"Tor Version: {controller.get_version()}")
            
            # Step 1: Get Initial IP
            print("\n\033[93m[*] Fetching current public IP through Tor...\033[0m")
            ip1 = get_current_ip()
            print(f"\033[1mCurrent Exit IP:\033[0m \033[91m{ip1}\033[0m")
            
            # Print the circuits
            print_circuits(controller)
            
            # Step 2: Send NEWNYM to rotate identity
            print("\n\033[93m[!] Sending NEWNYM signal to rotate Tor Identity...\033[0m")
            controller.signal(Signal.NEWNYM)
            time.sleep(3) # Wait a few seconds for the new circuit to build
            
            # Step 3: Get New IP
            print("\033[92m[+] New identity requested. Fetching new public IP...\033[0m")
            ip2 = get_current_ip()
            print(f"\033[1mNew Exit IP:\033[0m \033[91m{ip2}\033[0m")
            
            print_circuits(controller)
            
            print("\n\033[92m[✓] Demonstration Complete. Traffic was successfully routed and rotated over the real Tor network!\033[0m")

    except Exception as e:
        print(f"\033[91m[Error] Could not connect to Tor Control Port.\033[0m")
        print(e)
        print("\n\033[93mTroubleshooting:\033[0m")
        print("1. Ensure Tor is installed: `brew install tor`")
        print("2. Ensure Tor is running: `tor --ControlPort 9051 --CookieAuthentication 1`")
        sys.exit(1)

if __name__ == "__main__":
    main()
