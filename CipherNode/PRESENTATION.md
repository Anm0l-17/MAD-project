# 🛡️ CipherNode: Technical Logic & Architecture

### 1. The Core Concept: "P2P via Blind Relay"
CipherNode is designed as a **Peer-to-Peer (P2P)** messenger that doesn't require a central database of messages. Instead, it uses a **Relay Server** that acts as a "blind postman"—it moves messages between phones but cannot read them.

### 2. Connection to "Onion Services"
While the app currently runs over standard internet protocols (WebSockets) for performance, it uses the **logic of Onion Routing**:
*   **Identity as Address**: Every phone generates a unique `Node ID` (e.g., `5f3e...8a9b.onion`). This isn't just a username; it’s a cryptographic fingerprint of the device.
*   **Anonymity**: In a full production environment, the Socket.io traffic would be routed through the **Tor Network**, making the physical location (IP address) of the phones impossible to trace.

### 3. How 2 Phones Communicate (The Handshake)
Communication is established through a **Physical Handshake (QR Discovery)**:
1.  **Discovery**: Phone A generates a QR code containing its `Node ID` and `Public Name`.
2.  **Scanning**: Phone B scans the QR code. This creates a unique `Room ID` by sorting and combining both Node IDs (e.g., `ID_A + ID_B = Unique_Room_ID`).
3.  **Signaling**: The scanner (Phone B) tells the Relay Server: *"I want to talk to Phone A in this Room."* The Relay then automatically pulls Phone A into that private room.
4.  **No Discovery Server**: Users don't "search" for each other. You must scan a QR or share a link, preventing random spam or discovery by third parties.

### 4. Encryption Method: AES-256 (E2EE)
The app uses **AES-256 (Advanced Encryption Standard)**, the same level of encryption used by banks and governments.

*   **End-to-End Encryption (E2EE)**: The encryption key is stored only on the phones.
*   **The Relay is "Zero-Knowledge"**: When Phone A sends a message, it is encrypted **locally** before it ever leaves the device. The Relay Server sees only a scrambled "Ciphertext" (e.g., `U2FsdGVkX1...`).
*   **Decryption**: Only Phone B has the matching key to turn that ciphertext back into a readable message.

### 5. Crucial Info for Presentation Points
*   **Volatile Memory**: Messages are not stored on a central server. Once both phones disconnect, the Relay "forgets" the room existed.
*   **Burn-on-Read**: The app supports self-destructing messages that delete themselves from the device's local storage after a set time.
*   **Dual-World Architecture**: Mention the "Ghost World" (Secure Chat) vs "Decoy World" (The Study Assistant/Notes app) to show how the app hides in plain sight.

---

# 🚀 How to Run the App

To present the app, you need to run both the **Relay Server** (Backend) and the **Mobile App** (Frontend).

### Step 1: Start the Relay Server (On your Laptop)
Open your terminal in the `CipherNode` folder and run:
`node server.js`
> **Important:** Look at the terminal output. It will show an IP address like `http://192.168.1.XX:3001` or `http://10.210.17.61:3001`. You must copy this IP.

### Step 2: Configure the App
1.  Open `src/utils/socket.js` in your code editor.
2.  Update the `SERVER_URL` with the IP address from Step 1:
    `export const SERVER_URL = 'http://192.168.1.XX:3001'; `

### Step 3: Start the Mobile App
In a new terminal window inside the `CipherNode` folder, run:
`npx expo start`
1.  **For Android/iOS**: Scan the QR code shown in the terminal using the **Expo Go** app on two different phones (make sure they are on the same WiFi network as your laptop).
2.  **For Presentation**: You can also press `w` to open it in a web browser, but the QR scanning feature works best on physical devices.

### Step 4: The Demo Flow
1.  On **Phone A**: Tap "Connect Peer" -> "My QR".
2.  On **Phone B**: Tap "Connect Peer" -> "Scan Peer".
3.  Scan the QR code. The chat room will open automatically on both phones.
4.  Send a message to show the real-time, encrypted communication.
