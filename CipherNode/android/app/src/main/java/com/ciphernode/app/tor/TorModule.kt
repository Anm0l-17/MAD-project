package com.ciphernode.app.tor

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class TorModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val listener: (TorStatus) -> Unit = { status ->
        sendStatus(status)
    }

    init {
        TorManager.addListener(listener)
    }

    override fun getName(): String = "TorModule"

    @ReactMethod
    fun startTor(promise: Promise) {
        try {
            val intent = Intent(reactContext, TorForegroundService::class.java)
            intent.action = TorForegroundService.ACTION_START
            ContextCompat.startForegroundService(reactContext, intent)
            TorManager.start(reactContext)
            promise.resolve(statusToMap(TorManager.getStatus()))
        } catch (e: Exception) {
            promise.reject("TOR_START_FAILED", e)
        }
    }

    @ReactMethod
    fun stopTor(promise: Promise) {
        try {
            val intent = Intent(reactContext, TorForegroundService::class.java)
            intent.action = TorForegroundService.ACTION_STOP
            reactContext.startService(intent)
            TorManager.stop()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("TOR_STOP_FAILED", e)
        }
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        promise.resolve(statusToMap(TorManager.getStatus()))
    }

    private fun sendStatus(status: TorStatus) {
        val emitter = reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        emitter.emit("TorStatus", statusToMap(status))
    }

    private fun statusToMap(status: TorStatus) = Arguments.createMap().apply {
        putBoolean("running", status.running)
        putBoolean("bootstrapped", status.bootstrapped)
        putInt("progress", status.progress)
        putString("status", status.status)
        putInt("socksPort", status.socksPort)
        putString("lastError", status.lastError)
    }
}
