package com.ciphernode.app.bluetooth

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.nio.charset.Charset
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class BluetoothModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val TAG = "BluetoothModule"
    private val SERVICE_NAME = "CipherNodeP2P"
    private val P2P_UUID = UUID.fromString("c0fecafe-baad-f00d-cafe-babebabe2026")

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        val bluetoothManager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bluetoothManager?.adapter
    }

    private val executor: ExecutorService = Executors.newCachedThreadPool()
    
    private var serverThread: ServerThread? = null
    private var connectThread: ConnectThread? = null
    private var connectedThread: ConnectedThread? = null

    private var targetPeerId: String? = null
    private var isScanning = false
    private var receiverRegistered = false

    override fun getName(): String = "BluetoothModule"

    private val bluetoothDeviceReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val action = intent.action
            if (BluetoothDevice.ACTION_FOUND == action) {
                val device: BluetoothDevice? = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE)
                try {
                    val deviceName = device?.name
                    Log.d(TAG, "Found device: $deviceName (${device?.address}), RSSI: $rssi")

                    // AirDrop-style broad discovery
                    if (deviceName != null && deviceName.startsWith("CipherNode_")) {
                        val parts = deviceName.split("_")
                        if (parts.size >= 3) {
                            val discoveredPhone = parts[1]
                            val discoveredPeerId = parts[2]
                            val deviceDisplayName = parts.getOrNull(3) ?: "Nearby Peer"
                            sendEvent("onBluetoothDeviceDiscovered", Arguments.createMap().apply {
                                putString("peerId", discoveredPeerId)
                                putString("phoneNumber", discoveredPhone)
                                putString("displayName", deviceDisplayName)
                                putInt("rssi", rssi.toInt())
                                putString("address", device?.address)
                            })
                        }
                    }

                    if (deviceName != null && targetPeerId != null && targetPeerId!!.isNotEmpty() && deviceName.contains("CipherNode_$targetPeerId")) {
                        val rssiThreshold = -80
                        if (rssi >= rssiThreshold) {
                            Log.d(TAG, "Target device found in proximity range (RSSI: $rssi). Attempting connection...")
                            stopDiscoveryInternal()
                            device?.let { connectToDevice(it) }
                        } else {
                            Log.d(TAG, "Target device found but out of range (RSSI: $rssi < $rssiThreshold). Proximity guard active.")
                            sendEvent("onBluetoothDeviceOutOfRange", Arguments.createMap().apply {
                                putString("deviceName", deviceName)
                                putInt("rssi", rssi.toInt())
                            })
                        }
                    }
                } catch (e: SecurityException) {
                    Log.e(TAG, "SecurityException during device discovery processing", e)
                }
            } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED == action) {
                Log.d(TAG, "Discovery finished.")
                isScanning = false
                sendEvent("onBluetoothDiscoveryStatus", Arguments.createMap().apply {
                    putBoolean("scanning", false)
                })
            }
        }
    }

    @ReactMethod
    fun isBluetoothSupported(promise: Promise) {
        promise.resolve(bluetoothAdapter != null)
    }

    @ReactMethod
    fun isBluetoothEnabled(promise: Promise) {
        try {
            promise.resolve(bluetoothAdapter?.isEnabled ?: false)
        } catch (e: SecurityException) {
            promise.reject("PERM_ERROR", "Permission missing to check enabled status: ${e.message}")
        }
    }

    @ReactMethod
    fun startBluetoothServer(myPeerId: String, myPhoneNumber: String, myDisplayName: String, promise: Promise) {
        val adapter = bluetoothAdapter
        if (adapter == null) {
            promise.reject("NOT_SUPPORTED", "Bluetooth not supported on this device")
            return
        }

        try {
            // Dynamically set adapter local name to CipherNode_<phoneNumber>_<myPeerId>_<displayName> so peer can find us!
            val sanitizedName = myDisplayName.replace("_", " ").trim()
            val expectedName = "CipherNode_${myPhoneNumber}_${myPeerId}_${sanitizedName}"
            if (adapter.name != expectedName) {
                adapter.name = expectedName
                Log.d(TAG, "Set local Bluetooth name to: $expectedName")
            }

            // Start RFCOMM server socket
            serverThread?.cancel()
            serverThread = ServerThread()
            executor.execute(serverThread)

            promise.resolve(true)
        } catch (e: SecurityException) {
            promise.reject("PERM_ERROR", "Permission missing to start Bluetooth server: ${e.message}")
        } catch (e: Exception) {
            promise.reject("SERVER_ERROR", "Failed to start Bluetooth server: ${e.message}")
        }
    }

    @ReactMethod
    fun startBluetoothDiscovery(theirPeerId: String, promise: Promise) {
        val adapter = bluetoothAdapter
        if (adapter == null) {
            promise.reject("NOT_SUPPORTED", "Bluetooth not supported on this device")
            return
        }

        try {
            targetPeerId = theirPeerId
            
            // Register BroadcastReceiver for discovery if not already done
            if (!receiverRegistered) {
                val filter = IntentFilter().apply {
                    addAction(BluetoothDevice.ACTION_FOUND)
                    addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
                }
                reactContext.registerReceiver(bluetoothDeviceReceiver, filter)
                receiverRegistered = true
            }

            if (adapter.isDiscovering) {
                adapter.cancelDiscovery()
            }

            val success = adapter.startDiscovery()
            isScanning = success
            Log.d(TAG, "Bluetooth discovery started: $success")

            sendEvent("onBluetoothDiscoveryStatus", Arguments.createMap().apply {
                putBoolean("scanning", success)
            })

            promise.resolve(success)
        } catch (e: SecurityException) {
            promise.reject("PERM_ERROR", "Permission missing to run Bluetooth discovery: ${e.message}")
        } catch (e: Exception) {
            promise.reject("DISCOVERY_ERROR", "Failed to start discovery: ${e.message}")
        }
    }

    @ReactMethod
    fun sendMessage(payload: String, promise: Promise) {
        val activeThread = connectedThread
        if (activeThread == null) {
            promise.reject("NOT_CONNECTED", "No active peer connection")
            return
        }
        activeThread.write(payload.toByteArray(Charset.forName("UTF-8")))
        promise.resolve(true)
    }

    @ReactMethod
    fun disconnect(promise: Promise) {
        disconnectInternal()
        promise.resolve(true)
    }

    private fun stopDiscoveryInternal() {
        try {
            if (bluetoothAdapter?.isDiscovering == true) {
                bluetoothAdapter?.cancelDiscovery()
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException while canceling discovery", e)
        }
        isScanning = false
        sendEvent("onBluetoothDiscoveryStatus", Arguments.createMap().apply {
            putBoolean("scanning", false)
        })
    }

    private fun disconnectInternal() {
        stopDiscoveryInternal()
        
        targetPeerId = null
        
        serverThread?.cancel()
        serverThread = null
        
        connectThread?.cancel()
        connectThread = null
        
        connectedThread?.cancel()
        connectedThread = null

        if (receiverRegistered) {
            try {
                reactContext.unregisterReceiver(bluetoothDeviceReceiver)
            } catch (e: IllegalArgumentException) {
                // Ignore if not registered
            }
            receiverRegistered = false
        }
    }

    private fun connectToDevice(device: BluetoothDevice) {
        connectThread?.cancel()
        connectThread = ConnectThread(device)
        executor.execute(connectThread)
    }

    private fun manageConnectedSocket(socket: BluetoothSocket) {
        Log.d(TAG, "Managing connected socket...")
        connectedThread?.cancel()
        connectedThread = ConnectedThread(socket)
        executor.execute(connectedThread)

        // Notify JS of successful peer connection
        var remoteDeviceName = "Unknown Peer"
        try {
            remoteDeviceName = socket.remoteDevice.name ?: "Peer Device"
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException reading remote device name", e)
        }

        var extractedPeerId = ""
        var extractedPhone = ""
        if (remoteDeviceName.startsWith("CipherNode_")) {
            val parts = remoteDeviceName.split("_")
            if (parts.size >= 3) {
                extractedPhone = parts[1]
                extractedPeerId = parts[2]
            }
        }

        sendEvent("onBluetoothPeerConnected", Arguments.createMap().apply {
            putString("peerName", remoteDeviceName)
            putString("peerId", extractedPeerId)
            putString("phoneNumber", extractedPhone)
        })
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    // ── Server Socket Thread ──────────────────────────────────────────────────
    private inner class ServerThread : Runnable {
        private var serverSocket: BluetoothServerSocket? = null

        init {
            try {
                serverSocket = bluetoothAdapter?.listenUsingInsecureRfcommWithServiceRecord(
                    SERVICE_NAME,
                    P2P_UUID
                )
            } catch (e: SecurityException) {
                Log.e(TAG, "SecurityException establishing RFCOMM Server socket", e)
            } catch (e: IOException) {
                Log.e(TAG, "Socket listen() failed", e)
            }
        }

        override fun run() {
            var socket: BluetoothSocket? = null
            Log.d(TAG, "Server listening thread started...")
            while (serverSocket != null) {
                try {
                    socket = serverSocket?.accept()
                } catch (e: IOException) {
                    Log.e(TAG, "Socket accept() failed", e)
                    break
                }

                if (socket != null) {
                    synchronized(this@BluetoothModule) {
                        manageConnectedSocket(socket)
                        serverSocket?.close()
                        serverSocket = null
                    }
                    break
                }
            }
        }

        fun cancel() {
            try {
                serverSocket?.close()
                serverSocket = null
            } catch (e: IOException) {
                Log.e(TAG, "Server socket close failed", e)
            }
        }
    }

    // ── Client Connect Thread ─────────────────────────────────────────────────
    private inner class ConnectThread(private val device: BluetoothDevice) : Runnable {
        private var socket: BluetoothSocket? = null

        init {
            try {
                socket = device.createInsecureRfcommSocketToServiceRecord(P2P_UUID)
            } catch (e: IOException) {
                Log.e(TAG, "Socket creation failed", e)
            }
        }

        override fun run() {
            if (socket == null) return
            Log.d(TAG, "Client connection thread started...")
            try {
                // Cancel discovery before connecting because discovery hogs bandwidth
                stopDiscoveryInternal()
                socket?.connect()
                Log.d(TAG, "Connection handshake successful!")
            } catch (e: SecurityException) {
                Log.e(TAG, "SecurityException during connect", e)
                cancel()
                return
            } catch (e: IOException) {
                Log.e(TAG, "Client socket connect failed. Retrying Server mode...", e)
                cancel()
                return
            }

            socket?.let {
                synchronized(this@BluetoothModule) {
                    connectThread = null
                    manageConnectedSocket(it)
                }
            }
        }

        fun cancel() {
            try {
                socket?.close()
                socket = null
            } catch (e: IOException) {
                Log.e(TAG, "Client socket close failed", e)
            }
        }
    }

    // ── Active Stream Connection Thread ───────────────────────────────────────
    private inner class ConnectedThread(private val socket: BluetoothSocket) : Runnable {
        private var inputStream: InputStream? = null
        private var outputStream: OutputStream? = null

        init {
            try {
                inputStream = socket.inputStream
                outputStream = socket.outputStream
            } catch (e: IOException) {
                Log.e(TAG, "Error obtaining streams", e)
            }
        }

        override fun run() {
            val buffer = ByteArray(4096)
            var bytes: Int
            Log.d(TAG, "Data stream listener active...")
            while (inputStream != null) {
                try {
                    bytes = inputStream?.read(buffer) ?: -1
                    if (bytes > 0) {
                        val incomingMessage = String(buffer, 0, bytes, Charset.forName("UTF-8"))
                        Log.d(TAG, "Received message: $incomingMessage")
                        sendEvent("onBluetoothMessageReceived", Arguments.createMap().apply {
                            putString("message", incomingMessage)
                        })
                    }
                } catch (e: IOException) {
                    Log.e(TAG, "Input stream disconnected", e)
                    sendEvent("onBluetoothPeerDisconnected", Arguments.createMap())
                    break
                }
            }
        }

        fun write(bytes: ByteArray) {
            try {
                outputStream?.write(bytes)
                outputStream?.flush()
            } catch (e: IOException) {
                Log.e(TAG, "Error writing to output stream", e)
            }
        }

        fun cancel() {
            try {
                inputStream?.close()
                outputStream?.close()
                socket.close()
            } catch (e: IOException) {
                Log.e(TAG, "Socket streams close failed", e)
            }
        }
    }
}
