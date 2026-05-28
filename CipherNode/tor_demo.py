import time
import random
import sys

# Sample data to simulate different global Tor nodes
COUNTRIES = [
    ("Germany", "DE", "192.145."), ("France", "FR", "45.12."), 
    ("Japan", "JP", "110.45."), ("Canada", "CA", "99.23."), 
    ("Brazil", "BR", "177.68."), ("Switzerland", "CH", "88.134."),
    ("Netherlands", "NL", "213.45."), ("Sweden", "SE", "81.23."),
    ("Singapore", "SG", "103.44."), ("Australia", "AU", "139.130.")
]

class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_slow(text, delay=0.03):
    """Prints text slowly for a 'hacker' terminal effect."""
    for char in text:
        sys.stdout.write(char)
        sys.stdout.flush()
        time.sleep(delay)
    print()

def generate_ip(prefix):
    return f"{prefix}{random.randint(1, 255)}.{random.randint(1, 255)}"

def build_circuit():
    """Builds a simulated 3-hop Tor circuit."""
    nodes = random.sample(COUNTRIES, 3)
    
    guard = {"type": "Guard Node (Entry)", "country": nodes[0][0], "code": nodes[0][1], "ip": generate_ip(nodes[0][2])}
    middle = {"type": "Relay Node (Middle)", "country": nodes[1][0], "code": nodes[1][1], "ip": generate_ip(nodes[1][2])}
    exit_node = {"type": "Exit Node", "country": nodes[2][0], "code": nodes[2][1], "ip": generate_ip(nodes[2][2])}
    
    return [guard, middle, exit_node]

def demonstrate_tor_connection():
    print(f"{Colors.HEADER}{Colors.BOLD}--- INITIALIZING CIPHERNODE TOR SIMULATION ---{Colors.ENDC}\n")
    time.sleep(1)
    
    # 1. Establish connection
    print_slow(f"{Colors.OKCYAN}[*] Connecting to the Tor Network...{Colors.ENDC}", 0.02)
    time.sleep(1)
    print_slow(f"{Colors.OKGREEN}[+] Bootstrapped 100%: Done{Colors.ENDC}")
    print()
    time.sleep(1)

    # 2. Build the circuit
    print_slow(f"{Colors.WARNING}[*] Constructing Tor Circuit (Bouncing IPs)...{Colors.ENDC}", 0.05)
    circuit = build_circuit()
    
    print(f"\n{Colors.BOLD}Your Device{Colors.ENDC} (Local IP: 192.168.1.45)")
    print("      │")
    
    for i, node in enumerate(circuit):
        time.sleep(1.5)
        print("      ▼")
        print(f"{Colors.OKBLUE}┌───────────────────────────────┐{Colors.ENDC}")
        print(f"{Colors.OKBLUE}│ {node['type'].ljust(29)} │{Colors.ENDC}")
        print(f"{Colors.OKBLUE}│ IP: {node['ip'].ljust(25)} │{Colors.ENDC}")
        print(f"{Colors.OKBLUE}│ Location: {node['country']} ({node['code']}){' ' * (15 - len(node['country']))}│{Colors.ENDC}")
        print(f"{Colors.OKBLUE}└───────────────────────────────┘{Colors.ENDC}")
        
    print("      │")
    time.sleep(1)
    print("      ▼")
    print(f"{Colors.FAIL}{Colors.BOLD}Target Server (CipherNode Relay){Colors.ENDC}")
    
    print("\n")
    time.sleep(1)
    
    # 3. Explain the result
    print_slow(f"{Colors.OKGREEN}[✓] Circuit established successfully.{Colors.ENDC}")
    print(f"The Target Server only sees the {Colors.BOLD}Exit Node IP ({circuit[2]['ip']}){Colors.ENDC}, keeping your real IP completely hidden.")
    print("\n")

def rotate_circuit():
    """Simulates requesting a new Tor identity."""
    print_slow(f"{Colors.WARNING}[!] Requesting NEWNYM (New Tor Identity)...{Colors.ENDC}")
    time.sleep(2)
    print_slow(f"{Colors.OKCYAN}[*] Tearing down old circuit...{Colors.ENDC}")
    time.sleep(1)
    print_slow(f"{Colors.OKGREEN}[+] Building new circuit...{Colors.ENDC}\n")
    time.sleep(1)
    
    circuit = build_circuit()
    
    print(f"{Colors.BOLD}New Exit Node IP:{Colors.ENDC} {Colors.FAIL}{circuit[2]['ip']}{Colors.ENDC} located in {circuit[2]['country']}")
    print_slow(f"{Colors.OKGREEN}[✓] Traffic is now bouncing through a completely different path.{Colors.ENDC}")

if __name__ == "__main__":
    try:
        demonstrate_tor_connection()
        time.sleep(2)
        
        # Simulate rotation
        rotate_circuit()
        
    except KeyboardInterrupt:
        print("\nSimulation aborted.")
        sys.exit(0)
