package com.ciphernode.app.tor

import android.content.Context
import android.util.Log
import org.torproject.android.binary.TorResourceInstaller
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.ProxySelector
import java.net.Socket
import java.net.URI
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicReference

object TorManager {
    private const val TAG = "TorManager"
    private const val SOCKS_PORT = 9050
    private const val BOOTSTRAP_TIMEOUT_MS = 60000L

    private val listeners = CopyOnWriteArrayList<(TorStatus) -> Unit>()
    private val statusRef = AtomicReference(
        TorStatus(
            running = false,
            bootstrapped = false,
            progress = 0,
            status = "Tor stopped",
            socksPort = SOCKS_PORT,
            lastError = null
        )
    )

    @Volatile
    private var torProcess: Process? = null

    @Volatile
    private var proxySelectorBefore: ProxySelector? = null

    private val lock = Any()

    fun addListener(listener: (TorStatus) -> Unit) {
        listeners.add(listener)
        listener(statusRef.get())
    }

    fun removeListener(listener: (TorStatus) -> Unit) {
        listeners.remove(listener)
    }

    fun getStatus(): TorStatus = statusRef.get()

    fun start(context: Context) {
        synchronized(lock) {
            if (torProcess != null) return
            try {
                val torBaseDir = context.filesDir
                val torDir = File(torBaseDir, "tor")
                torDir.mkdirs()

                TorResourceInstaller(context, torBaseDir).installResources()

                val torBinary = findTorBinary(torBaseDir)
                if (torBinary == null) {
                    updateStatus(
                        statusRef.get().copy(
                            running = false,
                            bootstrapped = false,
                            status = "Tor binary not found",
                            lastError = "Tor binary not found"
                        )
                    )
                    return
                }

                val dataDir = File(torDir, "data")
                dataDir.mkdirs()
                val torrc = File(torDir, "torrc")
                torrc.writeText(buildTorrc(dataDir))

                val builder = ProcessBuilder(torBinary.absolutePath, "-f", torrc.absolutePath)
                builder.directory(torDir)
                builder.redirectErrorStream(true)
                builder.environment()["HOME"] = torDir.absolutePath
                torProcess = builder.start()

                applySocksProxy()
                updateStatus(
                    statusRef.get().copy(
                        running = true,
                        bootstrapped = false,
                        progress = 0,
                        status = "Starting Tor",
                        lastError = null
                    )
                )

                startLogReader(torProcess!!)
                startBootstrapMonitor()
            } catch (e: Exception) {
                Log.e(TAG, "Tor start failed", e)
                updateStatus(
                    statusRef.get().copy(
                        running = false,
                        bootstrapped = false,
                        status = "Tor start failed",
                        lastError = e.message
                    )
                )
            }
        }
    }

    fun stop() {
        synchronized(lock) {
            torProcess?.destroy()
            torProcess = null
            restoreProxySelector()
            updateStatus(
                statusRef.get().copy(
                    running = false,
                    bootstrapped = false,
                    progress = 0,
                    status = "Tor stopped"
                )
            )
        }
    }

    private fun startLogReader(process: Process) {
        Thread {
            val reader = BufferedReader(InputStreamReader(process.inputStream))
            reader.forEachLine { line ->
                parseTorLog(line)
            }
            if (torProcess == process) {
                updateStatus(
                    statusRef.get().copy(
                        running = false,
                        bootstrapped = false,
                        status = "Tor exited"
                    )
                )
            }
        }.start()
    }

    private fun startBootstrapMonitor() {
        Thread {
            val start = System.currentTimeMillis()
            while (System.currentTimeMillis() - start < BOOTSTRAP_TIMEOUT_MS) {
                if (torProcess?.isAlive != true) return@Thread
                if (isSocksReady()) {
                    updateStatus(
                        statusRef.get().copy(
                            running = true,
                            bootstrapped = true,
                            progress = 100,
                            status = "Bootstrapped"
                        )
                    )
                    return@Thread
                }
                Thread.sleep(1000)
            }
            if (!statusRef.get().bootstrapped) {
                updateStatus(
                    statusRef.get().copy(
                        running = torProcess?.isAlive == true,
                        status = "Bootstrap timeout",
                        lastError = "Tor bootstrap timed out"
                    )
                )
            }
        }.start()
    }

    private fun parseTorLog(line: String) {
        val regex = Regex("Bootstrapped (\\d+)%: (.+)")
        val match = regex.find(line)
        if (match != null) {
            val progress = match.groupValues[1].toIntOrNull() ?: 0
            val statusText = match.groupValues[2]
            val bootstrapped = progress >= 100
            updateStatus(
                statusRef.get().copy(
                    running = true,
                    bootstrapped = bootstrapped,
                    progress = progress,
                    status = statusText,
                    lastError = null
                )
            )
        }
    }

    private fun isSocksReady(): Boolean {
        return try {
            Socket().use { socket ->
                socket.connect(InetSocketAddress("127.0.0.1", SOCKS_PORT), 1500)
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun updateStatus(status: TorStatus) {
        statusRef.set(status)
        listeners.forEach { it(status) }
    }

    private fun buildTorrc(dataDir: File): String {
        return """
            DataDirectory ${dataDir.absolutePath}
            SOCKSPort $SOCKS_PORT
            ClientOnly 1
            AvoidDiskWrites 1
            SafeLogging 1
            Log notice stdout
        """.trimIndent()
    }

    private fun findTorBinary(root: File): File? {
        if (!root.exists()) return null
        return root.walkTopDown()
            .firstOrNull { it.isFile && it.name == "tor" && it.canExecute() }
    }

    private fun applySocksProxy() {
        if (proxySelectorBefore == null) {
            proxySelectorBefore = ProxySelector.getDefault()
        }
        ProxySelector.setDefault(object : ProxySelector() {
            override fun select(uri: URI?): MutableList<Proxy> {
                val proxy = Proxy(Proxy.Type.SOCKS, InetSocketAddress("127.0.0.1", SOCKS_PORT))
                return mutableListOf(proxy)
            }

            override fun connectFailed(uri: URI?, sa: java.net.SocketAddress?, ioe: java.io.IOException?) {
                Log.w(TAG, "Proxy connect failed: $uri", ioe)
            }
        })
        System.setProperty("socksProxyHost", "127.0.0.1")
        System.setProperty("socksProxyPort", SOCKS_PORT.toString())
    }

    private fun restoreProxySelector() {
        proxySelectorBefore?.let { ProxySelector.setDefault(it) }
        proxySelectorBefore = null
        System.clearProperty("socksProxyHost")
        System.clearProperty("socksProxyPort")
    }
}
